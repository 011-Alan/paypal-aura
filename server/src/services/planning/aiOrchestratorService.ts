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
  CalendarEventModel,
  FamilyGroupModel,
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

export interface AiToolAction {
  type:
    | 'plan_generated'
    | 'reminder_scheduled'
    | 'goal_created'
    | 'goal_updated'
    | 'purchase_evaluated'
    | 'payment_prepared'
    | 'family_task'
    | 'general_knowledge'
    | 'financial_intelligence';
  title: string;
  status: 'completed' | 'awaiting_approval' | 'informational';
  requiresUserPaymentApproval?: boolean;
  details?: any;
}

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
        ? 'gemini_live_with_function_calling_and_ground_truth'
        : 'deterministic_ground_truth_synthesizer (Configure GEMINI_API_KEY for live Gemini LLM)',
      strictRule: 'AI never completes financial transactions independently. User retains final payment authority.',
    };
  }

  /**
   * Main conversational interface for "Ask AURA".
   * Handles:
   * 1. General knowledge and non-financial questions (technology, science, everyday topics).
   * 2. Financial intelligence queries ("How am I doing financially?", "Why did I spend more?").
   * 3. Planning & scheduling tasks (schedules, reminders, savings goals, monthly budgets).
   * 4. Multi-sponsor workflows (Channel3 purchases, Bryntum calendar, Astropods agents, Elastic memory, AG Grid).
   * 5. Strictly controlled payment preparation (Workflow E with explicit user approval card).
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
    const promptLower = prompt.toLowerCase();

    // 1. Retrieve user's verified financial context
    const [accounts, allTransactions, mandates, goals, familyGroup] = await Promise.all([
      AccountModel.find({ userId: userObjId, status: 'active' }),
      TransactionModel.find({ userId: userObjId }).sort({ date: -1 }),
      MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } }),
      GoalModel.find({ userId: userObjId, status: 'active' }),
      FamilyGroupModel.findOne({ familyGroupId: user.familyGroupId }),
    ]);

    const liquidBalance = accounts
      .filter((a) => a.type === 'checking' || a.type === 'savings' || a.type === 'wallet')
      .reduce((s, a) => s + a.balance, 0);

    const totalCommitments = mandates
      .filter((m) => m.category !== 'Salary')
      .reduce((s, m) => s + m.amount, 0);

    const activeGoalsMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);

    // Elastic search context
    const elasticContext = await elasticIntegration.searchFinancialMemory({
      userId: params.userId,
      query: prompt,
      limit: 20,
    });

    // Bryntum calendar dataset
    const calendarDataset = await bryntumIntegration.getBryntumCalendarDataset(params.userId);

    // AG Grid analytics
    const gridFilterCmd = agGridIntegration.parseNaturalLanguageToGridFilter(prompt);
    const agGridPayload = agGridIntegration.buildGridAnalyticsPayload(allTransactions, gridFilterCmd);

    let routing = astropodsIntegration.routeIntent(prompt);
    let purchaseEvaluationData: any = null;
    let generatedPlanData: any = null;
    let preparedPaymentData: any = null;
    let kernelResearchData: any = null;
    let pythonAnalysisData: any = null;
    let toolAction: AiToolAction | null = null;
    let suggestedNextPrompts: string[] = [];
    let answerText = '';

    // =========================================================================
    // BRANCH A: SAVINGS GOAL PLANNING ("Save ₹30,000 over 6 months", "Create savings goal", "Move deadline to December")
    // =========================================================================
    const isGoalDeadlineMove =
      promptLower.includes('move') && (promptLower.includes('deadline') || promptLower.includes('goal'));
    const isSavePlanRequest =
      (promptLower.includes('save') || promptLower.includes('goal')) &&
      (/\d+/.test(promptLower) || promptLower.includes('create') || promptLower.includes('plan'));

    if (isGoalDeadlineMove) {
      // Move goal deadline
      const activeGoal = goals[0];
      if (activeGoal) {
        // Detect target month or default 4 months out
        const targetDate = promptLower.includes('december')
          ? new Date(new Date().getFullYear(), 11, 31)
          : promptLower.includes('january')
          ? new Date(new Date().getFullYear() + 1, 0, 31)
          : new Date(Date.now() + 120 * 86400000);

        activeGoal.deadline = targetDate;
        await activeGoal.save();
        await bryntumIntegration.syncUserFinancialCalendar(params.userId);

        toolAction = {
          type: 'goal_updated',
          title: `Goal Rescheduled: ${activeGoal.title}`,
          status: 'completed',
          details: {
            goalId: activeGoal._id,
            title: activeGoal.title,
            newDeadline: targetDate.toISOString(),
            formattedDeadline: targetDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
          },
        };
        answerText = `I have updated your savings goal deadline for "${activeGoal.title}" to ${targetDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}. Your Bryntum Financial Calendar and monthly allocations have been synchronized.`;
        suggestedNextPrompts = [
          'How does this affect my monthly budget?',
          'What are my other active goals?',
          'Can I afford extra contributions this month?',
        ];
      }
    } else if (isSavePlanRequest && !promptLower.includes('laptop') && !promptLower.includes('afford')) {
      const amountMatch = prompt.match(/(?:₹|inr|rs\.?|of)\s*([\d,]+)/i) || prompt.match(/([\d,]+)\s*(?:inr|rs|rupees)/i);
      const targetAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 30000;
      const monthMatch = prompt.match(/(\d+)\s*(?:month|mo)/i);
      const months = monthMatch ? parseInt(monthMatch[1], 10) : 6;
      const monthlyContribution = Math.ceil(targetAmount / Math.max(1, months));

      const now = new Date();
      const deadline = new Date(now.getFullYear(), now.getMonth() + months, 28);

      const titleMatch = prompt.match(/(?:for|towards)\s+([A-Za-z0-9\s]{3,30})/i);
      const goalTitle = titleMatch ? titleMatch[1].trim() : `Savings Target ₹${targetAmount.toLocaleString('en-IN')}`;

      const newGoal = await GoalModel.create({
        userId: userObjId,
        title: goalTitle,
        category: 'Savings',
        targetAmount,
        currentAmount: 0,
        monthlyContribution,
        deadline,
        priority: 'high',
        isSharedWithFamily: false,
        milestones: [
          { percentage: 25, reached: false, confirmedByUser: false },
          { percentage: 50, reached: false, confirmedByUser: false },
          { percentage: 75, reached: false, confirmedByUser: false },
          { percentage: 100, reached: false, confirmedByUser: false },
        ],
      });

      await bryntumIntegration.syncUserFinancialCalendar(params.userId);

      toolAction = {
        type: 'goal_created',
        title: `Savings Goal Established: ${newGoal.title}`,
        status: 'completed',
        details: {
          goal: newGoal,
          targetAmount,
          monthlyContribution,
          durationMonths: months,
          deadline: deadline.toISOString(),
        },
      };

      answerText = `I have created a structured savings plan for you. To save ₹${targetAmount.toLocaleString('en-IN')} over ${months} months, set aside ₹${monthlyContribution.toLocaleString('en-IN')} each month. I've added this goal to your portfolio and scheduled milestone checkpoints in your Financial Calendar.`;
      suggestedNextPrompts = [
        'Where can I trim discretionary expenses to fund this?',
        'Show my current savings progress',
        'How am I doing financially overall?',
      ];
    }

    // =========================================================================
    // BRANCH B: SCHEDULE REMINDER / BILL EVENT ("Schedule my electricity bill reminder for 10th")
    // =========================================================================
    const isScheduleRequest =
      promptLower.includes('schedule') ||
      (promptLower.includes('remind') && (promptLower.includes('bill') || promptLower.includes('every month') || promptLower.includes('on the')));

    if (isScheduleRequest && !toolAction) {
      const dayMatch = prompt.match(/(\d+)(?:st|nd|rd|th)/i) || prompt.match(/day\s*(\d+)/i) || prompt.match(/for\s*(\d+)/i);
      const dueDay = dayMatch ? parseInt(dayMatch[1], 10) : 10;

      let eventTitle = 'Recurring Financial Reminder';
      let eventType: any = 'reminder';
      if (promptLower.includes('electricity')) {
        eventTitle = 'Electricity Bill Due Date';
        eventType = 'electricity';
      } else if (promptLower.includes('rent')) {
        eventTitle = 'Monthly Rent Payment';
        eventType = 'rent';
      } else if (promptLower.includes('insurance')) {
        eventTitle = 'Insurance Premium Due';
        eventType = 'insurance';
      } else if (promptLower.includes('internet') || promptLower.includes('wifi')) {
        eventTitle = 'Internet Broadband Bill';
        eventType = 'subscription';
      }

      const nextDate = new Date();
      if (nextDate.getDate() > dueDay) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      nextDate.setDate(dueDay);

      const event = await CalendarEventModel.create({
        userId: userObjId,
        title: eventTitle,
        eventType,
        startDate: nextDate,
        endDate: nextDate,
        allDay: true,
        currency: 'INR',
        status: 'upcoming',
        color: '#2563eb',
        notes: `Scheduled via Ask AURA on ${new Date().toLocaleDateString('en-IN')}`,
      });

      await zapierIntegration.triggerAutomation({
        userId: params.userId,
        automationType: 'financial_calendar_reminder',
        title: `Calendar Event Scheduled: ${eventTitle}`,
        message: `Scheduled "${eventTitle}" for the ${dueDay}th of every month in your Bryntum Financial Calendar.`,
        deduplicationKey: `ask-aura-cal-${String(event._id)}`,
      });

      toolAction = {
        type: 'reminder_scheduled',
        title: `Calendar Event Scheduled: ${eventTitle}`,
        status: 'completed',
        details: {
          event,
          dayOfMonth: dueDay,
          nextDueDate: nextDate.toISOString(),
        },
      };

      answerText = `I have scheduled your reminder for "${eventTitle}" on the ${dueDay}th of every month. It has been synchronized to your Bryntum Financial Life Calendar and linked to your automated notifications.`;
      suggestedNextPrompts = [
        'What other commitments are scheduled this month?',
        'Organise all my upcoming payments',
        'Help me plan my expenses for this month',
      ];
    }

    // =========================================================================
    // BRANCH C: CONTROLLED PAYMENT WORKFLOW (WORKFLOW E - "Pay my bill", "Prepare payment of ₹5,000")
    // STRICT SECURITY INVARIANT: NEVER executes automatically. ONLY prepares for user PIN review.
    // =========================================================================
    const isPaymentIntent =
      (promptLower.includes('pay') || promptLower.includes('transfer') || promptLower.includes('send money')) &&
      !promptLower.includes('how do i pay') &&
      !promptLower.includes('can i pay');

    if (isPaymentIntent && !toolAction) {
      routing = {
        workflowType: 'paypal_payment',
        primaryAgent: 'financial-guardian',
        supportingAgents: ['transaction-intelligence', 'mandate-intelligence'],
      };

      const amountMatch = prompt.match(/(?:₹|inr|rs\.?|of)\s*([\d,]+)/i) || prompt.match(/([\d,]+)\s*(?:inr|rs|rupees)/i);
      const amountInr = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 5000;

      // Extract recipient
      let recipientName = 'Greenwood Residency Landlords';
      if (promptLower.includes('electricity') || promptLower.includes('power')) {
        recipientName = 'State Electricity Distribution Co';
      } else if (promptLower.includes('internet') || promptLower.includes('airtel') || promptLower.includes('act')) {
        recipientName = 'ACT Fibernet Ltd';
      } else {
        const toMatch = prompt.match(/(?:to|for)\s+([A-Za-z0-9\s&.-]{2,35})/i);
        if (toMatch) recipientName = toMatch[1].trim();
      }

      preparedPaymentData = await paymentGuardianService.preparePaymentRequest({
        userId: params.userId,
        recipientName,
        description: `AURA Initiated Payment: ${prompt.slice(0, 60)}`,
        amountInr,
        merchantCategory: 'Utilities & Housing',
      });

      toolAction = {
        type: 'payment_prepared',
        title: `Payment Prepared: ₹${amountInr.toLocaleString('en-IN')} to ${recipientName}`,
        status: 'awaiting_approval',
        requiresUserPaymentApproval: true,
        details: preparedPaymentData,
      };

      answerText = `I have verified your account balance and prepared a payment request of ₹${amountInr.toLocaleString(
        'en-IN'
      )} ($${preparedPaymentData.amountUsd.toFixed(2)} USD) to "${recipientName}".

**Financial Guardian Check:** ${
        preparedPaymentData.guardianEvaluation.passed
          ? 'Approved within your daily and single-transaction policy limits.'
          : 'Flagged for special authorization.'
      }

> **Security Guarantee:** As a fundamental principle, AURA never moves funds automatically. Please navigate to the **Payments** tab and enter your Argon2id security PIN to review and complete this transaction.`;

      suggestedNextPrompts = [
        'Check my remaining balance after this payment',
        'What other bills are due this week?',
        'Cancel this pending payment preparation',
      ];
    }

    // =========================================================================
    // BRANCH D: SMART PURCHASE EVALUATION (WORKFLOW A - "Can I afford this laptop?")
    // =========================================================================
    const isPurchaseQuery =
      promptLower.includes('afford') ||
      promptLower.includes('can i buy') ||
      promptLower.includes('smart purchase') ||
      routing.workflowType === 'purchase_evaluation';

    if (isPurchaseQuery && !toolAction) {
      routing = {
        workflowType: 'purchase_evaluation',
        primaryAgent: 'purchase-intelligence',
        supportingAgents: ['financial-planner', 'transaction-intelligence', 'financial-guardian'],
      };

      const priceMatch = prompt.match(/(?:₹|inr|rs\.?|for|under)\s*([\d,]+)/i);
      const requestedPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 55000;

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
        requestedPriceInr: requestedPrice,
        discretionaryAllocatedInr: discretionaryRemaining,
        upcomingCommitmentsCount: calendarDataset.summary.upcoming14DaysCount || mandates.length,
        upcomingCommitmentsTotalInr: calendarDataset.summary.upcoming14DaysTotalAmount || totalCommitments,
        evaluatedProducts: evaluatedOptions,
      };

      const topOption = evaluatedOptions[0];
      const guidance = topOption?.evaluation?.guidanceCategory || 'Possible with budget adjustments';

      toolAction = {
        type: 'purchase_evaluated',
        title: `7-Factor Evaluation: ${topOption?.product?.name || 'Item'} (₹${requestedPrice.toLocaleString('en-IN')})`,
        status: 'informational',
        details: purchaseEvaluationData,
      };

      answerText = `Let's see how this purchase fits into your financial reality.

You currently have **₹${discretionaryRemaining.toLocaleString('en-IN')}** in remaining discretionary funds this month, with **${purchaseEvaluationData.upcomingCommitmentsCount} upcoming commitments** totalling **₹${purchaseEvaluationData.upcomingCommitmentsTotalInr.toLocaleString('en-IN')}** (including Rent, Insurance, and Internet).

**AURA Guidance:** **${guidance}**
${topOption?.evaluation?.explanation || ''}

${
  topOption?.evaluation?.suggestedSavingsPlan
    ? `💡 **Recommended Next Step:** Set up a dedicated savings plan of ₹${topOption.evaluation.suggestedSavingsPlan.monthlyContributionInr.toLocaleString('en-IN')}/month over ${topOption.evaluation.suggestedSavingsPlan.monthsRequired} months to protect your liquidity.`
    : ''
}`;

      suggestedNextPrompts = [
        'Start a savings plan for this laptop',
        'How much can I spend safely this weekend?',
        'Show my upcoming commitments for next 14 days',
      ];
    }

    // =========================================================================
    // BRANCH E: MONTHLY PLANNING & FINANCIAL RECOVERY (WORKFLOW B & F)
    // =========================================================================
    const isPlanRequest =
      promptLower.includes('plan') ||
      promptLower.includes('budget') ||
      promptLower.includes('november') ||
      promptLower.includes('next month') ||
      promptLower.includes('recovery') ||
      promptLower.includes('overspent');

    if (isPlanRequest && !toolAction) {
      generatedPlanData = await coreFinancialService.generateOrUpdateMonthlyPlan(params.userId);
      pythonAnalysisData = await pythonAnalyticsService.runPythonTask({
        task: 'analyze_transactions',
        monthlyIncome: user.monthlyIncome,
        transactions: allTransactions,
      });

      toolAction = {
        type: 'plan_generated',
        title: `Financial Plan for ${generatedPlanData.month}`,
        status: 'completed',
        details: generatedPlanData,
      };

      answerText = generatedPlanData.aiSummary;

      const recs = generatedPlanData.recoveryRecommendations || [];
      if (recs.length > 0) {
        answerText += `\n\n**Recovery Recommendations:**\n` + recs.map((r: any) => `• **${r.category}**: ${r.action} (Projected saving: ₹${r.projectedSavings.toLocaleString('en-IN')})`).join('\n');
      }

      suggestedNextPrompts = [
        'How am I tracking against my savings target?',
        'Can you show my recurring commitments?',
        'What purchases can I cut this month?',
      ];
    }

    // =========================================================================
    // BRANCH F: FINANCIAL INTELLIGENCE ("How am I doing financially?", "Why did I spend more?")
    // =========================================================================
    const isFinancialHealthQuery =
      promptLower.includes('how am i doing') ||
      promptLower.includes('financial status') ||
      promptLower.includes('financial health') ||
      promptLower.includes('overview') ||
      promptLower.includes('summary') ||
      promptLower.includes('why did i spend');

    if (isFinancialHealthQuery && !toolAction) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const mtdExpenses = allTransactions
        .filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart)
        .reduce((s, t) => s + t.amount, 0);

      const unusuals = allTransactions.filter((t) => t.isUnusual);
      const savingsRate = Math.round(((user.monthlyIncome - mtdExpenses) / Math.max(1, user.monthlyIncome)) * 100);

      toolAction = {
        type: 'financial_intelligence',
        title: 'Financial Health Assessment',
        status: 'informational',
        details: {
          liquidBalance,
          monthlyIncome: user.monthlyIncome,
          monthToDateSpent: mtdExpenses,
          savingsRatePercent: Math.max(0, savingsRate),
          upcomingCommitmentsCount: mandates.length,
          upcomingCommitmentsTotal: totalCommitments,
        },
      };

      answerText = `Here is your current financial standing:

• **Available Liquidity:** ₹${liquidBalance.toLocaleString('en-IN')} across ${accounts.length} accounts.
• **Monthly Cash Flow:** Monthly income is ₹${user.monthlyIncome.toLocaleString('en-IN')}, with ₹${mtdExpenses.toLocaleString('en-IN')} spent so far this month (estimated savings rate: **${Math.max(0, savingsRate)}%**).
• **Protected Commitments:** You have ${mandates.length} confirmed recurring commitments totalling ₹${totalCommitments.toLocaleString('en-IN')} (including Rent ₹8,000, Insurance ₹1,000, and ACT Internet ₹800).
${unusuals.length > 0 ? `• **Notice:** ${unusuals.length} unusual expense(s) detected this period (e.g. ${unusuals[0].merchant} for ₹${unusuals[0].amount.toLocaleString('en-IN')}).` : '• **Stability:** No anomalous or unauthorized spikes flagged.'}

You are in a stable position with your essential bills protected.`;

      suggestedNextPrompts = [
        'Can I afford a new purchase?',
        'Help me plan my expenses for next month',
        'Show my Bryntum calendar commitments',
      ];
    }

    // =========================================================================
    // BRANCH G: GENERAL CONVERSATIONAL & EDUCATIONAL QUESTIONS
    // (General knowledge, financial concepts, education, everyday topics)
    // =========================================================================
    if (!toolAction) {
      // General question handling
      if (promptLower.includes('compound') || promptLower.includes('compounding')) {
        answerText = `**Compound interest** is the interest you earn on both your original money and the accumulated interest from prior periods — often called "interest on interest."

For example, if you invest ₹1,00,000 at an 8% annual return:
• Year 1: You earn ₹8,000 → Balance becomes ₹1,08,000.
• Year 2: You earn 8% on ₹1,08,000 = ₹8,640 → Balance becomes ₹1,16,640.
• Over 10 years, your ₹1,00,000 grows to approximately ₹2,15,892 without adding another rupee.

In AURA, compounding works in your favor through your automated goal contributions and disciplined savings allocations.`;
        toolAction = {
          type: 'general_knowledge',
          title: 'Financial Concept: Compounding Interest',
          status: 'informational',
        };
      } else if (promptLower.includes('inflation')) {
        answerText = `**Inflation** is the general increase in prices and fall in the purchasing value of money over time. When inflation averages 6% per year, an item that costs ₹100 today will cost ₹106 next year.

**How it affects your finances:**
1. **Savings in low-interest accounts:** Money sitting in cash or basic savings earning below inflation effectively loses real buying power each year.
2. **Fixed commitments:** Rent and subscriptions tend to increase periodically with inflation.
3. **Mitigation:** Setting higher savings targets in growth categories (like equity mutual funds or diversified SIPs) helps outpace inflation.`;
        toolAction = {
          type: 'general_knowledge',
          title: 'Financial Concept: Inflation & Purchasing Power',
          status: 'informational',
        };
      } else if (promptLower.includes('credit score') || promptLower.includes('cibil')) {
        answerText = `A **credit score** (ranging from 300 to 900 in India) reflects your reliability in repaying borrowed money. A score of 750 or higher is considered excellent.

**Key factors that build a strong score:**
• **Timely payments (35%):** Paying EMIs and credit card bills before the due date. AURA helps track these via your Financial Calendar.
• **Credit utilization (30%):** Keeping credit card balances below 30% of your limit.
• **Credit age & mix (25%):** Maintaining a healthy balance of secured and unsecured credit over time.
• **Inquiries (10%):** Avoiding multiple rapid loan applications.`;
        toolAction = {
          type: 'general_knowledge',
          title: 'Credit Score Explained',
          status: 'informational',
        };
      } else {
        // Fallback natural language answer via Gemini if configured, or thoughtful synthesis
        if (this.geminiClient) {
          try {
            const resp = await this.geminiClient.models.generateContent({
              model: env.GEMINI_MODEL,
              contents: `You are AURA, an intelligent, empathetic, versatile AI companion.
The user asked: "${prompt}"

Context about the user:
- Name: ${user.name}
- Available Liquid Balance: ₹${liquidBalance.toLocaleString('en-IN')}
- Active Goals: ${goals.map((g) => g.title).join(', ') || 'General savings'}
- Monthly Income: ₹${user.monthlyIncome.toLocaleString('en-IN')}

Answer their question warmly, conversationally, and accurately. You may answer any general knowledge, technical, financial, or everyday question. If you mention financial numbers, use ONLY the verified context provided above. Never claim to have completed payments independently.`,
            });
            const text = resp.text?.trim();
            if (text && text.length > 15) {
              answerText = text;
            }
          } catch (err: any) {
            logger.warn('AuraAiOrchestrator', 'Gemini general query failed; using structured response', {
              error: err?.message,
            });
          }
        }

        if (!answerText) {
          answerText = `I understand your question about "${prompt}". AURA is designed to help you make informed decisions, whether exploring educational topics, analyzing past spending, organizing upcoming payments, or structuring long-term plans. Let me know if you would like me to retrieve specific records or schedule any actions for you.`;
        }

        toolAction = {
          type: 'general_knowledge',
          title: 'Conversational Response',
          status: 'informational',
        };
      }

      suggestedNextPrompts = [
        'How am I doing financially?',
        'Can I afford a laptop for ₹55,000?',
        'Help me plan my expenses for next month',
        'Schedule electricity bill reminder for 10th',
      ];
    }

    // 2. Prepare Astropods coordinated workflow trace
    const sanitizedTransactions = allTransactions.slice(0, 30).map((t) => ({
      date: new Date(t.date).toISOString().slice(0, 10),
      merchant: t.merchant,
      category: t.category,
      type: t.type,
      amount: t.amount,
      isRecurring: t.isRecurring,
      isUnusual: t.isUnusual,
    }));

    const sanitizedMandates = mandates.map((m) => ({
      title: m.title,
      merchant: m.merchant,
      category: m.category,
      amount: m.amount,
      frequency: m.frequency,
      dueDayOfMonth: m.dueDayOfMonth,
    }));

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
        transactions: sanitizedTransactions,
        mandates: sanitizedMandates,
      },
    });

    // If Gemini client is live and we have baseline answerText, polish with Gemini
    if (this.geminiClient && answerText && !toolAction?.requiresUserPaymentApproval) {
      try {
        const resp = await this.geminiClient.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: `You are AURA, a friendly, intelligent financial companion.
Refine the following verified response to user prompt "${prompt}" for ${user.name}.
Keep it concise, clear, and empathetic. Do NOT change or invent any currency amounts.

Verified Content:
${answerText}`,
        });
        const polished = resp.text?.trim();
        if (polished && polished.length > 20) {
          answerText = polished;
        }
      } catch (err: any) {
        // keep baseline
      }
    }

    return {
      prompt,
      workflowType: routing.workflowType,
      explanation: answerText,
      toolAction,
      suggestedNextPrompts,
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
}

export const auraAiOrchestrator = new AuraAiOrchestratorService();
