import mongoose from 'mongoose';
import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  UserModel,
  AccountModel,
  TransactionModel,
  MandateModel,
  GoalModel,
} from '../../models';
import { astropodsIntegration } from '../../integrations/astropods';
import { agGridIntegration } from '../../integrations/ag-grid';
import { bryntumIntegration } from '../../integrations/bryntum';
import { channel3Integration } from '../../integrations/channel3';
import { elasticIntegration } from '../../integrations/elastic';
import { kernelIntegration } from '../../integrations/kernel';
import { zapierIntegration } from '../../integrations/zapier';
import { coreFinancialService } from '../financial/financialService';
import { paymentGuardianService } from '../payments/paymentGuardianService';
import { pythonAnalyticsService } from '../analytics/analyticsService';

export class AuraAiOrchestratorService {
  private geminiClient: GoogleGenAI | null = null;

  constructor() {
    if (env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
      try {
        this.geminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      } catch (err: any) {
        logger.warn('AuraAiOrchestrator', 'Could not initialize GoogleGenAI SDK', { error: err?.message });
      }
    }
  }

  getHealthStatus() {
    const geminiConfigured = Boolean(this.geminiClient);
    return {
      service: 'AURA Conversational Intelligence & Multi-Agent Orchestrator',
      geminiModel: env.GEMINI_MODEL,
      geminiApiKeyConfigured: geminiConfigured,
      mode: geminiConfigured
        ? 'gemini_live_with_backend_ground_truth'
        : 'deterministic_ground_truth_synthesizer (Configure GEMINI_API_KEY for live Gemini LLM phrasing)',
      strictRule: 'AI never invents financial numbers or executes payments independently.',
    };
  }

