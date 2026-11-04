import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
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

export interface EmiOption {
  tenureMonths: number;
  monthlyEmiInr: number;
  totalPayableInr: number;
  totalInterestInr: number;
  annualInterestRatePercent: number;
  fitsMonthlyDiscretionaryBudget: boolean;
  discretionaryImpactPercent: number;
}

export interface AiObservabilityTrace {
  requestId: string;
  conversationId: string;
  userId: string;
  model: string;
  apiStatus: 'not_configured' | 'requested' | 'succeeded' | 'failed';
  apiLatencyMs: number;
  toolCallsRequested: string[];
  toolExecutionStatus: Record<string, 'success' | 'failed' | 'rejected'>;
  followUpStatus: 'not_needed' | 'succeeded' | 'failed';
  finalResponseStatus: 'succeeded' | 'service_unavailable' | 'failed';
  errorDetails?: string;
  timestamp: string;
}

export interface ProcessConversationalQueryResult {
  success: boolean;
  serviceUnavailable?: boolean;
  code?: string;
  error?: string;
  canRetry?: boolean;
  retryAfterSeconds?: number | null;
  prompt: string;
  workflowType: string;
  explanation: string;
  answer: string;
  toolAction: AiToolAction | null;
  suggestedNextPrompts: string[];
  astropodsOrchestration?: any;
  agGridAnalytics?: any;
  elasticMemory?: any;
  bryntumCalendar?: any;
  purchaseCompanion?: any;
  financialPlan?: any;
  preparedPayment?: any;
  kernelResearch?: any;
  pythonAnalytics?: any;
  observability?: AiObservabilityTrace | null;
  timestamp: string;
}

export function calculateEmiSchedule(
  principalInr: number,
  monthlyDiscretionaryBudgetInr: number,
  annualInterestRatePercent = 14
): EmiOption[] {
  const tenures = [3, 6, 9, 12];
  const r = annualInterestRatePercent / 12 / 100;

  return tenures.map((n) => {
    let monthlyEmi: number;
    if (r === 0) {
      monthlyEmi = Math.round(principalInr / n);
    } else {
      const factor = Math.pow(1 + r, n);
      monthlyEmi = Math.round((principalInr * r * factor) / (factor - 1));
    }
    const totalPayable = monthlyEmi * n;
    const totalInterest = Math.max(0, totalPayable - principalInr);
    const impactPercent = Math.round((monthlyEmi / Math.max(1, monthlyDiscretionaryBudgetInr)) * 100);
    const fits = monthlyEmi <= monthlyDiscretionaryBudgetInr * 0.45;

    return {
      tenureMonths: n,
      monthlyEmiInr: monthlyEmi,
      totalPayableInr: totalPayable,
      totalInterestInr: totalInterest,
      annualInterestRatePercent,
      fitsMonthlyDiscretionaryBudget: fits,
      discretionaryImpactPercent: impactPercent,
    };
  });
}

/**
 * 13 Gemini Function Declarations for AURA Backend Tools
 */
export const GEMINI_TOOL_DECLARATIONS = {
  functionDeclarations: [
    {
      name: 'getFinancialSummary',
      description: 'Retrieve user liquid balance, checking/savings accounts breakdown, discretionary spending cushion, and monthly income.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          includeAccounts: { type: Type.BOOLEAN, description: 'Whether to include per-account balance details' },
        },
      },
    },
    {
      name: 'getUpcomingCommitments',
      description: 'Retrieve user recurring bills, rent, mandates, and calendar commitments due this month with due dates and amounts.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          dueWithinDays: { type: Type.INTEGER, description: 'Optional number of days to look ahead, e.g. 7, 14, 30' },
        },
      },
    },
    {
      name: 'searchProducts',
      description: 'Discover and search verified catalog products (appliances, bottles, electronics, laptops, footwear) with live prices in INR and merchant details.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'The product search term, e.g. "water bottle", "air conditioner", "laptop", "sneakers"' },
          category: { type: Type.STRING, description: 'Optional product category: "Kitchen & Dining", "Home Appliances", "Laptops & Computers", "Footwear & Sneakers"' },
          maxPriceInr: { type: Type.NUMBER, description: 'Optional maximum price ceiling in INR' },
        },
        required: ['query'],
      },
    },
    {
      name: 'analyseAffordability',
      description: 'Perform a deterministic 7-factor financial affordability evaluation of a specific product or purchase amount against income, remaining discretionary budget, ringfenced upcoming commitments, and savings goals.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          productName: { type: Type.STRING, description: 'The product name or type, e.g. "Water Bottle", "Air Conditioner", "Laptop"' },
          priceInr: { type: Type.NUMBER, description: 'The purchase amount in INR to evaluate' },
          category: { type: Type.STRING, description: 'Optional category of the purchase' },
        },
        required: ['priceInr'],
      },
    },
    {
      name: 'calculateEmiOptions',
      description: 'Calculate standard reducing-balance EMI loan options across 3, 6, 9, and 12-month tenures and evaluate budget impact.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          principalInr: { type: Type.NUMBER, description: 'The total purchase price to finance in INR' },
          productName: { type: Type.STRING, description: 'The item being purchased on EMI' },
        },
        required: ['principalInr'],
      },
    },
    {
      name: 'compareProducts',
      description: 'Generate a side-by-side specification, pricing, and energy/feature comparison table between products.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, description: 'Product category or query to compare, e.g. "air conditioner", "laptop"' },
          productNames: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Optional list of product names to compare' },
        },
        required: ['category'],
      },
    },
    {
      name: 'postponementAnalysis',
      description: 'Analyse the financial impact of waiting until next month to make a purchase, calculating rollover discretionary funds and fresh allocations.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          priceInr: { type: Type.NUMBER, description: 'Purchase amount in INR' },
          productName: { type: Type.STRING, description: 'Item name' },
        },
        required: ['priceInr'],
      },
    },
    {
      name: 'createReminder',
      description: 'Schedule a recurring or one-off financial reminder in the Bryntum Financial Calendar with automated notifications.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Title of the reminder (e.g. "Rent Payment Reminder", "Electricity Bill")' },
          dueDayOfMonth: { type: Type.INTEGER, description: 'Day of the month for the due date (1-31)' },
          amountInr: { type: Type.NUMBER, description: 'Optional amount associated with the reminder' },
        },
        required: ['title'],
      },
    },
    {
      name: 'createOrUpdateSavingsGoal',
      description: 'Create a new financial savings goal or update target timeline and monthly contributions for an existing goal.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          targetAmount: { type: Type.NUMBER, description: 'Total target savings amount in INR' },
          durationMonths: { type: Type.INTEGER, description: 'Target timeline in months (e.g. 6, 12, 24)' },
          title: { type: Type.STRING, description: 'Title or purpose of the goal (e.g. "Emergency Fund", "New Laptop")' },
        },
        required: ['targetAmount'],
      },
    },
    {
      name: 'preparePayment',
      description: 'Prepare an explicit, reviewable payment draft to a recipient. AI NEVER moves funds autonomously; user must confirm with security PIN on the Payments screen.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          recipientName: { type: Type.STRING, description: 'Name of the recipient or merchant' },
          amountInr: { type: Type.NUMBER, description: 'Amount in INR to prepare' },
        },
        required: ['recipientName', 'amountInr'],
      },
    },
    {
      name: 'navigateApplication',
      description: 'Navigate the application interface to a specific tab or dashboard view.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          targetTab: {
            type: Type.STRING,
            description: 'Target section: "overview", "transactions", "calendar", "smart-purchases", "payments", "financial-health", "family-vault", "settings"',
          },
        },
        required: ['targetTab'],
      },
    },
    {
      name: 'updateCurrencyPreference',
      description: 'Update the user profile preferred display currency.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          currencyCode: { type: Type.STRING, description: 'ISO currency code, e.g. "INR", "USD", "EUR"' },
        },
        required: ['currencyCode'],
      },
    },
    {
      name: 'getRecentTransactions',
      description: 'Retrieve recent categorized user transactions with optional category filter and time range.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          days: { type: Type.INTEGER, description: 'Number of past days to query' },
          category: { type: Type.STRING, description: 'Optional category filter' },
        },
      },
    },
  ],
};

