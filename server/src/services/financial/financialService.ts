import mongoose from 'mongoose';
import { parse } from 'csv-parse/sync';
import {
  UserModel,
  AccountModel,
  TransactionModel,
  MandateModel,
  FinancialPlanModel,
  GoalModel,
  FamilyGroupModel,
  ITransaction,
  IMandate,
  IFinancialPlan,
} from '../../models';
import { pythonAnalyticsService } from '../analytics/analyticsService';
import { elasticIntegration } from '../../integrations/elastic';
import { bryntumIntegration } from '../../integrations/bryntum';
import { zapierIntegration } from '../../integrations/zapier';
import { recordAuditLog } from '../../middleware/security';
import { logger } from '../../config/logger';

export class CoreFinancialService {
  /**
   * Imports CSV transaction rows for a user account, updates balances in MongoDB,
   * detects recurring mandate patterns, flags unusual spend, and synchronises to Elastic.
   */
  async importTransactionsFromCsv(params: {
    userId: string;
    accountId?: string;
    csvContent: string;
  }): Promise<{
    importedCount: number;
    unusualDetectedCount: number;
    inferredMandatesCount: number;
    elasticSyncedCount: number;
    transactions: ITransaction[];
  }> {
    const userObjId = new mongoose.Types.ObjectId(params.userId);
    let account = params.accountId
      ? await AccountModel.findOne({ _id: params.accountId, userId: userObjId })
      : await AccountModel.findOne({ userId: userObjId, status: 'active' });

    if (!account) {
      account = await AccountModel.create({
        userId: userObjId,
        name: 'Primary Checking Account',
        institution: 'HDFC Bank',
        type: 'checking',
        accountNumberMasked: 'XXXX-4821',
        balance: 142500,
        currency: 'INR',
        isSharedWithFamily: false,
      });
    }

    const records: Record<string, string>[] = parse(params.csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const createdTransactions: ITransaction[] = [];
    let netBalanceDelta = 0;
    let unusualDetectedCount = 0;
    let elasticSyncedCount = 0;

    for (const row of records) {
      const amount = Math.abs(parseFloat(String(row.amount || row.Amount || '0').replace(/,/g, '')));
      if (!amount || isNaN(amount)) continue;

      const rawType = String(row.type || row.Type || 'expense').toLowerCase();
      const type: 'income' | 'expense' | 'transfer' =
        rawType === 'income' || rawType === 'credit' ? 'income' : rawType === 'transfer' ? 'transfer' : 'expense';

      const category = String(row.category || row.Category || 'General').trim();
      const merchant = String(row.merchant || row.Merchant || row.description || 'Merchant').trim();
      const description = String(row.description || row.Description || merchant).trim();
      const dateStr = row.date || row.Date || new Date().toISOString();
      const parsedDate = new Date(dateStr);
      const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

      const isUnusual = type === 'expense' && amount >= 12000 && !['Rent', 'Housing', 'Loan EMI'].includes(category);
      const unusualReason = isUnusual
        ? `High single transaction of ₹${amount.toLocaleString('en-IN')} in ${category} detected during import.`
        : undefined;

      if (isUnusual) unusualDetectedCount += 1;

      const tx = await TransactionModel.create({
        userId: userObjId,
        accountId: account._id as mongoose.Types.ObjectId,
        accountName: account.name,
        date: validDate,
        merchant,
        description,
        category,
        type,
        amount,
        currency: 'INR',
        status: isUnusual ? 'flagged' : 'completed',
        paymentMethod: (row.paymentMethod as any) || 'upi',
        isRecurring: String(row.isRecurring || '').toLowerCase() === 'true',
        isUnusual,
        unusualReason,
        isSharedFamilyTransaction: String(row.isShared || '').toLowerCase() === 'true',
        tags: ['csv-import', category.toLowerCase()],
      });

      if (type === 'income') {
        netBalanceDelta += amount;
      } else if (type === 'expense') {
        netBalanceDelta -= amount;
      }

      const synced = await elasticIntegration.syncTransaction(tx);
      if (synced) elasticSyncedCount += 1;
      createdTransactions.push(tx);
    }

    account.balance = Math.round((account.balance + netBalanceDelta) * 100) / 100;
    account.lastSyncedAt = new Date();
    await account.save();

    // Detect recurring mandates from transaction history
    const inferredMandates = await this.detectRecurringMandates(params.userId);

    // Sync calendar events
    await bryntumIntegration.syncUserFinancialCalendar(params.userId);

    await recordAuditLog({
      userId: params.userId,
      actor: 'user',
      action: 'csv_transactions_imported',
      resourceType: 'transaction',
      status: 'success',
      details: {
        importedCount: createdTransactions.length,
        unusualDetectedCount,
        inferredMandatesCount: inferredMandates.length,
      },
    });

    return {
      importedCount: createdTransactions.length,
      unusualDetectedCount,
      inferredMandatesCount: inferredMandates.length,
      elasticSyncedCount,
      transactions: createdTransactions,
    };
  }

  /**
   * Scans a user's transaction history to identify recurring payment patterns and creates
   * inferred Mandates (distinguished from user-confirmed Mandates).
   */
  async detectRecurringMandates(userId: string): Promise<IMandate[]> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const transactions = await TransactionModel.find({
      userId: userObjId,
      type: 'expense',
    }).sort({ date: -1 });

    // Group by merchant + approximate amount
    const merchantGroups = new Map<string, ITransaction[]>();
    for (const tx of transactions) {
      const key = `${tx.merchant.toLowerCase()}::${Math.round(tx.amount / 100) * 100}`;
      const list = merchantGroups.get(key) || [];
      list.push(tx);
      merchantGroups.set(key, list);
    }

    const newlyInferred: IMandate[] = [];
    for (const [, group] of merchantGroups.entries()) {
      if (group.length >= 2 || group.some((g) => g.isRecurring)) {
        const sample = group[0];
        const existing = await MandateModel.findOne({
          userId: userObjId,
          merchant: sample.merchant,
        });
        if (!existing) {
          const dueDay = new Date(sample.date).getDate();
          const now = new Date();
          const nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(dueDay, 28));
          const mappedCategory = this.mapToMandateCategory(sample.category);

          const created = await MandateModel.create({
            userId: userObjId,
            accountId: sample.accountId,
            title: `${sample.merchant} Recurring Mandate`,
            merchant: sample.merchant,
            category: mappedCategory,
            amount: sample.amount,
            currency: 'INR',
            frequency: 'monthly',
            dueDayOfMonth: dueDay,
            nextDueDate,
            status: 'inferred',
            confidenceScore: group.length >= 3 ? 0.94 : 0.82,
            autoPayEnabled: false,
            notes: `Automatically detected from ${group.length} historical transactions.`,
          });
          newlyInferred.push(created);
        }
      }
    }
    return newlyInferred;
  }

  private mapToMandateCategory(rawCategory: string): IMandate['category'] {
    const c = rawCategory.toLowerCase();
    if (c.includes('rent') || c.includes('housing')) return 'Rent';
    if (c.includes('emi') || c.includes('loan')) return 'Loan EMI';
    if (c.includes('insurance')) return 'Insurance';
    if (c.includes('internet') || c.includes('broadband') || c.includes('wifi')) return 'Internet';
    if (c.includes('electric') || c.includes('utility')) return 'Electricity';
    if (c.includes('sub') || c.includes('streaming') || c.includes('netflix') || c.includes('spotify')) return 'Subscription';
    if (c.includes('edu') || c.includes('tuition')) return 'Education';
    return 'Other';
  }

  /**
   * Generates or updates the user's Monthly Financial Plan using the Python Analytics Engine,
   * persists to MongoDB, and synchronises to Elasticsearch.
   */
  async generateOrUpdateMonthlyPlan(userId: string, targetMonth?: string): Promise<IFinancialPlan> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const user = await UserModel.findById(userObjId);
    if (!user) throw new Error('User not found');

    const now = new Date();
    const monthStr = targetMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const mandates = await MandateModel.find({
      userId: userObjId,
      status: { $in: ['confirmed', 'inferred'] },
    }).lean();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const transactions = await TransactionModel.find({
      userId: userObjId,
      date: { $gte: startOfMonth },
    }).lean();

    const goals = await GoalModel.find({ userId: userObjId, status: 'active' }).lean();

    const pythonPlan = await pythonAnalyticsService.runPythonTask({
      task: 'calculate_plan',
      monthlyIncome: user.monthlyIncome,
      mandates,
      transactions,
      goals,
      savingsTargetPercent: user.spendingPreferences?.savingsTargetPercent || 20,
    });

    const overrunCount = (pythonPlan.recoveryRecommendations || []).length;
    const aiSummary =
      overrunCount > 0
        ? `Your ${monthStr} plan allocates ₹${pythonPlan.totalCommitments.toLocaleString('en-IN')} to recurring commitments, ₹${pythonPlan.totalSavingsTarget.toLocaleString('en-IN')} to savings goals, and ₹${pythonPlan.totalDiscretionaryBudget.toLocaleString('en-IN')} to discretionary spending. AURA detected ${overrunCount} category overrun(s) and prepared non-judgmental recovery adjustments below.`
        : `Your ${monthStr} financial plan is healthy and balanced. Out of ₹${user.monthlyIncome.toLocaleString('en-IN')} monthly income, ₹${pythonPlan.totalCommitments.toLocaleString('en-IN')} covers confirmed commitments, ₹${pythonPlan.totalSavingsTarget.toLocaleString('en-IN')} advances your active goals, and ₹${pythonPlan.totalDiscretionaryBudget.toLocaleString('en-IN')} is available for discretionary choices.`;

    let plan = await FinancialPlanModel.findOne({ userId: userObjId, month: monthStr });
    if (plan) {
      plan.totalIncome = pythonPlan.totalIncome;
      plan.totalCommitments = pythonPlan.totalCommitments;
      plan.totalEssentialBudget = pythonPlan.totalEssentialBudget;
      plan.totalDiscretionaryBudget = pythonPlan.totalDiscretionaryBudget;
      plan.totalSavingsTarget = pythonPlan.totalSavingsTarget;
      plan.unallocatedBuffer = pythonPlan.unallocatedBuffer;
      plan.allocations = pythonPlan.allocations;
      plan.recoveryRecommendations = pythonPlan.recoveryRecommendations;
      plan.aiSummary = aiSummary;
      await plan.save();
    } else {
      plan = await FinancialPlanModel.create({
        userId: userObjId,
        month: monthStr,
        title: `AURA Personalised Plan — ${monthStr}`,
        totalIncome: pythonPlan.totalIncome,
        totalCommitments: pythonPlan.totalCommitments,
        totalEssentialBudget: pythonPlan.totalEssentialBudget,
        totalDiscretionaryBudget: pythonPlan.totalDiscretionaryBudget,
        totalSavingsTarget: pythonPlan.totalSavingsTarget,
        unallocatedBuffer: pythonPlan.unallocatedBuffer,
        allocations: pythonPlan.allocations,
        recoveryRecommendations: pythonPlan.recoveryRecommendations,
        aiSummary,
        status: 'active',
      });
    }

    await elasticIntegration.syncFinancialPlan(plan);
    return plan;
  }

  /**
   * Retrieves Family Finance data while enforcing strict privacy boundaries:
   * - Never exposes another family member's private accounts, private balances, or private transactions.
   * - Only exposes shared family budgets, shared goals, shared commitments, and aggregate member contributions.
   * - Strictly returns the authenticated user's actual family group, or null if no household exists.
   */
  async getPrivacyPreservingFamilyOverview(userId: string) {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const user = await UserModel.findById(userObjId);
    if (!user) throw new Error('User not found');

    const familyGroupId = user.familyGroupId;
    if (!familyGroupId) {
      return {
        hasHousehold: false,
        privacyBoundaryPolicy: {
          enforced: true,
          rule: 'Individual bank balances, personal accounts, and non-shared transactions of other family members are strictly private and never returned.',
        },
        familyGroup: null,
        sharedSummary: {
          sharedMonthlyBudget: 0,
          sharedSpentThisMonth: 0,
          remainingSharedBudget: 0,
          sharedGoalsCount: 0,
          sharedCommitmentsCount: 0,
        },
        sharedGoals: [],
        sharedCommitments: [],
        sharedTransactions: [],
      };
    }

    const familyGroup = await FamilyGroupModel.findOne({ familyGroupId });
    if (!familyGroup) {
      return {
        hasHousehold: false,
        privacyBoundaryPolicy: {
          enforced: true,
          rule: 'Individual bank balances, personal accounts, and non-shared transactions of other family members are strictly private and never returned.',
        },
        familyGroup: null,
        sharedSummary: {
          sharedMonthlyBudget: 0,
          sharedSpentThisMonth: 0,
          remainingSharedBudget: 0,
          sharedGoalsCount: 0,
          sharedCommitmentsCount: 0,
        },
        sharedGoals: [],
        sharedCommitments: [],
        sharedTransactions: [],
      };
    }

    // Only fetch explicitly shared goals, shared mandates, and shared transactions belonging to this exact family group
    const sharedGoals = await GoalModel.find({
      familyGroupId,
      isSharedWithFamily: true,
    });
    const sharedMandates = await MandateModel.find({
      familyGroupId,
      isSharedWithFamily: true,
    });
    const sharedTransactions = await TransactionModel.find({
      familyGroupId,
      isSharedFamilyTransaction: true,
    })
      .sort({ date: -1 })
      .limit(20)
      .select('date merchant description category amount currency isSharedFamilyTransaction');

    const totalSharedSpent = sharedTransactions.reduce((sum, t) => sum + t.amount, 0);

    return {
      hasHousehold: true,
      privacyBoundaryPolicy: {
        enforced: true,
        rule: 'Individual bank balances, personal accounts, and non-shared transactions of other family members are strictly private and never returned by this endpoint.',
      },
      familyGroup,
      sharedSummary: {
        sharedMonthlyBudget: familyGroup.sharedMonthlyBudget || 0,
        sharedSpentThisMonth: totalSharedSpent,
        remainingSharedBudget: Math.max(0, (familyGroup.sharedMonthlyBudget || 0) - totalSharedSpent),
        sharedGoalsCount: sharedGoals.length,
        sharedCommitmentsCount: sharedMandates.length,
      },
      sharedGoals,
      sharedCommitments: sharedMandates,
      sharedTransactions,
    };
  }
}

export const coreFinancialService = new CoreFinancialService();
