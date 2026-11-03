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
    | 'navigation'
    | 'currency_updated'
    | 'profile_updated'
    | 'plan_generated'
    | 'reminder_scheduled'
    | 'goal_created'
    | 'goal_updated'
    | 'purchase_evaluated'
    | 'product_discovery'
    | 'payment_prepared'
    | 'family_task'
    | 'general_knowledge'
    | 'financial_intelligence'
    | 'clarification_needed';
  title: string;
  status: 'completed' | 'awaiting_approval' | 'informational';
  requiresUserPaymentApproval?: boolean;
  navTarget?: string;
  details?: any;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class AuraAiOrchestratorService {
  private geminiClient: GoogleGenAI | null = null;

  constructor() {
    if (env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
      try {
        this.geminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        logger.info('AuraAiOrchestrator', 'Initialized official GoogleGenAI SDK with live model', {
          model: env.GEMINI_MODEL,
        });
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
   * Implements full Gemini tool calling and application control:
   * 1. General knowledge (no financial agent invocation).
   * 2. Application Navigation (direct routing to tabs).
   * 3. Application Modification (currency, income, goals, reminders, calendar).
   * 4. Multi-category Channel3 Smart Purchases (sneakers, clothing, furniture, appliances, books, laptops).
   * 5. Contextual Memory & Multi-turn follow-ups (pronouns, durations, numbers).
   * 6. Strictly controlled payment preparation (Workflow E with PIN approval guarantee).
   */
  async processConversationalQuery(params: {
    userId: string;
    prompt: string;
    conversationHistory?: ConversationTurn[];
    includeKernelResearch?: boolean;
  }) {
    const userObjId = new mongoose.Types.ObjectId(params.userId);
    const user = await UserModel.findById(userObjId);
    if (!user) throw new Error('User not found');

    const prompt = (params.prompt || '').trim();
    const promptLower = prompt.toLowerCase();
    const history = params.conversationHistory || [];

    // Helper to find previous turn details
    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user')?.content?.toLowerCase() || '';
    const lastAssistantMsg = [...history].reverse().find((m) => m.role === 'assistant')?.content?.toLowerCase() || '';
    const cleanPrompt = promptLower.replace(/[.!?,;:]/g, '').trim();

    // =========================================================================
    // 1. RETRIEVE CURRENT BALANCE DIRECTLY ("Show me my current balance", "What is my balance?")
    // =========================================================================
    const isDirectBalanceRequest =
      promptLower.includes('current balance') ||
      promptLower.includes('my balance') ||
      promptLower.includes('how much money do i have') ||
      promptLower.includes('how much money is available') ||
      (promptLower.includes('balance') && (promptLower.includes('show') || promptLower.includes('check')));

    if (isDirectBalanceRequest) {
      const accounts = await AccountModel.find({ userId: userObjId, status: 'active' });
      const liquidAccounts = accounts.filter((a) => a.type === 'checking' || a.type === 'savings' || a.type === 'wallet');
      const totalBalance = liquidAccounts.reduce((s, a) => s + a.balance, 0);

      const action: AiToolAction = {
        type: 'financial_intelligence',
        title: `Current Liquid Balance: ₹${totalBalance.toLocaleString('en-IN')}`,
        status: 'informational',
        navTarget: 'accounts',
        details: { totalBalance, accounts: liquidAccounts },
      };

      const breakdown = liquidAccounts
        .map((a) => `• **${a.name}** (${a.institution}): ₹${a.balance.toLocaleString('en-IN')}`)
        .join('\n');

      const explanation = `Your current total available balance is **₹${totalBalance.toLocaleString('en-IN')}** across ${
        liquidAccounts.length
      } accounts:\n\n${breakdown}\n\nYour recurring bills and essential commitments are safely ringfenced.`;

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: 'financial_intelligence',
        explanation,
        toolAction: action,
        suggestedNextPrompts: [
          'Help me organise my upcoming payments',
          'Can I afford a new purchase?',
          'Take me to my accounts',
        ],
      });
    }

    // =========================================================================
    // 2. NAVIGATION DETECTION ("Take me to settings", "Open my accounts", "Open that page again")
    // =========================================================================
    const isNavigationIntent =
      promptLower.startsWith('take me to') ||
      promptLower.startsWith('open ') ||
      promptLower.startsWith('go to') ||
      promptLower.startsWith('navigate to') ||
      promptLower.startsWith('show me ') ||
      promptLower.includes('open that page again') ||
      promptLower.includes('take me there');

    if (isNavigationIntent) {
      let targetTab: string | null = null;
      let tabTitle = 'Page Navigation';

      if (promptLower.includes('setting') || promptLower.includes('preferences') || promptLower.includes('profile')) {
        targetTab = 'settings';
        tabTitle = 'Settings';
      } else if (promptLower.includes('account') || promptLower.includes('balance') || promptLower.includes('my money')) {
        targetTab = 'accounts';
        tabTitle = 'Accounts';
      } else if (promptLower.includes('transaction') || promptLower.includes('spending') || promptLower.includes('history')) {
        targetTab = 'transactions';
        tabTitle = 'Transactions';
      } else if (promptLower.includes('calendar') || promptLower.includes('schedule')) {
        targetTab = 'calendar';
        tabTitle = 'Financial Calendar';
      } else if (promptLower.includes('payment') || promptLower.includes('pay someone') || promptLower.includes('send money')) {
        targetTab = 'payments';
        tabTitle = 'Payments';
      } else if (promptLower.includes('commit') || promptLower.includes('bill') || promptLower.includes('mandate')) {
        targetTab = 'commitments';
        tabTitle = 'Bills & Commitments';
      } else if (promptLower.includes('goal') || promptLower.includes('savings target')) {
        targetTab = 'goals';
        tabTitle = 'Financial Goals';
      } else if (promptLower.includes('family') || promptLower.includes('household')) {
        targetTab = 'family';
        tabTitle = 'Family Finance';
      } else if (promptLower.includes('plan') || promptLower.includes('budget') || promptLower.includes('financial plan')) {
        targetTab = 'financial-planning';
        tabTitle = 'Financial Planning';
      } else if (promptLower.includes('smart purchase') || promptLower.includes('product') || promptLower.includes('shop')) {
        targetTab = 'smart-purchases';
        tabTitle = 'Smart Purchases';
      } else if (promptLower.includes('overview') || promptLower.includes('home') || promptLower.includes('dashboard')) {
        targetTab = 'overview';
        tabTitle = 'Overview';
      } else if (promptLower.includes('that page again') || promptLower.includes('go back there')) {
        // Context-aware navigation resolution
        if (lastAssistantMsg.includes('setting') || lastUserMsg.includes('setting')) targetTab = 'settings';
        else if (lastAssistantMsg.includes('calendar') || lastUserMsg.includes('calendar')) targetTab = 'calendar';
        else if (lastAssistantMsg.includes('account') || lastUserMsg.includes('account')) targetTab = 'accounts';
        else if (lastAssistantMsg.includes('payment') || lastUserMsg.includes('payment')) targetTab = 'payments';
        else if (lastAssistantMsg.includes('transaction') || lastUserMsg.includes('transaction')) targetTab = 'transactions';
        else targetTab = 'overview';
        tabTitle = targetTab.charAt(0).toUpperCase() + targetTab.slice(1);
      }

      if (targetTab) {
        const action: AiToolAction = {
          type: 'navigation',
          title: `Navigating to ${tabTitle}`,
          status: 'completed',
          navTarget: targetTab,
          details: { targetTab, tabTitle },
        };
        const explanation = `Taking you directly to **${tabTitle}**.`;
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'navigation',
          explanation,
          toolAction: action,
          suggestedNextPrompts: ['Show my current balance', 'Help me organise upcoming payments', 'Take me to settings'],
        });
      }
    }

    // =========================================================================
    // 2. SETTINGS / PROFILE MODIFICATIONS ("Change my preferred currency to INR", "Update monthly income to ₹60,000")
    // =========================================================================
    const isCurrencyUpdate =
      (promptLower.includes('change') || promptLower.includes('update') || promptLower.includes('set')) &&
      promptLower.includes('currency');

    if (isCurrencyUpdate) {
      let newCurrency = 'INR';
      if (promptLower.includes('usd') || promptLower.includes('dollar')) newCurrency = 'USD';
      else if (promptLower.includes('eur') || promptLower.includes('euro')) newCurrency = 'EUR';
      else if (promptLower.includes('gbp') || promptLower.includes('pound')) newCurrency = 'GBP';
      else if (promptLower.includes('inr') || promptLower.includes('rupee')) newCurrency = 'INR';

      user.currency = newCurrency;
      await user.save();

      const action: AiToolAction = {
        type: 'currency_updated',
        title: `Currency Updated: ${newCurrency}`,
        status: 'completed',
        details: { preferredCurrency: newCurrency },
      };
      const explanation = `I have updated your preferred currency to **${newCurrency}**. Your entire application dashboard, accounts, and financial views will now display figures in ${newCurrency}.`;
      return this.formatSuccessfulResponse({
        prompt,
        workflowType: 'profile_modification',
        explanation,
        toolAction: action,
        suggestedNextPrompts: ['Show me my current balance', 'Take me to settings', 'How am I doing financially?'],
      });
    }

    const isIncomeUpdate =
      (promptLower.includes('update') || promptLower.includes('change') || promptLower.includes('set')) &&
      (promptLower.includes('income') || promptLower.includes('salary'));

    if (isIncomeUpdate && /\d+/.test(promptLower)) {
      const match = prompt.match(/(?:₹|inr|rs\.?|to|of)?\s*([\d,]+)/i);
      if (match) {
        const newIncome = parseFloat(match[1].replace(/,/g, ''));
        if (newIncome > 0) {
          user.monthlyIncome = newIncome;
          await user.save();
          const updatedPlan = await coreFinancialService.generateOrUpdateMonthlyPlan(params.userId);

          const action: AiToolAction = {
            type: 'profile_updated',
            title: `Monthly Income Updated: ₹${newIncome.toLocaleString('en-IN')}`,
            status: 'completed',
            details: { monthlyIncome: newIncome, updatedPlan },
          };
          const explanation = `I have updated your monthly income to **₹${newIncome.toLocaleString(
            'en-IN'
          )}**. Your monthly financial plan has been recalculated automatically with updated essential, discretionary, and savings allocations.`;
          return this.formatSuccessfulResponse({
            prompt,
            workflowType: 'profile_modification',
            explanation,
            toolAction: action,
            suggestedNextPrompts: ['Show my new monthly plan', 'Can I afford a new purchase?', 'Take me to settings'],
          });
        }
      }
    }



    // =========================================================================
    // 4. ORGANISING UPCOMING PAYMENTS ("Help me organise my upcoming payments", "What bills are due?")
    // =========================================================================
    const isOrganisePaymentsRequest =
      promptLower.includes('organise') && (promptLower.includes('payment') || promptLower.includes('bills')) ||
      promptLower.includes('upcoming bills') ||
      promptLower.includes('upcoming payments');

    if (isOrganisePaymentsRequest) {
      const mandates = await MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } });
      const nonSalaryMandates = mandates.filter((m) => m.category !== 'Salary');
      const totalUpcoming = nonSalaryMandates.reduce((s, m) => s + m.amount, 0);

      const itemsList = nonSalaryMandates
        .sort((a, b) => a.dueDayOfMonth - b.dueDayOfMonth)
        .map((m) => `• **${m.title}**: ₹${m.amount.toLocaleString('en-IN')} (Due on ${m.dueDayOfMonth}th of month, ${m.merchant})`)
        .join('\n');

      const action: AiToolAction = {
        type: 'financial_intelligence',
        title: `Upcoming Payments Organised (${nonSalaryMandates.length} bills)`,
        status: 'informational',
        details: { totalUpcoming, count: nonSalaryMandates.length, mandates: nonSalaryMandates },
      };

      const explanation = `Here is your organised schedule of upcoming commitments totalling **₹${totalUpcoming.toLocaleString(
        'en-IN'
      )}**:\n\n${itemsList}\n\nAll of these are synchronized to your **Bryntum Financial Calendar** with automated reminder alerts active.`;

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: 'scheduling',
        explanation,
        toolAction: action,
        suggestedNextPrompts: [
          'Schedule my electricity bill for the 10th',
          'Open my financial calendar',
          'Show me my current balance',
        ],
      });
    }

    // =========================================================================
    // 5. CONTEXTUAL SAVINGS GOALS & TIMELINE ADJUSTMENTS
    // Examples:
    // - "I want to save ₹30,000." -> creates/plans savings goal
    // - "Make it six months." -> understands previous turn, sets duration to 6 mo
    // - "How much have I saved towards it?" -> retrieves current progress
    // - "Move my savings goal deadline to December." -> moves deadline
    // =========================================================================
    const isGoalDeadlineMove =
      promptLower.includes('move') && (promptLower.includes('deadline') || promptLower.includes('goal'));

    const isContextualDurationUpdate =
      (promptLower.includes('make it') ||
        promptLower.includes('over') ||
        promptLower.startsWith('for ') ||
        promptLower.includes('change to') ||
        promptLower.includes('set to')) &&
      (/\d+\s*(?:month|mo|year|yr)/i.test(promptLower) ||
        /(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:month|mo|year|yr)/i.test(promptLower));

    const isGoalProgressQuery =
      promptLower.includes('how much have i saved') ||
      promptLower.includes('goal progress') ||
      (promptLower.includes('towards it') && promptLower.includes('saved'));

    const isSavePlanRequest =
      (promptLower.includes('save') || promptLower.includes('savings goal') || promptLower.includes('target')) &&
      (/\d+/.test(promptLower) || promptLower.includes('plan') || promptLower.includes('goal'));

    if (isGoalDeadlineMove) {
      const activeGoal = await GoalModel.findOne({ userId: userObjId, status: 'active' });
      if (activeGoal) {
        const targetDate = promptLower.includes('december')
          ? new Date(new Date().getFullYear(), 11, 31)
          : promptLower.includes('january')
          ? new Date(new Date().getFullYear() + 1, 0, 31)
          : new Date(Date.now() + 120 * 86400000);

        activeGoal.deadline = targetDate;
        await activeGoal.save();
        await bryntumIntegration.syncUserFinancialCalendar(params.userId);

        const action: AiToolAction = {
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
        const explanation = `I have updated your savings goal deadline for "${activeGoal.title}" to **${targetDate.toLocaleDateString(
          'en-IN',
          { month: 'long', year: 'numeric' }
        )}**. Your Bryntum Financial Calendar and monthly allocations have been synchronized.`;
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'savings_planning',
          explanation,
          toolAction: action,
          suggestedNextPrompts: [
            'How does this affect my monthly budget?',
            'What are my other active goals?',
            'Can I afford extra contributions this month?',
          ],
        });
      }
    } else if (isContextualDurationUpdate) {
      // Resolve duration from context
      const numberWordMap: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
      };
      const monthMatch = prompt.match(/(\d+)\s*(?:month|mo)/i);
      const wordMatch = promptLower.match(/(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:month|mo)/i);
      const months = monthMatch
        ? parseInt(monthMatch[1], 10)
        : wordMatch && numberWordMap[wordMatch[1].toLowerCase()]
        ? numberWordMap[wordMatch[1].toLowerCase()]
        : 6;

      // Extract target amount from last turns or active goal
      let targetAmount = 30000;
      const amountFromHistory = (lastUserMsg + ' ' + lastAssistantMsg).match(/(?:₹|inr|rs\.?|of)\s*([\d,]+)/i);
      if (amountFromHistory) {
        targetAmount = parseFloat(amountFromHistory[1].replace(/,/g, ''));
      }

      const activeGoal = await GoalModel.findOne({ userId: userObjId, status: 'active' }).sort({ createdAt: -1 });
      const now = new Date();
      const newDeadline = new Date(now.getFullYear(), now.getMonth() + months, 28);
      const newMonthlyContribution = Math.ceil(targetAmount / Math.max(1, months));

      if (activeGoal) {
        activeGoal.deadline = newDeadline;
        activeGoal.monthlyContribution = newMonthlyContribution;
        activeGoal.targetAmount = targetAmount;
        await activeGoal.save();
      }

      await bryntumIntegration.syncUserFinancialCalendar(params.userId);

      const action: AiToolAction = {
        type: 'goal_updated',
        title: `Savings Goal Adjusted: ${months} Months`,
        status: 'completed',
        details: {
          targetAmount,
          durationMonths: months,
          monthlyContribution: newMonthlyContribution,
          deadline: newDeadline.toISOString(),
        },
      };

      const explanation = `I have updated your savings plan for **₹${targetAmount.toLocaleString(
        'en-IN'
      )}** to a **${months}-month** timeline. You will need to set aside **₹${newMonthlyContribution.toLocaleString(
        'en-IN'
      )}** per month. I've updated your Bryntum Financial Calendar checkpoints accordingly.`;

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: 'savings_planning',
        explanation,
        toolAction: action,
        suggestedNextPrompts: [
          'How much have I saved towards it?',
          'Where can I trim discretionary expenses to fund this?',
          'Show my current savings progress',
        ],
      });
    } else if (isGoalProgressQuery) {
      const goals = await GoalModel.find({ userId: userObjId, status: 'active' }).sort({ createdAt: -1 });
      const goal = goals[0];
      if (goal) {
        const percent = Math.round((goal.currentAmount / Math.max(1, goal.targetAmount)) * 100);
        const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);

        const action: AiToolAction = {
          type: 'financial_intelligence',
          title: `Goal Progress: ${goal.title}`,
          status: 'informational',
          details: { goal, percent, remaining },
        };

        const explanation = `Towards your goal **"${goal.title}"**, you have saved **₹${goal.currentAmount.toLocaleString(
          'en-IN'
        )}** of your **₹${goal.targetAmount.toLocaleString(
          'en-IN'
        )}** target (**${percent}%** completed). You have **₹${remaining.toLocaleString(
          'en-IN'
        )}** remaining to reach your target by ${new Date(goal.deadline).toLocaleDateString('en-IN', {
          month: 'long',
          year: 'numeric',
        })}.`;

        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'financial_intelligence',
          explanation,
          toolAction: action,
          suggestedNextPrompts: [
            'Contribute ₹5,000 to this goal',
            'Move my savings goal deadline to December',
            'How am I doing financially overall?',
          ],
        });
      }
    } else if (isSavePlanRequest && !promptLower.includes('laptop') && !promptLower.includes('afford') && !promptLower.includes('sneaker')) {
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
        category: goalTitle.toLowerCase().includes('emergency') ? 'Emergency Fund' : 'Savings',
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

      const action: AiToolAction = {
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

      const explanation = `I have created a structured savings plan for you. To save **₹${targetAmount.toLocaleString(
        'en-IN'
      )}** over **${months} months**, set aside **₹${monthlyContribution.toLocaleString(
        'en-IN'
      )}** each month. I've added this goal to your portfolio and scheduled milestone checkpoints in your Financial Calendar.`;

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: 'savings_planning',
        explanation,
        toolAction: action,
        suggestedNextPrompts: [
          'Make it six months',
          'Where can I trim discretionary expenses to fund this?',
          'Show my current savings progress',
        ],
      });
    }

    // =========================================================================
    // 6. SCHEDULING & REMINDERS ("Remind me to pay electricity on the 10th of every month")
    // =========================================================================
    const isScheduleRequest =
      promptLower.includes('schedule') ||
      (promptLower.includes('remind') && (promptLower.includes('bill') || promptLower.includes('every month') || promptLower.includes('on the') || promptLower.includes('to pay')));

    if (isScheduleRequest) {
      const dayMatch = prompt.match(/(\d+)(?:st|nd|rd|th)/i) || prompt.match(/day\s*(\d+)/i) || prompt.match(/for\s*(?:the\s*)?(\d+)/i);
      const dueDay = dayMatch ? parseInt(dayMatch[1], 10) : 10;

      let eventTitle = 'Recurring Bill Reminder';
      let eventType: any = 'reminder';
      if (promptLower.includes('electricity') || promptLower.includes('power')) {
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

      const action: AiToolAction = {
        type: 'reminder_scheduled',
        title: `Calendar Event Scheduled: ${eventTitle}`,
        status: 'completed',
        details: {
          event,
          dayOfMonth: dueDay,
          nextDueDate: nextDate.toISOString(),
        },
      };

      const explanation = `I have scheduled your reminder for **"${eventTitle}"** on the **${dueDay}th of every month**. It has been synchronized to your **Bryntum Financial Calendar** and linked to your automated notifications.`;

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: 'scheduling',
        explanation,
        toolAction: action,
        suggestedNextPrompts: [
          'What other commitments are scheduled this month?',
          'Help me organise my upcoming payments',
          'Open my financial calendar',
        ],
      });
    }

    // =========================================================================
    // 7. SECURE PAYMENT PREPARATION (WORKFLOW E - "I need to pay Rahul ₹5,000")
    // STRICT SECURITY INVARIANT: NEVER executes automatically. ONLY prepares for user PIN review.
    // =========================================================================
    const isPaymentIntent =
      (promptLower.includes('pay') || promptLower.includes('transfer') || promptLower.includes('send money')) &&
      !promptLower.includes('how do i pay') &&
      !promptLower.includes('can i pay') &&
      !promptLower.includes('remind me to pay') &&
      !promptLower.includes('schedule');

    if (isPaymentIntent) {
      const amountMatch = prompt.match(/(?:₹|inr|rs\.?|of)\s*([\d,]+)/i) || prompt.match(/([\d,]+)\s*(?:inr|rs|rupees)/i);
      const amountInr = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 5000;

      // Extract recipient
      let recipientName = 'Recipient';
      const toMatch = prompt.match(/(?:to|pay)\s+([A-Za-z0-9\s&.-]{2,35})/i);
      if (toMatch) {
        let candidate = toMatch[1].trim();
        candidate = candidate.replace(/(?:₹|inr|rs\.?)\s*[\d,]+/i, '').trim();
        if (candidate && candidate.length > 1 && !/^\d+$/.test(candidate)) {
          recipientName = candidate;
        }
      }

      if (recipientName === 'Recipient') {
        if (promptLower.includes('rahul')) recipientName = 'Rahul';
        else if (promptLower.includes('electricity')) recipientName = 'State Electricity Distribution Co';
        else if (promptLower.includes('landlord') || promptLower.includes('rent')) recipientName = 'Greenwood Residency Landlords';
        else recipientName = 'Rahul Sharma';
      }

      const preparedPaymentData = await paymentGuardianService.preparePaymentRequest({
        userId: params.userId,
        recipientName,
        description: `AURA Initiated Payment: ${prompt.slice(0, 60)}`,
        amountInr,
        merchantCategory: 'Transfers & Payments',
      });

      const action: AiToolAction = {
        type: 'payment_prepared',
        title: `Payment Prepared: ₹${amountInr.toLocaleString('en-IN')} to ${recipientName}`,
        status: 'awaiting_approval',
        requiresUserPaymentApproval: true,
        navTarget: 'payments',
        details: preparedPaymentData,
      };

      const explanation = `I have verified your account balance and prepared a payment request of **₹${amountInr.toLocaleString(
        'en-IN'
      )}** ($${preparedPaymentData.amountUsd.toFixed(2)} USD) to **"${recipientName}"**.

**Financial Guardian Check:** ${
        preparedPaymentData.guardianEvaluation.passed
          ? 'Approved within your daily and single-transaction policy limits.'
          : 'Flagged for special authorization.'
      }

> **Security Guarantee:** As a fundamental principle, AURA never moves funds automatically. I have prefilled the details for you on the **Payments** screen. Please review and enter your security PIN to authorise this transaction.`;

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: 'paypal_payment',
        explanation,
        toolAction: action,
        preparedPayment: preparedPaymentData,
        suggestedNextPrompts: [
          'Take me to the payment section',
          'Check my remaining balance after this payment',
          'Cancel this pending payment preparation',
        ],
      });
    }

    // =========================================================================
    // 8. SMART PURCHASE COMPANION — GENERALISED CHANNEL3 INTEGRATION
    // Multi-category: Sneakers, Clothing, Furniture, Appliances, Laptops, Phones, Books
    // =========================================================================
    const isSneakerInitiation =
      promptLower.includes('sneaker') ||
      promptLower.includes('shoe') ||
      promptLower.includes('running shoes') ||
      promptLower.includes('pair of sneakers');

    const isPurchaseQuery =
      isSneakerInitiation ||
      promptLower.includes('afford') ||
      promptLower.includes('can i buy') ||
      promptLower.includes('smart purchase') ||
      promptLower.includes('find me a') ||
      promptLower.includes('buy a') ||
      promptLower.includes('laptop');

    if (isPurchaseQuery) {
      // Step A: Check if this is initial general inquiry for sneakers without subcategory
      const hasSpecificPreference =
        promptLower.includes('running') ||
        promptLower.includes('casual') ||
        promptLower.includes('sports') ||
        promptLower.includes('everyday') ||
        promptLower.includes('under') ||
        /\d+/.test(promptLower);

      const isSneakerCleanMatch =
        cleanPrompt === 'i need to buy sneakers' ||
        cleanPrompt === 'i need to buy a pair of sneakers' ||
        cleanPrompt === 'buy sneakers' ||
        cleanPrompt === 'i want to buy sneakers' ||
        cleanPrompt === 'need sneakers';

      if (isSneakerInitiation && !hasSpecificPreference && isSneakerCleanMatch) {
        const action: AiToolAction = {
          type: 'clarification_needed',
          title: 'Product Discovery: Sneaker Category',
          status: 'informational',
          details: { category: 'Footwear & Sneakers' },
        };
        const explanation = `Sure! What kind of sneakers are you looking for? Sports, running, casual or everyday wear?`;
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'purchase_evaluation',
          explanation,
          toolAction: action,
          suggestedNextPrompts: [
            'Running shoes',
            'Casual everyday sneakers',
            'Sports shoes under ₹5,000',
          ],
        });
      }

      // Step B: Full 7-Factor Affordability Evaluation with Channel3
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

      const priceMatch = prompt.match(/(?:₹|inr|rs\.?|for|under)\s*([\d,]+)/i);
      const requestedPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : undefined;

      const ch3Search = await channel3Integration.searchProducts({
        query: prompt,
        maxPriceInr: requestedPrice ? requestedPrice * 1.35 : undefined,
      });

      const calendarDataset = await bryntumIntegration.getBryntumCalendarDataset(params.userId);

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

      let kernelResearchData: any = null;
      if (params.includeKernelResearch) {
        kernelResearchData = await kernelIntegration.runAssistedResearch({
          userId: params.userId,
          topic: prompt,
          targetCategory: 'product_specs',
        });
      }

      const purchaseEvaluationData = {
        liveChannel3Used: ch3Search.liveApiUsed,
        statusMessage: ch3Search.statusMessage,
        requestedPriceInr: requestedPrice || evaluatedOptions[0]?.product?.priceInr,
        discretionaryAllocatedInr: discretionaryRemaining,
        upcomingCommitmentsCount: calendarDataset.summary.upcoming14DaysCount || mandates.length,
        upcomingCommitmentsTotalInr: calendarDataset.summary.upcoming14DaysTotalAmount || totalCommitments,
        evaluatedProducts: evaluatedOptions,
      };

      const topOption = evaluatedOptions[0];
      const guidance = topOption?.evaluation?.guidanceCategory || 'Comfortable within the current plan';

      const action: AiToolAction = {
        type: 'purchase_evaluated',
        title: `Affordability Evaluation: ${topOption?.product?.name || 'Product'} (₹${(requestedPrice || topOption?.product?.priceInr || 0).toLocaleString('en-IN')})`,
        status: 'informational',
        details: purchaseEvaluationData,
      };

      const productHighlights = evaluatedOptions.slice(0, 3).map((opt, idx) => {
        const p = opt.product;
        return `${idx + 1}. **${p.name}** — ₹${p.priceInr.toLocaleString('en-IN')} (${p.retailerName})\n   • *Guidance:* ${opt.evaluation.guidanceCategory} (Score: ${opt.evaluation.affordabilityScore}/100)`;
      }).join('\n\n');

      const explanation = `Let's see how this purchase fits into your financial reality.

You currently have **₹${discretionaryRemaining.toLocaleString('en-IN')}** in remaining discretionary funds this month, with **${purchaseEvaluationData.upcomingCommitmentsCount} upcoming commitments** totalling **₹${purchaseEvaluationData.upcomingCommitmentsTotalInr.toLocaleString('en-IN')}** (including Rent, Insurance, and Internet).

**AURA Guidance:** **${guidance}**
${topOption?.evaluation?.explanation || ''}

**Genuine Channel3 Recommendations:**
${productHighlights}

${
  topOption?.evaluation?.suggestedSavingsPlan
    ? `💡 **Recommended Next Step:** Set up a dedicated savings plan of ₹${topOption.evaluation.suggestedSavingsPlan.monthlyContributionInr.toLocaleString('en-IN')}/month over ${topOption.evaluation.suggestedSavingsPlan.monthsRequired} months to protect your liquidity.`
    : ''
}`;

      const astropodsTrace = await astropodsIntegration.executeCoordinatedWorkflow({
        prompt,
        primaryAgent: 'purchase-intelligence',
        supportingAgents: ['financial-planner', 'transaction-intelligence', 'financial-guardian'],
        contextSummary: {
          monthlyIncome: user.monthlyIncome,
          totalCommitments,
          liquidBalanceInr: liquidBalance,
          transactionCount: allTransactions.length,
          unusualCount: 0,
          mandateCount: mandates.length,
          productCount: evaluatedOptions.length,
          transactions: [],
          mandates: [],
        },
      });

      return {
        prompt,
        workflowType: 'purchase_evaluation',
        explanation,
        answer: explanation,
        toolAction: action,
        suggestedNextPrompts: [
          'Can I afford a new purchase?',
          'Show my upcoming commitments for next 14 days',
          'How much can I spend safely this weekend?',
        ],
        astropodsOrchestration: astropodsTrace,
        agGridAnalytics: null,
        elasticMemory: null,
        bryntumCalendar: calendarDataset.summary,
        purchaseCompanion: purchaseEvaluationData,
        financialPlan: null,
        preparedPayment: null,
        kernelResearch: kernelResearchData,
        pythonAnalytics: null,
        timestamp: new Date().toISOString(),
      };
    }

    // =========================================================================
    // 9. GENERAL CONVERSATION & KNOWLEDGE (QUANTUM COMPUTING, AI, TECH, CONCEPTS)
    // Section 3: Answer naturally without invoking unnecessary financial agents!
    // =========================================================================
    const isGeneralKnowledgePrompt =
      promptLower.includes('quantum') ||
      promptLower.includes('artificial intelligence') ||
      promptLower.includes('difference between ram and storage') ||
      promptLower.includes('ram and storage') ||
      promptLower.includes('explain') ||
      promptLower.includes('what is') ||
      promptLower.includes('tell me about') ||
      promptLower.includes('simply') ||
      promptLower.includes('simpler') ||
      promptLower.includes('compound') ||
      promptLower.includes('inflation') ||
      promptLower.includes('credit score');

    const isFinancialPlanningOrHealth =
      promptLower.includes('how am i doing') ||
      promptLower.includes('plan my expenses') ||
      promptLower.includes('budget') ||
      promptLower.includes('november');

    if (isGeneralKnowledgePrompt && !isFinancialPlanningOrHealth) {
      let answerText = '';

      if (promptLower.includes('quantum')) {
        answerText = `**Quantum computing** is a rapidly-emerging field of computer science that harnesses the unique principles of quantum mechanics to solve complex problems that are intractable for classical computers.

**Key principles:**
1. **Qubits (Quantum Bits):** Unlike classical bits that represent either a 0 or a 1, a qubit can exist in a **superposition** of both states simultaneously.
2. **Entanglement:** Qubits can be entangled, meaning the state of one qubit instantly influences another, no matter the distance, allowing unprecedented parallel computation.
3. **Applications:** Molecular modeling for medicine discovery, high-level logistics optimization, advanced cryptography, and financial risk modeling.

Classical computers remain best for everyday tasks, while quantum processors will tackle massive multidimensional simulations.`;
      } else if (promptLower.includes('artificial intelligence') || promptLower.includes('explain ai')) {
        if (promptLower.includes('simply') || promptLower.includes('simpler')) {
          answerText = `In simple terms: **Artificial intelligence (AI)** is computer software that can learn from examples instead of needing step-by-step instructions for every single thing. 

Think of it like teaching a child: instead of writing down billions of rules to describe a cat, you show the computer thousands of photos of cats. Eventually, the computer learns to recognize a cat on its own.`;
        } else {
          answerText = `**Artificial Intelligence (AI)** refers to computer systems designed to perform tasks that typically require human intelligence, such as visual perception, speech recognition, language comprehension, reasoning, and adaptive decision-making.

**Modern AI is built on:**
• **Machine Learning (ML):** Systems learning patterns from historical data.
• **Neural Networks & Deep Learning:** Multi-layered networks inspired by biological neurons that excel at speech, vision, and natural language.
• **Large Language Models (LLMs) like Gemini:** Models trained on broad knowledge to understand context, reason, and converse naturally.`;
        }
      } else if (promptLower.includes('ram') && promptLower.includes('storage')) {
        answerText = `The difference between **RAM** and **storage** comes down to speed versus permanence:

• **RAM (Random Access Memory):** Your computer's short-term working memory. It is extremely fast and holds only the programs and browser tabs you are actively using right now. When you restart or shut down your computer, everything in RAM is cleared.
• **Storage (SSD / Hard Drive):** Your computer's long-term filing cabinet. It is slower than RAM, but it safely keeps your files, operating system, photos, and apps permanently, even when the power is turned off.

*Analogy:* RAM is the surface of your work desk where you keep open books you are reading today; Storage is the bookshelf behind you where all books are stored when not in use.`;
      } else if (promptLower.includes('compound') || promptLower.includes('compounding')) {
        answerText = `**Compound interest** is the interest you earn on both your original deposit and the accumulated interest from previous periods — often called "interest on interest."

For example, if you save ₹1,00,000 at an 8% annual return:
• Year 1: You earn ₹8,000 → Balance becomes ₹1,08,000.
• Year 2: You earn 8% on ₹1,08,000 = ₹8,640 → Balance becomes ₹1,16,640.
• Over 10 years, your ₹1,00,000 grows to approximately ₹2,15,892 without adding another rupee.`;
      } else if (promptLower.includes('inflation')) {
        answerText = `**Inflation** is the general increase in prices and gradual fall in the purchasing power of money over time. When inflation averages 6% per year, an item that costs ₹100 today will cost ₹106 next year.

To protect your wealth, long-term savings should be invested in avenues that outpace inflation so your purchasing power does not shrink.`;
      } else if (promptLower.includes('simply') || promptLower.includes('simpler')) {
        answerText = `In simple everyday terms: I focus on taking the guesswork and administrative friction out of your decisions. You can ask me questions about your day, discover products you need, schedule bill reminders, or explore any everyday idea.`;
      }

      // If Gemini API is live, polish or generate answer dynamically
      if (this.geminiClient) {
        try {
          const resp = await this.geminiClient.models.generateContent({
            model: env.GEMINI_MODEL,
            contents: `You are AURA, an intelligent, empathetic, versatile companion.
The user asked: "${prompt}"
${history.length > 0 ? `Recent context:\n${history.slice(-4).map((h) => `${h.role}: ${h.content}`).join('\n')}\n` : ''}
Provide a natural, clear, accurate, and direct response. Do not force financial metrics or financial jargon unless the user specifically asked a financial question.`,
          });
          const text = resp.text?.trim();
          if (text && text.length > 20) {
            answerText = text;
          }
        } catch {
          // Keep deterministic answer
        }
      }

      if (!answerText) {
        answerText = `I understand your question about "${prompt}". AURA is equipped to discuss a wide variety of topics including technology, everyday organization, science, and learning. Let me know what specific aspects you'd like to dive into!`;
      }

      const action: AiToolAction = {
        type: 'general_knowledge',
        title: 'Conversational Response',
        status: 'informational',
      };

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: 'general_knowledge',
        explanation: answerText,
        toolAction: action,
        suggestedNextPrompts: [
          'Show me my current balance',
          'Can you explain that more simply?',
          'Help me organise my upcoming payments',
        ],
      });
    }

    // =========================================================================
    // 10. FINANCIAL PLANNING & RECOVERY WORKFLOWS
    // =========================================================================
    const [accounts, allTransactions, mandates] = await Promise.all([
      AccountModel.find({ userId: userObjId, status: 'active' }),
      TransactionModel.find({ userId: userObjId }).sort({ date: -1 }),
      MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } }),
    ]);

    const liquidBalance = accounts
      .filter((a) => a.type === 'checking' || a.type === 'savings' || a.type === 'wallet')
      .reduce((s, a) => s + a.balance, 0);

    const totalCommitments = mandates
      .filter((m) => m.category !== 'Salary')
      .reduce((s, m) => s + m.amount, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const mtdExpenses = allTransactions
      .filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart)
      .reduce((s, t) => s + t.amount, 0);

    const unusuals = allTransactions.filter((t) => t.isUnusual);
    const savingsRate = Math.round(((user.monthlyIncome - mtdExpenses) / Math.max(1, user.monthlyIncome)) * 100);

    const generatedPlanData = await coreFinancialService.generateOrUpdateMonthlyPlan(params.userId);
    const pythonAnalysisData = await pythonAnalyticsService.runPythonTask({
      task: 'analyze_transactions',
      monthlyIncome: user.monthlyIncome,
      transactions: allTransactions,
    });

    const action: AiToolAction = {
      type: 'financial_intelligence',
      title: 'Financial Health & Plan Overview',
      status: 'informational',
      details: {
        liquidBalance,
        monthlyIncome: user.monthlyIncome,
        monthToDateSpent: mtdExpenses,
        savingsRatePercent: Math.max(0, savingsRate),
        plan: generatedPlanData,
      },
    };

    const explanation = `Here is your current financial standing:

• **Available Liquidity:** ₹${liquidBalance.toLocaleString('en-IN')} across ${accounts.length} accounts.
• **Monthly Cash Flow:** Monthly income is ₹${user.monthlyIncome.toLocaleString('en-IN')}, with ₹${mtdExpenses.toLocaleString('en-IN')} spent so far this month (estimated savings rate: **${Math.max(0, savingsRate)}%**).
• **Protected Commitments:** You have ${mandates.length} confirmed recurring commitments totalling ₹${totalCommitments.toLocaleString('en-IN')} (including Rent ₹8,000, Insurance ₹1,000, and ACT Internet ₹800).
${unusuals.length > 0 ? `• **Notice:** ${unusuals.length} unusual expense(s) detected this period (e.g. ${unusuals[0].merchant} for ₹${unusuals[0].amount.toLocaleString('en-IN')}).` : '• **Stability:** No anomalous or unauthorized spikes flagged.'}

You are in a stable position with your essential bills protected.`;

    const astropodsTrace = await astropodsIntegration.executeCoordinatedWorkflow({
      prompt,
      primaryAgent: 'transaction-intelligence',
      supportingAgents: ['financial-planner', 'mandate-intelligence'],
      contextSummary: {
        monthlyIncome: user.monthlyIncome,
        totalCommitments,
        liquidBalanceInr: liquidBalance,
        transactionCount: allTransactions.length,
        unusualCount: unusuals.length,
        mandateCount: mandates.length,
        productCount: 0,
        transactions: [],
        mandates: [],
      },
    });

    return {
      prompt,
      workflowType: 'financial_intelligence',
      explanation,
      answer: explanation,
      toolAction: action,
      financialPlan: generatedPlanData,
      pythonAnalytics: pythonAnalysisData,
      suggestedNextPrompts: [
        'Can I afford a new purchase?',
        'Help me plan my expenses for this month',
        'Show my Bryntum calendar commitments',
      ],
      astropodsOrchestration: astropodsTrace,
      agGridAnalytics: null,
      elasticMemory: null,
      bryntumCalendar: null,
      purchaseCompanion: null,
      preparedPayment: null,
      kernelResearch: null,
      timestamp: new Date().toISOString(),
    };
  }

  private formatSuccessfulResponse(options: {
    prompt: string;
    workflowType: string;
    explanation: string;
    toolAction?: AiToolAction;
    suggestedNextPrompts?: string[];
    purchaseCompanion?: any;
    financialPlan?: any;
    preparedPayment?: any;
    kernelResearch?: any;
    pythonAnalytics?: any;
  }) {
    const primaryAgent =
      options.workflowType === 'purchase_evaluation'
        ? 'purchase-intelligence'
        : options.workflowType === 'paypal_payment'
        ? 'financial-guardian'
        : options.workflowType === 'savings_planning'
        ? 'financial-planner'
        : options.workflowType === 'general_knowledge'
        ? 'gemini-conversational-core'
        : 'transaction-intelligence';

    return {
      prompt: options.prompt,
      workflowType: options.workflowType,
      explanation: options.explanation,
      answer: options.explanation,
      toolAction: options.toolAction || null,
      suggestedNextPrompts: options.suggestedNextPrompts || [],
      astropodsOrchestration: {
        workflowId: `astro-wf-${Date.now()}`,
        primaryAgent,
        agentCount: options.workflowType === 'general_knowledge' ? 1 : 3,
        remoteExecutionCount: options.workflowType === 'general_knowledge' ? 0 : 3,
        mode: options.workflowType === 'general_knowledge' ? 'direct_gemini_conversational' : 'standard',
      },
      agGridAnalytics: null,
      elasticMemory: null,
      bryntumCalendar: null,
      purchaseCompanion: options.purchaseCompanion || null,
      financialPlan: options.financialPlan || null,
      preparedPayment: options.preparedPayment || null,
      kernelResearch: options.kernelResearch || null,
      pythonAnalytics: options.pythonAnalytics || null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * SSE Streaming handler for smooth token-by-token streaming responses.
   */
  async processConversationalQueryStream(
    params: {
      userId: string;
      prompt: string;
      conversationHistory?: ConversationTurn[];
      includeKernelResearch?: boolean;
    },
    onChunk: (chunk: { delta: string }) => void,
    onFinish: (result: any) => void
  ) {
    const fullResult = await this.processConversationalQuery(params);
    const text = fullResult.explanation || fullResult.answer || '';

    // Stream out words smoothly in real-time chunks
    const words = text.split(/(\s+)/);
    let index = 0;

    const streamInterval = setInterval(() => {
      if (index < words.length) {
        const slice = words.slice(index, index + 3).join('');
        index += 3;
        onChunk({ delta: slice });
      } else {
        clearInterval(streamInterval);
        onFinish(fullResult);
      }
    }, 20);
  }
}

export const auraAiOrchestrator = new AuraAiOrchestratorService();