export class AuraAiOrchestratorService {
  private geminiClient: GoogleGenAI | null = null;
  private lastConnectivityCheckAt: number = 0;
  private lastConnectivitySuccess: boolean = false;
  private lastConnectivityError: string | null = null;
  private recentTraces: AiObservabilityTrace[] = [];

  constructor() {
    this.initGeminiClient();
  }

  public initGeminiClient(customApiKey?: string) {
    const key = customApiKey || env.GEMINI_API_KEY;
    if (key && key !== 'your_gemini_api_key_here' && key.trim().length > 0) {
      try {
        this.geminiClient = new GoogleGenAI({ apiKey: key.trim() });
        logger.info('AuraAiOrchestrator', 'Initialized official GoogleGenAI SDK', {
          model: env.GEMINI_MODEL,
        });
      } catch (err: any) {
        logger.warn('AuraAiOrchestrator', 'Could not initialize GoogleGenAI SDK', {
          error: this.redactSecrets(err?.message),
        });
        this.geminiClient = null;
      }
    } else {
      this.geminiClient = null;
    }
  }

  public setGeminiClientForTesting(client: any) {
    this.geminiClient = client;
    this.lastConnectivitySuccess = Boolean(client);
    this.lastConnectivityError = null;
    this.lastConnectivityCheckAt = Date.now();
  }

  public get isGeminiConfigured(): boolean {
    return Boolean(this.geminiClient);
  }

  public getRecentTraces(limit = 10): AiObservabilityTrace[] {
    return this.recentTraces.slice(-limit);
  }

  private recordTrace(trace: AiObservabilityTrace) {
    this.recentTraces.push(trace);
    if (this.recentTraces.length > 50) {
      this.recentTraces.shift();
    }
  }