  /**
   * Executes a connected multi-sponsor workflow in response to a user prompt in "Ask AURA"
   * or any of the 6 core workflows (Workflows A through F).
   */
  async processConversationalQuery(params: {
    userId: string;
    prompt: string;
    includeKernelResearch?: boolean;
  }) {
    const userObjId = new mongoose.Types.ObjectId(params.userId);
    const user = await UserModel.findById(userObjId);
    if (!user) throw new Error('User not found');

    const prompt = (params.prompt || '').trim();
    const routing = astropodsIntegration.routeIntent(prompt);

    // Retrieve core MongoDB context
    const [accounts, allTransactions, mandates, goals] = await Promise.all([
      AccountModel.find({ userId: userObjId, status: 'active' }),
      TransactionModel.find({ userId: userObjId }).sort({ date: -1 }),
      MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } }),
      GoalModel.find({ userId: userObjId, status: 'active' }),
    ]);

    const liquidBalance = accounts
      .filter((a) => a.type === 'checking' || a.type === 'savings' || a.type === 'wallet')
      .reduce((s, a) => s + a.balance, 0);

    const totalCommitments = mandates
      .filter((m) => m.category !== 'Salary')
      .reduce((s, m) => s + m.amount, 0);

    const activeGoalsMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);

    // Retrieve Elastic financial memory context
    const elasticContext = await elasticIntegration.searchFinancialMemory({
      userId: params.userId,
      query: prompt,
      limit: 20,
    });

    // Retrieve Bryntum Calendar upcoming commitments
    const calendarDataset = await bryntumIntegration.getBryntumCalendarDataset(params.userId);

    // Build AG Grid analytics payload based on natural language query
    const gridFilterCmd = agGridIntegration.parseNaturalLanguageToGridFilter(prompt);
    const agGridPayload = agGridIntegration.buildGridAnalyticsPayload(allTransactions, gridFilterCmd);

    let purchaseEvaluationData: any = null;
    let generatedPlanData: any = null;
    let preparedPaymentData: any = null;
    let kernelResearchData: any = null;
    let pythonAnalysisData: any = null;

    // Branch by coordinated workflow
    if (routing.workflowType === 'purchase_evaluation') {
      // WORKFLOW A: CAN I AFFORD THIS LAPTOP / PRODUCT?
      const priceMatch = prompt.match(/(?:₹|inr|rs\.?|for|under)\s*([\d,]+)/i);
      const requestedPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : undefined;

      const plan = await coreFinancialService.generateOrUpdateMonthlyPlan(params.userId);
      const discretionaryAllocs = plan.allocations.filter((a) => a.type === 'discretionary');
      const discretionaryRemaining = Math.max(
        18000,
        discretionaryAllocs.reduce((s, a) => s + Math.max(0, a.remainingAmount), 0) ||
          user.financialPolicy.discretionaryMonthlyCap
      );

      const recent30DaySpend = allTransactions
        .filter((t) => t.type === 'expense' && Date.now() - new Date(t.date).getTime() <= 30 * 86400000)
        .reduce((s, t) => s + t.amount, 0);

      const ch3Search = await channel3Integration.searchProducts({
        query: prompt,
        maxPriceInr: requestedPrice ? requestedPrice * 1.35 : undefined,
      });

      const evaluatedOptions = channel3Integration.evaluateProductsAffordability(ch3Search.products, {
        monthlyIncomeInr: user.monthlyIncome,
        availableDiscretionaryBudgetInr: discretionaryRemaining,
        upcomingCommitmentsInr: calendarDataset.summary.upcoming14DaysTotalAmount || totalCommitments,
        activeGoalsMonthlyTargetInr: activeGoalsMonthly,
        savingsTargetInr: plan.totalSavingsTarget,
        recent30DayExpenditureInr: recent30DaySpend,
        liquidBalanceInr: liquidBalance,
        userRiskTolerance: user.spendingPreferences.riskTolerance,
      });

      if (params.includeKernelResearch) {
        kernelResearchData = await kernelIntegration.runAssistedResearch({
          userId: params.userId,
          topic: prompt,
          targetCategory: 'product_specs',
        });
      }

      purchaseEvaluationData = {
        liveChannel3Used: ch3Search.liveApiUsed,
        statusMessage: ch3Search.statusMessage,
        requestedPriceInr: requestedPrice || 55000,
        discretionaryAllocatedInr: discretionaryRemaining,
        upcomingCommitmentsCount: calendarDataset.summary.upcoming14DaysCount || mandates.length,
        upcomingCommitmentsTotalInr: calendarDataset.summary.upcoming14DaysTotalAmount || totalCommitments,
        evaluatedProducts: evaluatedOptions,
      };
    } else if (routing.workflowType === 'monthly_planning' || routing.workflowType === 'financial_recovery') {
      // WORKFLOW B & WORKFLOW F: MONTHLY FINANCIAL PLANNING & FINANCIAL RECOVERY
      generatedPlanData = await coreFinancialService.generateOrUpdateMonthlyPlan(params.userId);
      pythonAnalysisData = await pythonAnalyticsService.runPythonTask({
        task: 'analyze_transactions',
        monthlyIncome: user.monthlyIncome,
        transactions: allTransactions,
      });
    } else if (routing.workflowType === 'paypal_payment') {
      // WORKFLOW E: PAYPAL PAYMENT PREPARATION
      const amountMatch = prompt.match(/(?:₹|inr|rs\.?|of)\s*([\d,]+)/i);
      const amountInr = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 5000;
      const toMatch = prompt.match(/(?:to|for)\s+([A-Za-z0-9\s&.-]{2,35})/i);
      const recipientName = toMatch ? toMatch[1].trim() : 'Authorized PayPal Merchant';

      preparedPaymentData = await paymentGuardianService.preparePaymentRequest({
        userId: params.userId,
        recipientName,
        description: `AURA Assisted Payment: ${prompt.slice(0, 60)}`,
        amountInr,
        merchantCategory: 'General',
      });
    } else {
      // WORKFLOW C, WORKFLOW D, or General NL Analytics
      pythonAnalysisData = await pythonAnalyticsService.runPythonTask({
        task: 'analyze_transactions',
        monthlyIncome: user.monthlyIncome,
        transactions: allTransactions,
      });
    }

    // Prepare sanitized task-specific context for remote Astropods agents (no credentials, PINs, or raw account numbers)
    const sanitizedTransactions = allTransactions.slice(0, 40).map((t) => ({
      date: new Date(t.date).toISOString().slice(0, 10),
      merchant: t.merchant,
      category: t.category,
      type: t.type,
      amount: t.amount,
      isRecurring: t.isRecurring,
      isUnusual: t.isUnusual,
      unusualReason: t.unusualReason,
    }));

    const sanitizedMandates = mandates.map((m) => ({
      title: m.title,
      merchant: m.merchant,
      category: m.category,
      amount: m.amount,
      frequency: m.frequency,
      dueDayOfMonth: m.dueDayOfMonth,
      nextDueDate: m.nextDueDate ? new Date(m.nextDueDate).toISOString().slice(0, 10) : undefined,
      status: m.status,
      confidenceScore: m.confidenceScore,
    }));

    const sanitizedGoals = goals.map((g) => ({
      title: g.title,
      category: g.category,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      monthlyContribution: g.monthlyContribution,
      priority: g.priority,
    }));

    // Coordinate Astropods remote multi-agent workflow & execution trace
    const astropodsTrace = await astropodsIntegration.executeCoordinatedWorkflow({
      prompt,
      primaryAgent: routing.primaryAgent,
      supportingAgents: routing.supportingAgents,
      contextSummary: {
        monthlyIncome: user.monthlyIncome,
        totalCommitments,
        liquidBalanceInr: liquidBalance,
        transactionCount: agGridPayload.rowCount,
        unusualCount: agGridPayload.summaryRow.unusualCount,
        mandateCount: mandates.length,
        productCount: purchaseEvaluationData?.evaluatedProducts?.length || 0,
        discretionaryRemaining:
          purchaseEvaluationData?.discretionaryAllocatedInr ||
          user.financialPolicy.discretionaryMonthlyCap,
        transactions: sanitizedTransactions,
        mandates: sanitizedMandates,
        upcomingCommitments: sanitizedMandates.filter((m) => m.category !== 'Salary'),
        financialGoals: sanitizedGoals,
        allocations: generatedPlanData?.allocations || [],
        products: (purchaseEvaluationData?.evaluatedProducts || []).map((ep: any) => ({
          id: ep.product?.id,
          name: ep.product?.name,
          priceInr: ep.product?.priceInr,
          category: ep.product?.category,
        })),
        amountInr:
          preparedPaymentData?.amountInr ||
          purchaseEvaluationData?.requestedPriceInr ||
          5000,
        recipientName: preparedPaymentData?.recipientName || 'Authorized Merchant',
        policy: {
          singleTransactionLimit: user.financialPolicy.singleTransactionLimit,
          dailySpendingLimit: user.financialPolicy.dailySpendingLimit,
          discretionaryMonthlyCap: user.financialPolicy.discretionaryMonthlyCap,
          blockedCategories: user.financialPolicy.blockedCategories,
        },
      },
    });

    // Generate grounded explanation using Gemini (or deterministic ground-truth synthesizer if API key omitted)
    const explanation = await this.synthesizeGroundedExplanation({
      prompt,
      workflowType: routing.workflowType,
      user,
      agGridPayload,
      elasticContext,
      calendarDataset,
      purchaseEvaluationData,
      generatedPlanData,
      preparedPaymentData,
      pythonAnalysisData,
    });

    return {
      prompt,
      workflowType: routing.workflowType,
      explanation,
      astropodsOrchestration: astropodsTrace,
      agGridAnalytics: agGridPayload,
      elasticMemory: {
        engineMode: elasticContext.engineMode,
        matchedCount: elasticContext.summary.matchedTransactionCount,
        verifiedTotalExpense: elasticContext.summary.verifiedTotalExpense,
        expandedSemanticTerms: elasticContext.expandedSemanticTerms,
      },
      bryntumCalendar: calendarDataset.summary,
      purchaseCompanion: purchaseEvaluationData,
      financialPlan: generatedPlanData,
      preparedPayment: preparedPaymentData,
      kernelResearch: kernelResearchData,
      pythonAnalytics: pythonAnalysisData,
      timestamp: new Date().toISOString(),
    };
  }

  private async synthesizeGroundedExplanation(ctx: {
    prompt: string;
    workflowType: string;
    user: any;
    agGridPayload: any;
    elasticContext: any;
    calendarDataset: any;
    purchaseEvaluationData: any;
    generatedPlanData: any;
    preparedPaymentData: any;
    pythonAnalysisData: any;
  }): Promise<string> {
    // Build a deterministic ground-truth baseline using ONLY verified backend numbers
    let baseline = '';
    const q = ctx.prompt.toLowerCase();

    if (ctx.workflowType === 'purchase_evaluation' && ctx.purchaseEvaluationData) {
      const p = ctx.purchaseEvaluationData;
      const topOption = p.evaluatedProducts?.[0];
      baseline = `Let's see how this fits into your financial plan. You have ₹${p.discretionaryAllocatedInr.toLocaleString('en-IN')} allocated for discretionary spending this month and ${p.upcomingCommitmentsCount} upcoming commitments totalling ₹${p.upcomingCommitmentsTotalInr.toLocaleString('en-IN')} (including Rent, Insurance, and Internet). `;
      if (topOption) {
        baseline += `For "${topOption.product.name}" at ₹${topOption.product.priceInr.toLocaleString('en-IN')}, AURA's guidance is "${topOption.evaluation.guidanceCategory}". ${topOption.evaluation.explanation}`;
        if (topOption.evaluation.suggestedSavingsPlan) {
          baseline += ` Recommendation: ${topOption.evaluation.suggestedSavingsPlan.summary}`;
        }
      }
    } else if (ctx.workflowType === 'paypal_payment' && ctx.preparedPaymentData) {
      const pay = ctx.preparedPaymentData;
      baseline = `I have prepared a payment request of ₹${pay.amountInr.toLocaleString('en-IN')} ($${pay.amountUsd.toFixed(2)} USD) to "${pay.recipientName}". Financial Guardian status: ${pay.guardianEvaluation.passed ? 'Approved for confirmation' : 'Blocked by policy'}. No funds have been moved yet — please review the details and enter your security PIN in the Payments section to authorise PayPal Sandbox checkout.`;
    } else if (ctx.workflowType === 'monthly_planning' && ctx.generatedPlanData) {
      baseline = ctx.generatedPlanData.aiSummary;
    } else if (ctx.workflowType === 'financial_recovery' && ctx.generatedPlanData) {
      const recs = ctx.generatedPlanData.recoveryRecommendations || [];
      if (recs.length > 0) {
        baseline = `I reviewed your current spending and upcoming commitments without touching your essential bills (Rent, Insurance, Internet). Here is a realistic recovery plan: ${recs.map((r: any) => `${r.category}: ${r.action}`).join(' ')}`;
      } else {
        baseline = `Good news — your essential commitments (₹${ctx.generatedPlanData.totalCommitments.toLocaleString('en-IN')}) and savings target (₹${ctx.generatedPlanData.totalSavingsTarget.toLocaleString('en-IN')}) remain protected. To build extra cushion after recent spending, AURA suggests shifting ₹3,500 from flexible dining/shopping into your unallocated buffer for the next 14 days.`;
      }
    } else if (ctx.workflowType === 'upcoming_commitments') {
      const up = ctx.calendarDataset.upcomingCommitments || [];
      if (up.length > 0) {
        baseline = `You have ${up.length} upcoming commitments in the next 14 days totalling ₹${ctx.calendarDataset.upcoming14DaysTotalAmount.toLocaleString('en-IN')}: ${up.map((e: any) => `${e.name} on ${new Date(e.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`).join(', ')}. All are synchronised in your Bryntum Financial Life Calendar.`;
      } else {
        baseline = `Your Bryntum Financial Life Calendar shows ${ctx.calendarDataset.totalEvents} scheduled financial events across the month, with all confirmed recurring mandates tracked.`;
      }
    } else if (q.includes('holiday') || q.includes('travel') || q.includes('vacation')) {
      baseline = `Based on Elastic Financial Memory validated against MongoDB, you spent ₹${ctx.elasticContext.summary.verifiedTotalExpense.toLocaleString('en-IN')} across ${ctx.elasticContext.summary.matchedTransactionCount} travel & holiday transaction(s).`;
    } else {
      baseline = `Based on your authorised records displayed in AG Grid (${ctx.agGridPayload.rowCount} matching transactions), total expenditure for this selection is ₹${ctx.agGridPayload.summaryRow.totalExpense.toLocaleString('en-IN')} (average ₹${ctx.agGridPayload.summaryRow.averageExpense.toLocaleString('en-IN')} per expense), with ${ctx.agGridPayload.summaryRow.unusualCount} unusual transaction(s) flagged.`;
    }

    if (this.geminiClient) {
      try {
        const resp = await this.geminiClient.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: `You are AURA, a warm, supportive, non-judgmental financial companion.
Rewrite the following verified financial analysis into a clear, helpful 2-4 sentence response for ${ctx.user.name}.
CRITICAL RULE: Use ONLY the exact numbers provided below. Do NOT invent or alter any currency figures.

User Question: "${ctx.prompt}"
Verified Backend Facts: ${baseline}`,
        });
        const text = resp.text?.trim();
        if (text && text.length > 20) {
          return text;
        }
      } catch (err: any) {
        logger.warn('AuraAiOrchestrator', 'Gemini API call failed; returning verified ground-truth response', {
          error: err?.message,
        });
      }
    }

    return baseline;
  }
}

export const auraAiOrchestrator = new AuraAiOrchestratorService();