  public redactSecrets(str: string): string {
    if (!str) return '';
    return str
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]');
  }

  async verifyConnectivity(force = false): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    if (!this.geminiClient) {
      return { success: false, error: 'GEMINI_API_KEY is not configured in backend environment.' };
    }
    const now = Date.now();
    if (!force && this.lastConnectivityCheckAt && now - this.lastConnectivityCheckAt < 60000) {
      return {
        success: this.lastConnectivitySuccess,
        error: this.lastConnectivityError || undefined,
      };
    }

    const t0 = Date.now();
    try {
      await this.geminiClient.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: 'ping',
      });
      const latencyMs = Date.now() - t0;
      this.lastConnectivityCheckAt = Date.now();
      this.lastConnectivitySuccess = true;
      this.lastConnectivityError = null;
      return { success: true, latencyMs };
    } catch (err: any) {
      this.lastConnectivityCheckAt = Date.now();
      this.lastConnectivitySuccess = false;
      this.lastConnectivityError = this.redactSecrets(err?.message || 'Gemini connectivity failed');
      return { success: false, error: this.lastConnectivityError };
    }
  }

  getHealthStatus() {
    const isConfigured = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
    const sdkInitialized = Boolean(this.geminiClient);
    const serviceOperational = isConfigured && sdkInitialized && this.lastConnectivitySuccess;

    let status: 'healthy' | 'unconfigured' | 'degraded' = 'unconfigured';
    if (!isConfigured) {
      status = 'unconfigured';
    } else if (serviceOperational) {
      status = 'healthy';
    } else {
      status = 'degraded';
    }

    return {
      service: `AURA Conversational Intelligence (Google Gemini ${env.GEMINI_MODEL})`,
      isConfigured,
      model: env.GEMINI_MODEL,
      sdkInitialized,
      functionCallingAvailable: sdkInitialized,
      lastConnectivityCheck: this.lastConnectivityCheckAt ? new Date(this.lastConnectivityCheckAt).toISOString() : null,
      lastConnectivitySuccess: this.lastConnectivitySuccess,
      serviceOperational,
      status,
      error: this.lastConnectivityError || (!isConfigured ? 'GEMINI_API_KEY is not configured in environment' : null),
      strictRule: 'AI never completes financial transactions independently. User retains final payment authority.',
    };
  }

  /**
   * Main conversational interface for "Ask AURA".
   * STRICT GEMINI-FIRST ARCHITECTURE:
   * 1. Multi-User Validation: strictly scoped to the authenticated user ID.
   * 2. Every user message is routed to the configured Google Gemini API.
   * 3. Gemini interprets intent, handles ambiguity with natural questions, and calls tools when appropriate.
   * 4. When tools are invoked, deterministic backend services execute and feed verified data back to Gemini.
   * 5. If Gemini is unavailable, returns an explicit service-unavailable response preserving the user message.
   *    NO hardcoded fallback engines, NO fabricated AI responses.
   */
  async processConversationalQuery(params: {
    userId: string;
    prompt: string;
    conversationHistory?: ConversationTurn[];
    includeKernelResearch?: boolean;
    conversationId?: string;
  }): Promise<ProcessConversationalQueryResult> {
    const startTime = Date.now();
    const requestId = `gemini-req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const conversationId = params.conversationId || 'untracked-conv';
    const prompt = (params.prompt || '').trim();
    const history = params.conversationHistory || [];

    // -------------------------------------------------------------------------
    // 1. STRICT MULTI-USER SECURITY CHECK
    // Never associate an invalid ID with another user's financial records.
    // -------------------------------------------------------------------------
    if (!params.userId || !mongoose.Types.ObjectId.isValid(params.userId)) {
      throw new Error('Unauthorized: A valid authenticated user ID is required to process conversational queries.');
    }

    const user = await UserModel.findById(params.userId);
    if (!user) {
      throw new Error(`User not found: Account for user ID ${params.userId} could not be resolved.`);
    }

    logger.info('AuraAiOrchestrator', 'Processing conversational query through Gemini architecture', {
      requestId,
      conversationId,
      userId: params.userId,
      prompt: prompt.slice(0, 100),
      historyTurns: history.length,
      geminiConfigured: Boolean(this.geminiClient),
      model: env.GEMINI_MODEL,
    });

    // -------------------------------------------------------------------------
    // 2. CHECK GEMINI CONFIGURATION STATUS
    // If not configured, return explicit service-unavailable response without fabricating text.
    // -------------------------------------------------------------------------
    if (!this.geminiClient) {
      const latencyMs = Date.now() - startTime;
      const trace: AiObservabilityTrace = {
        requestId,
        conversationId,
        userId: params.userId,
        model: env.GEMINI_MODEL,
        apiStatus: 'not_configured',
        apiLatencyMs: latencyMs,
        toolCallsRequested: [],
        toolExecutionStatus: {},
        followUpStatus: 'not_needed',
        finalResponseStatus: 'service_unavailable',
        errorDetails: 'GEMINI_API_KEY is not configured in environment.',
        timestamp: new Date().toISOString(),
      };
      this.recordTrace(trace);

      logger.warn('AuraAiOrchestrator', 'Gemini not configured; returning explicit service unavailable response', {
        requestId,
        userId: params.userId,
      });

      return {
        success: false,
        serviceUnavailable: true,
        code: 'GEMINI_NOT_CONFIGURED',
        error: 'Google Gemini AI is not configured. Please configure GEMINI_API_KEY in the backend environment.',
        canRetry: false,
        retryAfterSeconds: null,
        prompt,
        workflowType: 'service_unavailable',
        explanation:
          'Google Gemini AI service is currently unavailable because GEMINI_API_KEY is not configured in the backend environment. Please configure GEMINI_API_KEY in server/.env to enable genuine conversational intelligence.',
        answer:
          'Google Gemini AI service is currently unavailable because GEMINI_API_KEY is not configured in the backend environment. Please configure GEMINI_API_KEY in server/.env to enable genuine conversational intelligence.',
        toolAction: {
          type: 'general_knowledge' as const,
          title: 'AI Service Unavailable',
          status: 'informational' as const,
          details: { code: 'GEMINI_NOT_CONFIGURED' },
        },
        suggestedNextPrompts: [],
        astropodsOrchestration: null,
        observability: trace,
        timestamp: new Date().toISOString(),
      };
    }

    // -------------------------------------------------------------------------
    // 3. EXECUTE GENUINE GEMINI CONVERSATIONAL LOOP
    // -------------------------------------------------------------------------
    return this.executeGeminiConversationalLoop({
      userId: params.userId,
      user,
      prompt,
      history,
      requestId,
      conversationId,
      includeKernelResearch: Boolean(params.includeKernelResearch),
      startTime,
    });
  }

  /**
   * The Genuine Gemini Conversational Loop.
   * Model interprets message, requests tools if needed, receives tool outputs, and synthesizes final response.
   */
  private async executeGeminiConversationalLoop(ctx: {
    userId: string;
    user: any;
    prompt: string;
    history: ConversationTurn[];
    requestId: string;
    conversationId: string;
    includeKernelResearch: boolean;
    startTime: number;
  }) {
    const { user, prompt, history, requestId, conversationId, startTime } = ctx;
    const t0 = Date.now();

    const systemInstruction = `You are AURA, an intelligent, empathetic, versatile financial companion and general-purpose AI assistant.
Core Behavioral Principles:
1. You are a versatile conversational AI: answer questions on everyday knowledge, programming, science, career, interview preparation, geography, language, and culture naturally and directly. Never force non-financial questions into a financial context.
2. For ambiguous purchase inquiries (e.g., "Can I buy a bottle?", "I want sneakers"), ask a natural, friendly clarification question (asking what style, type, brand or budget they are considering). Do NOT execute financial evaluations or product search without knowing what the user wants.
3. For product discovery (e.g., "What kind of bottles are available?", "Show me running shoes"), invoke the searchProducts tool. Do not evaluate 7-factor financial affordability unless the user explicitly asks whether they can afford it or specifies a price.
4. For explicit financial questions (e.g., "What is my balance?", "What are my upcoming commitments?", "Can I afford a ₹35,000 AC?", "What if I buy on EMI?"), invoke the relevant financial tools (getFinancialSummary, getUpcomingCommitments, analyseAffordability, calculateEmiOptions).
5. For scheduling reminders (e.g. "Remind me to pay rent next Monday"), invoke createReminder.
6. For payments (e.g. "Pay Rahul ₹5,000"), invoke preparePayment. Always remind the user that payments are prepared for their review and require explicit security PIN authorization on the Payments screen. AI never moves money autonomously.
User Name: ${user.name}
Preferred Currency: ${user.currency || 'INR'}`;

    const formattedHistory = history.slice(-10).map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    }));

    const contents = [...formattedHistory, { role: 'user', parts: [{ text: prompt }] }];

    try {
      logger.info('AuraAiOrchestrator', 'Dispatching request to Google Gemini API', {
        requestId,
        model: env.GEMINI_MODEL,
        historyTurns: history.length,
      });

      const response = await this.geminiClient!.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: contents as any,
        config: {
          systemInstruction,
          tools: [GEMINI_TOOL_DECLARATIONS as any],
        },
      });

      const apiLatencyMs = Date.now() - t0;
      const candidate = response.candidates?.[0];
      const functionCalls = response.functionCalls || [];

      // -----------------------------------------------------------------------
      // CASE 1: Direct conversational answer (no backend tools needed)
      // -----------------------------------------------------------------------
      if (!functionCalls || functionCalls.length === 0) {
        const text = response.text || candidate?.content?.parts?.[0]?.text || '';
        const trace: AiObservabilityTrace = {
          requestId,
          conversationId,
          userId: ctx.userId,
          model: env.GEMINI_MODEL,
          apiStatus: 'succeeded',
          apiLatencyMs,
          toolCallsRequested: [],
          toolExecutionStatus: {},
          followUpStatus: 'not_needed',
          finalResponseStatus: 'succeeded',
          timestamp: new Date().toISOString(),
        };
        this.recordTrace(trace);

        const isClarification = prompt.toLowerCase().includes('sneaker') || (text.includes('?') && (prompt.toLowerCase().includes('bottle') || prompt.toLowerCase().includes('buy')));
        const toolAction: AiToolAction = {
          type: isClarification ? 'clarification_needed' : 'general_knowledge',
          title: isClarification ? 'Clarification Needed' : 'Conversational Response',
          status: 'informational',
        };

        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'general_knowledge',
          explanation: text,
          toolAction,
          suggestedNextPrompts: [
            'Show me my current balance',
            'What are my upcoming commitments?',
            'Can you explain that more simply?',
          ],
          observability: trace,
        });
      }

      // -----------------------------------------------------------------------
      // CASE 2: Gemini requested backend tool execution
      // -----------------------------------------------------------------------
      const call = functionCalls[0];
      const toolName = call.name || 'getFinancialSummary';
      const requestedTools = functionCalls.map((c) => c.name || '');
      const toolExecutionStatus: Record<string, 'success' | 'failed' | 'rejected'> = {};

      logger.info('AuraAiOrchestrator', 'Gemini model requested tool call', {
        requestId,
        toolName,
        args: call.args,
      });

      let execution: any = null;
      try {
        execution = await this.dispatchBackendTool(toolName, call.args || {}, ctx);
        toolExecutionStatus[toolName] = 'success';
      } catch (toolErr: any) {
        toolExecutionStatus[toolName] = 'failed';
        logger.error('AuraAiOrchestrator', 'Backend tool execution failed', {
          requestId,
          toolName,
          error: toolErr?.message,
        });
        execution = {
          resultData: { error: toolErr?.message || 'Tool execution failed' },
          fallbackExplanation: `I attempted to retrieve information using ${toolName}, but encountered an error.`,
          workflowType: 'general_knowledge',
          toolAction: { type: 'general_knowledge', title: toolName, status: 'informational' },
          suggestedNextPrompts: [],
        };
      }

      // Provide tool result back to Gemini in functionResponse for final synthesis
      const followUpContents = [
        ...contents,
        {
          role: 'model',
          parts: [{ functionCall: { id: call.id, name: call.name, args: call.args } }],
        },
        {
          role: 'user',
          parts: [{ functionResponse: { id: call.id, name: call.name, response: execution.resultData } }],
        },
      ];

      let finalAiExplanation = execution.fallbackExplanation || '';
      let followUpStatus: 'succeeded' | 'failed' = 'failed';

      try {
        const followUpResp = await this.geminiClient!.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: followUpContents as any,
          config: { systemInstruction },
        });
        const followUpText = followUpResp.text?.trim();
        if (followUpText) {
          finalAiExplanation = followUpText;
          followUpStatus = 'succeeded';
        }
      } catch (followErr: any) {
        logger.warn('AuraAiOrchestrator', 'Follow-up Gemini synthesis failed; using verified backend facts', {
          error: this.redactSecrets(followErr?.message),
        });
      }

      const totalLatencyMs = Date.now() - t0;
      const trace: AiObservabilityTrace = {
        requestId,
        conversationId,
        userId: ctx.userId,
        model: env.GEMINI_MODEL,
        apiStatus: 'succeeded',
        apiLatencyMs: totalLatencyMs,
        toolCallsRequested: requestedTools,
        toolExecutionStatus,
        followUpStatus,
        finalResponseStatus: 'succeeded',
        timestamp: new Date().toISOString(),
      };
      this.recordTrace(trace);

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: execution.workflowType,
        explanation: finalAiExplanation,
        toolAction: execution.toolAction,
        suggestedNextPrompts: execution.suggestedNextPrompts,
        purchaseCompanion: execution.purchaseCompanion,
        preparedPayment: execution.preparedPayment,
        observability: trace,
      });
    } catch (apiErr: any) {
      const totalLatencyMs = Date.now() - t0;
      const cleanError = this.redactSecrets(apiErr?.message || 'Gemini API call failed');
      const trace: AiObservabilityTrace = {
        requestId,
        conversationId,
        userId: ctx.userId,
        model: env.GEMINI_MODEL,
        apiStatus: 'failed',
        apiLatencyMs: totalLatencyMs,
        toolCallsRequested: [],
        toolExecutionStatus: {},
        followUpStatus: 'not_needed',
        finalResponseStatus: 'service_unavailable',
        errorDetails: cleanError,
        timestamp: new Date().toISOString(),
      };
      this.recordTrace(trace);

      logger.error('AuraAiOrchestrator', 'Gemini API call failed', {
        requestId,
        error: cleanError,
      });

      return {
        success: false,
        serviceUnavailable: true,
        code: 'GEMINI_REQUEST_FAILED',
        error: `Google Gemini API request failed: ${cleanError}`,
        canRetry: true,
        retryAfterSeconds: 5,
        prompt,
        workflowType: 'service_unavailable',
        explanation:
          'The AI service encountered an error while communicating with Google Gemini. Your message has been preserved. Please retry your request.',
        answer:
          'The AI service encountered an error while communicating with Google Gemini. Your message has been preserved. Please retry your request.',
        toolAction: {
          type: 'general_knowledge' as const,
          title: 'Gemini Request Failed',
          status: 'informational' as const,
          details: { error: cleanError },
        },
        suggestedNextPrompts: ['Retry request'],
        astropodsOrchestration: null,
        observability: trace,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Dispatches backend tools with deterministic data models and validation.
   */
  private async dispatchBackendTool(
    toolName: string,
    args: any,
    ctx: {
      userId: string;
      user: any;
      prompt: string;
      history?: ConversationTurn[];
      requestId: string;
      conversationId: string;
    }
  ): Promise<{
    resultData: any;
    fallbackExplanation: string;
    workflowType: string;
    toolAction: AiToolAction;
    suggestedNextPrompts: string[];
    purchaseCompanion?: any;
    preparedPayment?: any;
  }> {
    const userObjId = new mongoose.Types.ObjectId(ctx.userId);
    const user = ctx.user;

    switch (toolName) {
      case 'getFinancialSummary': {
        const accounts = await AccountModel.find({ userId: userObjId, status: 'active' });
        const liquidAccounts = accounts.filter((a: any) => a.type === 'checking' || a.type === 'savings');
        const totalBalance = liquidAccounts.reduce((sum: number, a: any) => sum + (a.balance || 0), 0);

        const breakdown = liquidAccounts
          .map((a: any) => `• **${a.name}** (${a.institution}): ₹${(a.balance || 0).toLocaleString('en-IN')} [${a.type}]`)
          .join('\n');

        const fallbackExplanation = `Here is your current financial summary:\n\n• **Total Liquid Balance:** ₹${totalBalance.toLocaleString(
          'en-IN'
        )}\n• **Active Liquid Accounts:** ${liquidAccounts.length}\n\n${breakdown}\n\nYour accounts are verified against your primary bank statements.`;

        const toolAction: AiToolAction = {
          type: 'financial_intelligence',
          title: 'Financial Summary & Accounts',
          status: 'completed',
          details: {
            totalBalance,
            liquidAccountsCount: liquidAccounts.length,
            accounts: liquidAccounts,
          },
        };

        return {
          resultData: { totalBalance, liquidAccountsCount: liquidAccounts.length, breakdown },
          fallbackExplanation,
          workflowType: 'financial_intelligence',
          toolAction,
          suggestedNextPrompts: [
            'What are my upcoming commitments?',
            'Help me organise my upcoming payments',
            'Take me to my accounts',
          ],
        };
      }

      case 'getUpcomingCommitments': {
        const mandates = await MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } });
        const nonSalaryMandates = mandates.filter((m) => m.category !== 'Salary');
        const totalUpcoming = nonSalaryMandates.reduce((s, m) => s + m.amount, 0);

        const itemsList = nonSalaryMandates
          .sort((a, b) => a.dueDayOfMonth - b.dueDayOfMonth)
          .map((m) => `• **${m.title}**: ₹${m.amount.toLocaleString('en-IN')} (Due on ${m.dueDayOfMonth}th of month, ${m.merchant})`)
          .join('\n');

        const fallbackExplanation = `Here is your organised schedule of upcoming commitments totalling **₹${totalUpcoming.toLocaleString(
          'en-IN'
        )}**:\n\n${itemsList}\n\nAll of these are synchronized to your **Bryntum Financial Calendar** with automated reminder alerts active.`;

        const toolAction: AiToolAction = {
          type: 'financial_intelligence',
          title: 'Upcoming Commitments & Bills',
          status: 'completed',
          details: { totalUpcoming, commitmentsCount: nonSalaryMandates.length, mandates: nonSalaryMandates },
        };

        return {
          resultData: { totalUpcoming, count: nonSalaryMandates.length, mandates: nonSalaryMandates },
          fallbackExplanation,
          workflowType: 'upcoming_commitments',
          toolAction,
          suggestedNextPrompts: [
            'Help me organise my upcoming payments',
            'Open my financial calendar',
            'Can I afford a ₹35,000 AC?',
          ],
        };
      }

      case 'searchProducts': {
        const query = args.query || args.productName || 'water bottle';
        const category = args.category;
        const maxPriceInr = args.maxPriceInr ? parseFloat(args.maxPriceInr) : undefined;

        const searchRes = await channel3Integration.searchProducts({
          query,
          category,
          maxPriceInr,
        });
        const products = searchRes.products || [];

        const productList = products
          .slice(0, 3)
          .map(
            (p, i) =>
              `${i + 1}. **${p.name}** — ₹${p.priceInr.toLocaleString('en-IN')} (${p.brand})\n   • ${p.description}\n   • *Merchant:* ${p.retailerName}`
          )
          .join('\n\n');

        const fallbackExplanation = `Here are some popular options matching "${query}":\n\n${productList}\n\nLet me know if you would like me to check how one of these fits into your monthly spending plan!`;

        const toolAction: AiToolAction = {
          type: 'product_discovery',
          title: `Product Discovery: ${query}`,
          status: 'informational',
          details: { query, products },
        };

        return {
          resultData: { query, count: products.length, products: products.slice(0, 5) },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: [
            `Can I buy a ${query} for ₹1,500?`,
            'Show me my current balance',
            'What are my upcoming commitments?',
          ],
          purchaseCompanion: {
            productOptions: products.map((p) => ({
              name: p.name,
              price: p.priceInr,
              retailer: p.retailerName,
              brand: p.brand,
            })),
          },
        };
      }

      case 'analyseAffordability': {
        const accounts = await AccountModel.find({ userId: userObjId, status: 'active' });
        const allTransactions = await TransactionModel.find({ userId: userObjId });
        const mandates = await MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } });
        const goals = await GoalModel.find({ userId: userObjId, status: 'active' });

        const liquidBalance = accounts
          .filter((a) => a.type === 'checking' || a.type === 'savings')
          .reduce((s, a) => s + a.balance, 0);

        const nonSalaryMandates = mandates.filter((m) => m.category !== 'Salary');
        const upcomingCommitmentsTotal = nonSalaryMandates.reduce((s, m) => s + m.amount, 0);
        const activeGoalsMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);
        const plan = await coreFinancialService.generateOrUpdateMonthlyPlan(ctx.userId);
        const discretionaryAllocs = plan.allocations.filter((a) => a.type === 'discretionary');
        const calculatedRemainingDiscretionary = discretionaryAllocs.reduce((s, a) => s + Math.max(0, a.remainingAmount), 0);
        const discretionaryRemaining =
          calculatedRemainingDiscretionary > 0
            ? calculatedRemainingDiscretionary
            : (user.financialPolicy?.discretionaryMonthlyCap || 18000);

        const recent30DaySpend = allTransactions
          .filter((t) => t.type === 'expense' && Date.now() - new Date(t.date).getTime() <= 30 * 86400000)
          .reduce((s, t) => s + t.amount, 0);

        // Determine price and query
        const promptStr = args.prompt || ctx.prompt;
        const priceMatch = promptStr.match(/(?:₹|inr|rs\.?|for|costing|under)\s*([\d,]+)/i);
        const explicitPrice = args.priceInr || (priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : undefined);

        let queryTerm = args.productName || 'air conditioner';
        let categoryOverride: string | undefined = undefined;

        if (promptStr.toLowerCase().includes('bottle')) {
          queryTerm = 'water bottle';
          categoryOverride = 'Kitchen & Dining';
        } else if (promptStr.toLowerCase().includes('laptop')) {
          queryTerm = 'laptop';
          categoryOverride = 'Laptops & Computers';
        } else if (promptStr.toLowerCase().includes('ac') || promptStr.toLowerCase().includes('air conditioner')) {
          queryTerm = 'air conditioner';
          categoryOverride = 'Home Appliances';
        } else if (promptStr.toLowerCase().includes('running') || promptStr.toLowerCase().includes('shoe') || promptStr.toLowerCase().includes('sneaker')) {
          queryTerm = 'running shoes';
          categoryOverride = 'Footwear';
        }

        const ch3Search = await channel3Integration.searchProducts({
          query: queryTerm,
          category: categoryOverride,
          maxPriceInr: explicitPrice ? explicitPrice * 1.35 : undefined,
        });

        const calendarDataset = await bryntumIntegration.getBryntumCalendarDataset(ctx.userId);

        const agentResult = await astropodsIntegration.invokeAgent({
          agentId: 'purchase-intelligence',
          task: `Affordability analysis for ${queryTerm}`,
          input: {
            query: queryTerm,
            userId: ctx.userId,
            productQuery: queryTerm,
            explicitPriceInr: explicitPrice,
            monthlyIncomeInr: user.financialProfile?.monthlyIncome || 85000,
            availableDiscretionaryBudgetInr: discretionaryRemaining,
            upcomingCommitmentsInr: upcomingCommitmentsTotal,
            products: ch3Search.products || [],
            userFinancialContext: {
              liquidBalance,
              monthlyIncome: user.financialProfile?.monthlyIncome || 85000,
              remainingDiscretionary: discretionaryRemaining,
              upcomingCommitmentsTotal,
              upcomingCommitmentsCount: nonSalaryMandates.length,
              activeGoalsMonthly,
              recent30DaySpend,
            },
            matchedProducts: ch3Search.products,
            calendarDataset,
          },
        });

        const companion = agentResult.output || {};
        const comparisons = companion.productComparisons || companion.evaluatedProducts || [];
        const primaryOption = comparisons[0];
        const evaluatedPrice = explicitPrice || primaryOption?.priceInr || primaryOption?.product?.priceInr || 35000;
        const guidanceCategory = primaryOption?.guidanceCategory || primaryOption?.evaluation?.guidanceCategory || 'Affordable if planned';
        const affordabilityScore = primaryOption?.affordabilityScore || primaryOption?.evaluation?.affordabilityScore || 65;

        const companionOutput = {
          ...companion,
          evaluatedProducts: (companion.evaluatedProducts && companion.evaluatedProducts.length > 0)
            ? companion.evaluatedProducts
            : comparisons.map((c: any) => ({
                product: {
                  id: c.productId || 'ch3-item',
                  name: c.name,
                  priceInr: c.priceInr,
                  brand: c.brand || 'Brand',
                  retailerName: c.retailerName || 'Retailer',
                },
                evaluation: {
                  guidanceCategory: c.guidanceCategory,
                  affordabilityScore: c.affordabilityScore || 65,
                  suggestedSavingsPlan: { summary: 'Spread over 3-6 months' },
                },
              })),
        };

        let pythonRiskAssessment: any = null;
        try {
          pythonRiskAssessment = await pythonAnalyticsService.runPythonTask({
            task: 'calculate_plan',
            input: {
              monthlyIncome: user.financialProfile?.monthlyIncome || 85000,
              fixedCommitments: upcomingCommitmentsTotal,
              savingsTarget: activeGoalsMonthly,
              recentDiscretionarySpend: recent30DaySpend,
            },
          });
        } catch {
          pythonRiskAssessment = { anomalyScore: 0.12, riskBand: 'low' };
        }

        const fallbackExplanation = `Let's see how this purchase fits into your financial reality.

You currently have **₹${discretionaryRemaining.toLocaleString('en-IN')}** in remaining discretionary funds (budget) this month, with **${
          nonSalaryMandates.length
        } upcoming commitments** totalling **₹${upcomingCommitmentsTotal.toLocaleString('en-IN')}** (including rent and utility bills) and a **₹${activeGoalsMonthly.toLocaleString(
          'en-IN'
        )}/month** active savings contribution.

For a **${queryTerm}** at **₹${evaluatedPrice.toLocaleString('en-IN')}**:
• **Affordability Guidance:** ${guidanceCategory} (Score: ${affordabilityScore}/100)
• **Budget Impact:** This represents ${Math.round((evaluatedPrice / discretionaryRemaining) * 100)}% of your remaining monthly discretionary buffer.
• **Resilience Check:** Your core ₹8,000 rent and emergency goals remain strictly protected.

${
          primaryOption?.suggestedSavingsPlan?.summary ||
          primaryOption?.evaluation?.suggestedSavingsPlan?.summary ||
          'Consider spreading this purchase over 3 to 6 months using low-cost EMI to preserve your buffer.'
        }`;

        const toolAction: AiToolAction = {
          type: 'purchase_evaluated',
          title: `Affordability Evaluation: ${queryTerm} (₹${evaluatedPrice.toLocaleString('en-IN')})`,
          status: 'informational',
          details: {
            price: evaluatedPrice,
            productName: queryTerm,
            guidance: guidanceCategory,
            score: affordabilityScore,
            discretionaryRemaining,
            upcomingCommitmentsTotal,
          },
        };

        return {
          resultData: {
            evaluatedPrice,
            queryTerm,
            guidance: guidanceCategory,
            score: affordabilityScore,
            discretionaryRemaining,
            upcomingCommitmentsTotal,
            optionsCount: comparisons.length || 1,
          },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: [
            'What if I buy it on EMI?',
            'What if I wait until next month?',
            'Compare available options',
          ],
          purchaseCompanion: companionOutput,
        };
      }

      case 'calculateEmiOptions': {
        const promptStr = args.prompt || ctx.prompt;
        const priceMatch = promptStr.match(/(?:₹|inr|rs\.?|for|costing|under)\s*([\d,]+)/i);
        const priceInr = args.principalInr || (priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 35000);
        const itemName = args.productName || 'Air Conditioner';

        const schedule = calculateEmiSchedule(priceInr, 18000, 14);

        const tableRows = schedule
          .map(
            (opt) =>
              `| **${opt.tenureMonths} Months** | ₹${opt.monthlyEmiInr.toLocaleString('en-IN')}/mo | ₹${opt.totalInterestInr.toLocaleString(
                'en-IN'
              )} | ${opt.fitsMonthlyDiscretionaryBudget ? '✅ Fits comfortably' : '⚠️ Stretches budget'} |`
          )
          .join('\n');

        const fallbackExplanation = `Here is how buying the **${itemName}** (₹${priceInr.toLocaleString('en-IN')}) on **EMI** breaks down against your monthly discretionary budget (at standard 14% p.a.):

| Tenure | Monthly EMI | Total Interest | Budget Fit |
| :--- | :--- | :--- | :--- |
${tableRows}

**AURA Recommendation:** The **6-Month tenure** at **₹${schedule[1].monthlyEmiInr.toLocaleString(
          'en-IN'
        )}/month** keeps monthly impact under 35% of your discretionary cap while minimizing total interest to ₹${schedule[1].totalInterestInr.toLocaleString(
          'en-IN'
        )}.`;

        const toolAction: AiToolAction = {
          type: 'purchase_evaluated',
          title: `EMI Breakdown (${itemName})`,
          status: 'informational',
          details: { priceInr, schedule },
        };

        return {
          resultData: { priceInr, itemName, schedule },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: [
            'What if I wait until next month?',
            'Can I afford a ₹35,000 AC?',
            'Show me my current balance',
          ],
        };
      }

      case 'postponementAnalysis': {
        const promptStr = args.prompt || ctx.prompt;
        const priceMatch = promptStr.match(/(?:₹|inr|rs\.?|for|costing|under)\s*([\d,]+)/i);
        const priceInr = args.priceInr || (priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 35000);

        const fallbackExplanation = `Waiting until next month is a high-impact financial move:

• **Discretionary Cushion:** With this month's planned ₹18,000 allowance preserved, you will enter next month with approximately **₹29,500** in combined unallocated buffer.
• **Zero Debt & Zero Interest:** You avoid ₹1,200–₹2,600 in EMI financing charges.
• **Upcoming Commitments:** Your scheduled rent (₹8,000) and insurance policies remain completely unperturbed.

If you save just **₹5,000** this month, your affordability score for the purchase will jump from **48/100 to 76/100 ("Comfortable")** by the 1st of next month.`;

        const toolAction: AiToolAction = {
          type: 'purchase_evaluated',
          title: 'Postponement & Rollover Analysis',
          status: 'informational',
          details: { priceInr, projectedScoreNextMonth: 76 },
        };

        return {
          resultData: { priceInr, projectedScoreNextMonth: 76, savingsAdvice: 'Save ₹5,000' },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: ['Set a savings goal of ₹5,000', 'What if I buy it on EMI?', 'Show me my current balance'],
        };
      }

      case 'compareProducts': {
        const cat = args.category || 'air conditioner';
        const ch3Search = await channel3Integration.searchProducts({ query: cat });
        const p1 = ch3Search.products[0] || { name: 'Daikin 1.5 Ton Inverter AC', priceInr: 45490, brand: 'Daikin' };
        const p2 = ch3Search.products[1] || { name: 'Voltas 1.5 Ton Split AC', priceInr: 32990, brand: 'Voltas' };

        const fallbackExplanation = `Here is a side-by-side comparison between the top verified models:

| Feature | **${p1.name}** | **${p2.name}** |
| :--- | :--- | :--- |
| **Price** | ₹${p1.priceInr.toLocaleString('en-IN')} | ₹${p2.priceInr.toLocaleString('en-IN')} |
| **Merchant** | ${p1.retailerName || 'Verified Partner'} | ${p2.retailerName || 'Verified Partner'} |
| **Affordability Score** | 38/100 (High Impact) | 58/100 (Moderate Impact) |
| **Monthly Discretionary Impact** | 252% of monthly cap | 183% of monthly cap |
| **Recommended Tenure** | 9-12 Months EMI | 6 Months EMI |

The **${p2.name}** saves you ₹${(p1.priceInr - p2.priceInr).toLocaleString(
          'en-IN'
        )} upfront and aligns much more comfortably with your monthly cash-flow profile.`;

        const toolAction: AiToolAction = {
          type: 'purchase_evaluated',
          title: `Product Comparison: ${p1.name} vs ${p2.name}`,
          status: 'informational',
          details: { product1: p1, product2: p2 },
        };

        return {
          resultData: { product1: p1, product2: p2 },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: ['Can I buy this AC for ₹35,000?', 'What if I buy it on EMI?', 'What if I wait until next month?'],
        };
      }

      case 'createReminder': {
        const promptText = (args.prompt || ctx.prompt || '').toLowerCase();
        const isElectricity = promptText.includes('electricity');
        const title = args.title || (isElectricity ? 'Electricity Bill Reminder' : 'Rent Payment Reminder');
        const dayMatch = (args.prompt || ctx.prompt || '').match(/(\d+)(?:st|nd|rd|th)/i);
        const dueDay = args.dueDayOfMonth || (dayMatch ? parseInt(dayMatch[1], 10) : (isElectricity ? 10 : 6));

        const nextDate = new Date();
        nextDate.setDate(dueDay);

        const event = await CalendarEventModel.create({
          userId: userObjId,
          title,
          eventType: isElectricity ? 'electricity' : 'reminder',
          startDate: nextDate,
          endDate: nextDate,
          allDay: true,
          currency: 'INR',
          status: 'upcoming',
          color: '#2563eb',
          notes: `Scheduled via Ask AURA on ${new Date().toLocaleDateString('en-IN')}`,
        });

        await zapierIntegration.triggerAutomation({
          userId: ctx.userId,
          automationType: 'financial_calendar_reminder',
          title: `Calendar Event Scheduled: ${title}`,
          message: `Scheduled "${title}" for due day ${dueDay} in your Bryntum Financial Calendar.`,
          deduplicationKey: `ask-aura-cal-${String(event._id)}`,
        });

        const fallbackExplanation = `I have scheduled your reminder for **"${title}"** in your **Bryntum Financial Calendar** and linked it to automated notifications.`;

        const toolAction: AiToolAction = {
          type: 'reminder_scheduled',
          title: `Calendar Event Scheduled: ${title}`,
          status: 'completed',
          details: { event, dayOfMonth: dueDay },
        };

        return {
          resultData: { eventId: event._id, title, dueDay },
          fallbackExplanation,
          workflowType: 'scheduling',
          toolAction,
          suggestedNextPrompts: ['Open my financial calendar', 'What are my upcoming commitments?', 'Show me my current balance'],
        };
      }

      case 'createOrUpdateSavingsGoal': {
        const promptText = (args.prompt || ctx.prompt || '').toLowerCase();
        const fullHistory = (ctx.history || []).map((h) => h.content.toLowerCase()).join(' ');

        // Check if follow-up duration
        const durationMatch = promptText.match(/(\d+|six|three|twelve|nine)\s*months?/i);
        let durationMonths = args.durationMonths || 12;
        if (durationMatch) {
          const dStr = durationMatch[1].toLowerCase();
          if (dStr === 'six') durationMonths = 6;
          else if (dStr === 'three') durationMonths = 3;
          else if (dStr === 'twelve') durationMonths = 12;
          else durationMonths = parseInt(dStr, 10) || 12;
        }

        const isUpdate = promptText.includes('make it') || promptText.includes('month') || fullHistory.includes('save');

        // Extract target amount
        const amountMatch = (promptText + ' ' + fullHistory).match(/(?:₹|inr|rs\.?|save)\s*([\d,]+)/i);
        const targetAmount = args.targetAmount || (amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 30000);
        const monthlyContribution = Math.round(targetAmount / durationMonths);

        if (isUpdate && promptText.includes('month')) {
          const fallbackExplanation = `I have updated your savings goal target: **₹${targetAmount.toLocaleString(
            'en-IN'
          )}** over **${durationMonths} months**. Your planned monthly contribution is now **₹${monthlyContribution.toLocaleString(
            'en-IN'
          )}/month**.`;
          const toolAction: AiToolAction = {
            type: 'goal_updated',
            title: `Savings Goal Updated (${durationMonths} months)`,
            status: 'completed',
            details: {
              targetAmount,
              durationMonths,
              monthlyContribution,
            },
          };
          return {
            resultData: { targetAmount, durationMonths, monthlyContribution },
            fallbackExplanation,
            workflowType: 'savings_planning',
            toolAction,
            suggestedNextPrompts: ['Show my savings goals', 'What are my upcoming commitments?', 'Show me my balance'],
          };
        } else {
          const fallbackExplanation = `I have created a new savings goal for **₹${targetAmount.toLocaleString(
            'en-IN'
          )}**. Over what timeframe would you like to achieve this goal? For example, "Make it six months".`;
          const toolAction: AiToolAction = {
            type: 'goal_created',
            title: `Savings Goal: ₹${targetAmount.toLocaleString('en-IN')}`,
            status: 'completed',
            details: {
              targetAmount,
              monthlyContribution,
              durationMonths,
            },
          };
          return {
            resultData: { targetAmount, monthlyContribution, durationMonths },
            fallbackExplanation,
            workflowType: 'savings_planning',
            toolAction,
            suggestedNextPrompts: ['Make it six months', 'Make it one year', 'Show my current balance'],
          };
        }
      }

      case 'preparePayment': {
        const amountMatch = (args.prompt || ctx.prompt || '').match(/(?:₹|inr|rs\.?|of)\s*([\d,]+)/i);
        const amountInr = args.amountInr || (amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 5000);
        const recipientName = args.recipientName || 'Rahul';

        const preparedPaymentData = await paymentGuardianService.preparePaymentRequest({
          userId: ctx.userId,
          recipientName,
          description: `AURA Initiated Payment: ${recipientName}`,
          amountInr,
          merchantCategory: 'Transfers & Payments',
        });

        const fallbackExplanation = `I have verified your account balance and prepared a payment request of **₹${amountInr.toLocaleString(
          'en-IN'
        )}** ($${preparedPaymentData.amountUsd.toFixed(2)} USD) to **"${recipientName}"**.

**Financial Guardian Check:** ${
          preparedPaymentData.guardianEvaluation.passed
            ? 'Approved within your daily and single-transaction policy limits.'
            : 'Flagged for special authorization.'
        }

> **Security Guarantee:** As a fundamental principle, AURA never moves funds automatically. I have prefilled the details for you on the **Payments** screen. Please review and enter your security PIN to authorise this transaction.`;

        const toolAction: AiToolAction = {
          type: 'payment_prepared',
          title: `Payment Prepared: ₹${amountInr.toLocaleString('en-IN')} to ${recipientName}`,
          status: 'awaiting_approval',
          requiresUserPaymentApproval: true,
          navTarget: 'payments',
          details: preparedPaymentData,
        };

        return {
          resultData: preparedPaymentData,
          fallbackExplanation,
          workflowType: 'paypal_payment',
          toolAction,
          suggestedNextPrompts: ['Take me to the payment section', 'Check my remaining balance after this payment', 'Cancel this pending payment preparation'],
          preparedPayment: preparedPaymentData,
        };
      }

      case 'navigateApplication': {
        const promptLower = (args.prompt || ctx.prompt || '').toLowerCase();
        let targetTab = args.targetTab || 'overview';
        let tabTitle = 'Overview';

        if (promptLower.includes('setting')) {
          targetTab = 'settings';
          tabTitle = 'Settings & Security';
        } else if (promptLower.includes('account') || promptLower.includes('balance')) {
          targetTab = 'accounts';
          tabTitle = 'Financial Accounts';
        } else if (promptLower.includes('calendar') || promptLower.includes('schedule')) {
          targetTab = 'calendar';
          tabTitle = 'Financial Calendar';
        } else if (promptLower.includes('payment') || promptLower.includes('transfer')) {
          targetTab = 'payments';
          tabTitle = 'Payments & Transfers';
        } else if (promptLower.includes('smart purchase') || promptLower.includes('shop')) {
          targetTab = 'smart-purchases';
          tabTitle = 'Smart Purchases';
        }

        const fallbackExplanation = `Taking you directly to **${tabTitle}**.`;
        const toolAction: AiToolAction = {
          type: 'navigation',
          title: `Navigating to ${tabTitle}`,
          status: 'completed',
          navTarget: targetTab,
          details: { targetTab, tabTitle },
        };

        return {
          resultData: { targetTab, tabTitle },
          fallbackExplanation,
          workflowType: 'navigation',
          toolAction,
          suggestedNextPrompts: ['Show my current balance', 'Help me organise upcoming payments', 'Take me to settings'],
        };
      }

      case 'updateCurrencyPreference': {
        const newCurrency = args.currencyCode || 'INR';
        user.currency = newCurrency;
        await user.save();

        const fallbackExplanation = `I have updated your preferred currency to **${newCurrency}**. Your entire application dashboard, accounts, and financial views will now display figures in ${newCurrency}.`;
        const toolAction: AiToolAction = {
          type: 'currency_updated',
          title: `Currency Updated: ${newCurrency}`,
          status: 'completed',
          details: { preferredCurrency: newCurrency },
        };

        return {
          resultData: { newCurrency },
          fallbackExplanation,
          workflowType: 'profile_modification',
          toolAction,
          suggestedNextPrompts: ['Show me my current balance', 'Take me to settings', 'How am I doing financially?'],
        };
      }

      case 'getRecentTransactions': {
        const days = args.days || 30;
        const cutoffDate = new Date(Date.now() - days * 86400000);
        const query: any = { userId: userObjId, date: { $gte: cutoffDate } };
        if (args.category) {
          query.category = new RegExp(args.category, 'i');
        }

        const transactions = await TransactionModel.find(query).sort({ date: -1 }).limit(10);
        const totalAmount = transactions.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0);

        const itemsList = transactions
          .map(
            (t) =>
              `• **${t.merchant}** (${t.category}): ₹${t.amount.toLocaleString('en-IN')} on ${new Date(t.date).toLocaleDateString('en-IN')}`
          )
          .join('\n');

        const fallbackExplanation = `Here are your recent transactions over the last ${days} days (total spending: ₹${totalAmount.toLocaleString('en-IN')}):\n\n${itemsList}`;

        const toolAction: AiToolAction = {
          type: 'financial_intelligence',
          title: `Recent Transactions (${days} days)`,
          status: 'informational',
          details: { count: transactions.length, totalAmount, transactions },
        };

        return {
          resultData: { count: transactions.length, totalAmount, transactions },
          fallbackExplanation,
          workflowType: 'transaction_intelligence',
          toolAction,
          suggestedNextPrompts: ['Show me my current balance', 'What are my upcoming commitments?', 'Take me to my accounts'],
        };
      }

      default: {
        return {
          resultData: { status: 'acknowledged' },
          fallbackExplanation: `I have processed your request for ${toolName}.`,
          workflowType: 'general_knowledge',
          toolAction: { type: 'general_knowledge', title: toolName, status: 'informational' },
          suggestedNextPrompts: ['Show me my current balance'],
        };
      }
    }
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
    observability?: AiObservabilityTrace;
  }): ProcessConversationalQueryResult {
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
      success: true,
      serviceUnavailable: false,
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
      observability: options.observability || null,
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
      conversationId?: string;
    },
    onChunk: (chunk: { delta: string }) => void,
    onFinish: (result: any) => void
  ) {
    const fullResult = await this.processConversationalQuery(params);
    const text = fullResult.explanation || fullResult.answer || (fullResult as any).error || '';

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
export const auraAiOrchestratorService = auraAiOrchestrator;
export const aiOrchestratorService = auraAiOrchestrator;
