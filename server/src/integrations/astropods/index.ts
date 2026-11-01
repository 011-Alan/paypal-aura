import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export type AuraAgentId =
  | 'financial-planner'
  | 'transaction-intelligence'
  | 'mandate-intelligence'
  | 'financial-recovery'
  | 'purchase-intelligence'
  | 'financial-guardian';

export interface AuraAgentDefinition {
  id: AuraAgentId;
  blueprintName: string;
  blueprintPath: string;
  agentCardPath: string;
  name: string;
  role: string;
  description: string;
  responsibilities: string[];
  allowedTools: string[];
  inputSchemaFields: string[];
  outputSchemaFields: string[];
  canExecutePayments: false; // Hard security invariant
  executionLimits: {
    timeoutMs: number;
    maxRetries: number;
    maxSteps: number;
  };
  deploymentId?: string;
  adapterUrl?: string;
  status: 'deployed_online' | 'adapter_online' | 'blueprint_ready_awaiting_deploy' | 'degraded';
}

export interface AgentExecutionStep {
  agentId: AuraAgentId;
  blueprintName: string;
  agentName: string;
  action: string;
  summary: string;
  durationMs: number;
  timestamp: string;
  correlationId: string;
  transport: 'astropods_cloud_api' | 'astropods_web_adapter' | 'verified_backend_fallback';
  remoteExecuted: boolean;
  deploymentId?: string;
  conversationId?: string;
  validationPassed: boolean;
  structuredOutput?: Record<string, any>;
  errorReason?: string;
}

export interface OrchestratedWorkflowResult {
  workflowId: string;
  correlationId: string;
  primaryAgent: AuraAgentId;
  participatingAgents: AuraAgentId[];
  executionMode:
    | 'astropods_cloud_deployment'
    | 'astropods_web_adapter'
    | 'astropods_local_orchestrator';
  remoteExecutionCount: number;
  steps: AgentExecutionStep[];
  primaryAgentOutput?: Record<string, any>;
  guardianVerdict: {
    approved: boolean;
    requiresExplicitUserConfirmation: boolean;
    requiresPin: boolean;
    policyNotes: string[];
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    reasonsForRejection?: string[];
  };
}

export interface AgentInvocationRequest {
  agentId: AuraAgentId;
  task: string;
  input: Record<string, any>;
  correlationId?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
}

export interface AgentInvocationResponse<T = Record<string, any>> {
  agentId: AuraAgentId;
  blueprintName: string;
  correlationId: string;
  transport: 'astropods_cloud_api' | 'astropods_web_adapter' | 'verified_backend_fallback';
  remoteExecuted: boolean;
  deploymentId?: string;
  conversationId?: string;
  durationMs: number;
  validationPassed: boolean;
  validationErrors: string[];
  output: T;
  rawText?: string;
  errorReason?: string;
}

const FORBIDDEN_SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'pin',
  'pinhash',
  'token',
  'accesstoken',
  'approvaltoken',
  'approvaltokenhash',
  'jwt',
  'secret',
  'clientsecret',
  'accountnumber',
  'rawaccountnumber',
  'cvv',
  'cardnumber',
  'ssn',
  'pan',
]);

export const AURA_AGENTS: Record<AuraAgentId, AuraAgentDefinition> = {
  'financial-planner': {
    id: 'financial-planner',
    blueprintName: 'aura-financial-planner',
    blueprintPath: 'astropods-agents/aura-financial-planner/astropods.yml',
    agentCardPath: 'astropods-agents/aura-financial-planner/AGENT.md',
    name: 'Agent 1: Financial Planner',
    role: 'Holistic Budget & Goal Allocation Architect',
    description:
      'Analyses income, expenditure, financial goals, and upcoming commitments to generate realistic financial plans, savings allocations, and trade-off explanations.',
    responsibilities: [
      'Understand the user financial situation',
      'Analyse income and expenditure',
      'Consider financial goals and evaluate upcoming commitments',
      'Generate realistic financial plans and recommend savings allocations',
      'Explain financial trade-offs and suggest next actions',
    ],
    allowedTools: ['compute_budget_baseline'],
    inputSchemaFields: ['monthlyIncome', 'expenses', 'financialGoals', 'upcomingCommitments'],
    outputSchemaFields: [
      'financialPlan',
      'recommendedAllocations',
      'risks',
      'explanations',
      'suggestedNextActions',
    ],
    canExecutePayments: false,
    executionLimits: {
      timeoutMs: env.ASTROPODS_TIMEOUT_MS,
      maxRetries: env.ASTROPODS_MAX_RETRIES,
      maxSteps: 5,
    },
    status: 'blueprint_ready_awaiting_deploy',
  },
  'transaction-intelligence': {
    id: 'transaction-intelligence',
    blueprintName: 'aura-transaction-intelligence',
    blueprintPath: 'astropods-agents/aura-transaction-intelligence/astropods.yml',
    agentCardPath: 'astropods-agents/aura-transaction-intelligence/AGENT.md',
    name: 'Agent 2: Transaction Intelligence',
    role: 'Spending Pattern & Anomaly Analyst',
    description:
      'Analyses financial transactions, identifies spending patterns, categorises transactions, detects unusual expenditure, and explains spending trends.',
    responsibilities: [
      'Analyse financial transactions and identify spending patterns',
      'Categorise transactions accurately',
      'Detect unusual expenditure using statistical z-scores and category thresholds',
      'Identify changes in spending behaviour and explain spending trends',
    ],
    allowedTools: ['compute_transaction_statistics'],
    inputSchemaFields: ['transactions', 'monthlyIncome'],
    outputSchemaFields: [
      'transactionClassifications',
      'spendingInsights',
      'anomalyObservations',
      'explanations',
    ],
    canExecutePayments: false,
    executionLimits: {
      timeoutMs: env.ASTROPODS_TIMEOUT_MS,
      maxRetries: env.ASTROPODS_MAX_RETRIES,
      maxSteps: 5,
    },
    status: 'blueprint_ready_awaiting_deploy',
  },
  'mandate-intelligence': {
    id: 'mandate-intelligence',
    blueprintName: 'aura-mandate-intelligence',
    blueprintPath: 'astropods-agents/aura-mandate-intelligence/astropods.yml',
    agentCardPath: 'astropods-agents/aura-mandate-intelligence/AGENT.md',
    name: 'Agent 3: Mandate Intelligence',
    role: 'Recurring Commitment & Subscription Specialist',
    description:
      'Identifies recurring financial commitments, detects subscriptions and recurring bills, estimates upcoming payment dates, and flags duplicate subscriptions or unusual amount changes.',
    responsibilities: [
      'Identify recurring financial commitments and detect subscriptions',
      'Recognise recurring bills and estimate upcoming payment dates',
      'Identify duplicate subscriptions across merchants',
      'Detect unusual changes in recurring payment amounts',
    ],
    allowedTools: ['analyze_recurring_patterns'],
    inputSchemaFields: ['mandates', 'transactions'],
    outputSchemaFields: [
      'recurringCommitments',
      'duplicateSubscriptions',
      'unusualChanges',
      'recommendations',
    ],
    canExecutePayments: false,
    executionLimits: {
      timeoutMs: env.ASTROPODS_TIMEOUT_MS,
      maxRetries: env.ASTROPODS_MAX_RETRIES,
      maxSteps: 5,
    },
    status: 'blueprint_ready_awaiting_deploy',
  },
  'financial-recovery': {
    id: 'financial-recovery',
    blueprintName: 'aura-financial-recovery',
    blueprintPath: 'astropods-agents/aura-financial-recovery/astropods.yml',
    agentCardPath: 'astropods-agents/aura-financial-recovery/AGENT.md',
    name: 'Agent 4: Financial Recovery Advisor',
    role: 'Empathetic Budget Overrun & Cashflow Recovery Advisor',
    description:
      'Helps users recover from overspending, identifies financial pressure points, suggests realistic budget adjustments while protecting essential bills, and recalculates goal timelines.',
    responsibilities: [
      'Help users recover from overspending and identify financial pressure points',
      'Suggest realistic budget adjustments while protecting essential commitments',
      'Recalculate goal timelines',
      'Provide empathetic recovery recommendations without judgemental language',
    ],
    allowedTools: ['compute_recovery_options'],
    inputSchemaFields: ['monthlyIncome', 'allocations', 'upcomingCommitments', 'goals'],
    outputSchemaFields: [
      'recoveryPlan',
      'suggestedAdjustments',
      'revisedGoalProjections',
      'explanations',
    ],
    canExecutePayments: false,
    executionLimits: {
      timeoutMs: env.ASTROPODS_TIMEOUT_MS,
      maxRetries: env.ASTROPODS_MAX_RETRIES,
      maxSteps: 5,
    },
    status: 'blueprint_ready_awaiting_deploy',
  },
  'purchase-intelligence': {
    id: 'purchase-intelligence',
    blueprintName: 'aura-purchase-intelligence',
    blueprintPath: 'astropods-agents/aura-purchase-intelligence/astropods.yml',
    agentCardPath: 'astropods-agents/aura-purchase-intelligence/AGENT.md',
    name: 'Agent 5: Purchase Intelligence',
    role: 'Smart Purchase & Channel3 Affordability Evaluator',
    description:
      'Evaluates purchase affordability against financial goals, upcoming commitments, and discretionary spending capacity, comparing Channel3 products against budget.',
    responsibilities: [
      'Evaluate purchase affordability against financial goals and upcoming commitments',
      'Evaluate discretionary spending capacity',
      'Compare Channel3 discovered products against user requirements and budget',
      'Never initiate purchases independently',
    ],
    allowedTools: ['evaluate_purchase_math'],
    inputSchemaFields: [
      'query',
      'monthlyIncomeInr',
      'availableDiscretionaryBudgetInr',
      'upcomingCommitmentsInr',
      'products',
    ],
    outputSchemaFields: [
      'affordabilityAssessment',
      'productComparisons',
      'financialImplications',
      'recommendations',
      'potentialRisks',
    ],
    canExecutePayments: false,
    executionLimits: {
      timeoutMs: env.ASTROPODS_TIMEOUT_MS,
      maxRetries: env.ASTROPODS_MAX_RETRIES,
      maxSteps: 5,
    },
    status: 'blueprint_ready_awaiting_deploy',
  },
  'financial-guardian': {
    id: 'financial-guardian',
    blueprintName: 'aura-financial-guardian',
    blueprintPath: 'astropods-agents/aura-financial-guardian/astropods.yml',
    agentCardPath: 'astropods-agents/aura-financial-guardian/AGENT.md',
    name: 'Agent 6: Financial Guardian',
    role: 'Financial Policy, Risk Assessment & Payment Safety Reviewer',
    description:
      'Reviews proposed financial actions, identifies affordability concerns and financial risks, checks user-defined constraints, and provides advisory risk assessments without replacing deterministic backend payment validation.',
    responsibilities: [
      'Review proposed financial actions and identify affordability concerns',
      'Detect potential financial risks and check user-defined financial constraints',
      'Identify missing information and provide risk assessments',
      'Never replace deterministic backend payment validation or authorize payments independently',
    ],
    allowedTools: ['evaluate_policy_constraints'],
    inputSchemaFields: ['actionType', 'amountInr', 'recipientName', 'policy', 'accountBalanceInr'],
    outputSchemaFields: [
      'riskAssessment',
      'validationObservations',
      'approvalRecommendation',
      'reasonsForRejection',
    ],
    canExecutePayments: false,
    executionLimits: {
      timeoutMs: env.ASTROPODS_TIMEOUT_MS,
      maxRetries: env.ASTROPODS_MAX_RETRIES,
      maxSteps: 5,
    },
    status: 'blueprint_ready_awaiting_deploy',
  },
};

export class AstropodsOrchestrationService {
  private executionHistory: OrchestratedWorkflowResult[] = [];
  private inFlightRequests = new Map<string, Promise<AgentInvocationResponse<any>>>();
  private completedIdempotentCache = new Map<
    string,
    { expiresAt: number; response: AgentInvocationResponse<any> }
  >();

  private getAgentEndpointConfig(agentId: AuraAgentId): {
    deploymentId: string;
    adapterUrl: string;
  } {
    switch (agentId) {
      case 'financial-planner':
        return {
          deploymentId: env.ASTROPODS_DEPLOYMENT_FINANCIAL_PLANNER,
          adapterUrl: env.ASTROPODS_URL_FINANCIAL_PLANNER,
        };
      case 'transaction-intelligence':
        return {
          deploymentId: env.ASTROPODS_DEPLOYMENT_TRANSACTION_INTELLIGENCE,
          adapterUrl: env.ASTROPODS_URL_TRANSACTION_INTELLIGENCE,
        };
      case 'mandate-intelligence':
        return {
          deploymentId: env.ASTROPODS_DEPLOYMENT_MANDATE_INTELLIGENCE,
          adapterUrl: env.ASTROPODS_URL_MANDATE_INTELLIGENCE,
        };
      case 'financial-recovery':
        return {
          deploymentId: env.ASTROPODS_DEPLOYMENT_FINANCIAL_RECOVERY,
          adapterUrl: env.ASTROPODS_URL_FINANCIAL_RECOVERY,
        };
      case 'purchase-intelligence':
        return {
          deploymentId: env.ASTROPODS_DEPLOYMENT_PURCHASE_INTELLIGENCE,
          adapterUrl: env.ASTROPODS_URL_PURCHASE_INTELLIGENCE,
        };
      case 'financial-guardian':
        return {
          deploymentId: env.ASTROPODS_DEPLOYMENT_FINANCIAL_GUARDIAN,
          adapterUrl: env.ASTROPODS_URL_FINANCIAL_GUARDIAN,
        };
    }
  }

  getAgents(): AuraAgentDefinition[] {
    return (Object.keys(AURA_AGENTS) as AuraAgentId[]).map((id) => {
      const def = AURA_AGENTS[id];
      const cfg = this.getAgentEndpointConfig(id);
      const hasCloudDeployment = Boolean(cfg.deploymentId && env.ASTROPODS_ACCESS_TOKEN);
      const hasAdapterUrl = Boolean(cfg.adapterUrl);
      return {
        ...def,
        deploymentId: cfg.deploymentId || undefined,
        adapterUrl: cfg.adapterUrl || undefined,
        status: hasCloudDeployment
          ? 'deployed_online'
          : hasAdapterUrl
          ? 'adapter_online'
          : 'blueprint_ready_awaiting_deploy',
      };
    });
  }

  getHealthStatus() {
    const agents = this.getAgents();
    const deployedCloudCount = agents.filter((a) => a.status === 'deployed_online').length;
    const adapterOnlineCount = agents.filter((a) => a.status === 'adapter_online').length;
    const hasAccessToken = Boolean(env.ASTROPODS_ACCESS_TOKEN);

    let mode = 'astropods_local_orchestrator (Configure ASTROPODS_ACCESS_TOKEN & ASTROPODS_DEPLOYMENT_* or ASTROPODS_URL_* for remote agent execution)';
    if (deployedCloudCount === 6 && hasAccessToken) {
      mode = 'astropods_cloud_connected (All 6 Astropods deployments active)';
    } else if (deployedCloudCount > 0 && hasAccessToken) {
      mode = `astropods_cloud_partial (${deployedCloudCount}/6 cloud deployments configured)`;
    } else if (adapterOnlineCount > 0) {
      mode = `astropods_web_adapter_connected (${adapterOnlineCount}/6 web adapter endpoints active)`;
    }

    return {
      technology: 'Astropods',
      apiBaseUrl: env.ASTROPODS_API_URL,
      account: env.ASTROPODS_ACCOUNT,
      workspaceId: env.ASTROPODS_WORKSPACE_ID,
      accessTokenConfigured: hasAccessToken,
      deployedCloudAgentsCount: deployedCloudCount,
      webAdapterAgentsCount: adapterOnlineCount,
      intendedResponsibility:
        'Remote multi-agent execution on Astropods infrastructure with OpenTelemetry tracing & strict backend financial validation',
      status: 'operational',
      mode,
      registeredAgents: agents.map((a) => ({
        id: a.id,
        blueprintName: a.blueprintName,
        blueprintPath: a.blueprintPath,
        name: a.name,
        role: a.role,
        canExecutePayments: a.canExecutePayments,
        deploymentId: a.deploymentId || null,
        adapterUrl: a.adapterUrl || null,
        status: a.status,
      })),
      recentExecutionsCount: this.executionHistory.length,
    };
  }

  getRecentExecutions(limit = 15): OrchestratedWorkflowResult[] {
    return this.executionHistory.slice(0, limit);
  }

  /**
   * Queries the official Astropods REST API (`GET /api/v1/deployments?account={account}`)
   * and/or configured Web Adapter `/health` endpoints to check live remote availability.
   */
  async checkRemoteAvailability(): Promise<{
    cloudApiReachable: boolean;
    cloudDeployments: any[];
    agentHealthChecks: Record<
      AuraAgentId,
      {
        blueprintName: string;
        reachable: boolean;
        transport: 'cloud_api' | 'web_adapter' | 'unconfigured';
        detail: string;
      }
    >;
  }> {
    let cloudApiReachable = false;
    let cloudDeployments: any[] = [];

    if (env.ASTROPODS_ACCESS_TOKEN) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(
          `${env.ASTROPODS_API_URL}/deployments?account=${encodeURIComponent(env.ASTROPODS_ACCOUNT)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${env.ASTROPODS_ACCESS_TOKEN}`,
              Accept: 'application/json',
            },
            signal: controller.signal,
          }
        );
        clearTimeout(timer);
        if (resp.ok) {
          cloudApiReachable = true;
          const body: any = await resp.json();
          cloudDeployments = Array.isArray(body) ? body : body?.deployments || body?.data || [];
        }
      } catch (err: any) {
        logger.warn('AstropodsIntegration', 'Could not list deployments from Astropods Cloud API', {
          error: err?.message,
        });
      }
    }

    const agentHealthChecks = {} as Record<
      AuraAgentId,
      {
        blueprintName: string;
        reachable: boolean;
        transport: 'cloud_api' | 'web_adapter' | 'unconfigured';
        detail: string;
      }
    >;

    for (const id of Object.keys(AURA_AGENTS) as AuraAgentId[]) {
      const def = AURA_AGENTS[id];
      const cfg = this.getAgentEndpointConfig(id);

      if (cfg.deploymentId && env.ASTROPODS_ACCESS_TOKEN) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(
            `${env.ASTROPODS_API_URL}/deployments/${encodeURIComponent(cfg.deploymentId)}`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${env.ASTROPODS_ACCESS_TOKEN}`,
                Accept: 'application/json',
              },
              signal: controller.signal,
            }
          );
          clearTimeout(timer);
          agentHealthChecks[id] = {
            blueprintName: def.blueprintName,
            reachable: resp.ok,
            transport: 'cloud_api',
            detail: resp.ok
              ? `Cloud deployment ${cfg.deploymentId} online`
              : `Cloud deployment ${cfg.deploymentId} returned HTTP ${resp.status}`,
          };
          continue;
        } catch (err: any) {
          agentHealthChecks[id] = {
            blueprintName: def.blueprintName,
            reachable: false,
            transport: 'cloud_api',
            detail: `Cloud deployment unreachable: ${err?.message}`,
          };
          continue;
        }
      }

      if (cfg.adapterUrl) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 4000);
          const resp = await fetch(`${cfg.adapterUrl.replace(/\/+$/, '')}/health`, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timer);
          agentHealthChecks[id] = {
            blueprintName: def.blueprintName,
            reachable: resp.ok,
            transport: 'web_adapter',
            detail: resp.ok
              ? `Web adapter at ${cfg.adapterUrl} healthy`
              : `Web adapter at ${cfg.adapterUrl} returned HTTP ${resp.status}`,
          };
          continue;
        } catch (err: any) {
          agentHealthChecks[id] = {
            blueprintName: def.blueprintName,
            reachable: false,
            transport: 'web_adapter',
            detail: `Web adapter unreachable: ${err?.message}`,
          };
          continue;
        }
      }

      agentHealthChecks[id] = {
        blueprintName: def.blueprintName,
        reachable: false,
        transport: 'unconfigured',
        detail: `Blueprint ${def.blueprintPath} validated; awaiting deployment ID or adapter URL`,
      };
    }

    return {
      cloudApiReachable,
      cloudDeployments,
      agentHealthChecks,
    };
  }

  /**
   * Queries official Astropods Observability API (`GET /api/v1/agents/{account}/{name}/observability/traces`)
   * for recorded OpenTelemetry traces of a deployed agent.
   */
  async fetchRemoteAgentTraces(agentId: AuraAgentId, limit = 10): Promise<{
    liveTracesFetched: boolean;
    blueprintName: string;
    traces: any[];
    message: string;
  }> {
    const def = AURA_AGENTS[agentId];
    if (!env.ASTROPODS_ACCESS_TOKEN) {
      return {
        liveTracesFetched: false,
        blueprintName: def.blueprintName,
        traces: [],
        message: 'ASTROPODS_ACCESS_TOKEN not configured; returning local execution traces only.',
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `${env.ASTROPODS_API_URL}/agents/${encodeURIComponent(
        env.ASTROPODS_ACCOUNT
      )}/${encodeURIComponent(def.blueprintName)}/observability/traces?limit=${limit}`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${env.ASTROPODS_ACCESS_TOKEN}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        const data: any = await resp.json();
        return {
          liveTracesFetched: true,
          blueprintName: def.blueprintName,
          traces: Array.isArray(data) ? data : data?.traces || data?.data || [],
          message: 'Fetched live OpenTelemetry traces from Astropods Observability API.',
        };
      }
      return {
        liveTracesFetched: false,
        blueprintName: def.blueprintName,
        traces: [],
        message: `Astropods Observability API returned HTTP ${resp.status}`,
      };
    } catch (err: any) {
      return {
        liveTracesFetched: false,
        blueprintName: def.blueprintName,
        traces: [],
        message: `Could not reach Astropods Observability API: ${err?.message}`,
      };
    }
  }

  /**
   * Validates agent input and strips any forbidden credentials, PINs, tokens, or raw account numbers.
   * Throws an explicit error on invalid input or missing critical financial parameters.
   */
  validateAndSanitizeAgentInput(
    agentId: AuraAgentId,
    input: Record<string, any>
  ): { sanitized: Record<string, any>; strippedKeys: string[] } {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error(`Invalid input for agent ${agentId}: input must be a non-null JSON object.`);
    }

    // Reject attempts to ask any agent to execute or authorize a payment
    if (
      input.executePaymentNow === true ||
      input.bypassPinVerification === true ||
      input.autoAuthorizePayPal === true
    ) {
      throw new Error(
        `Security violation blocked: AI agent ${agentId} is strictly forbidden from authorizing or executing payments.`
      );
    }

    const strippedKeys: string[] = [];

    const sanitizeValue = (val: any): any => {
      if (val === null || val === undefined) return val;
      if (Array.isArray(val)) return val.map(sanitizeValue);
      if (typeof val === 'object') {
        const cleanObj: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          const lower = k.toLowerCase().replace(/[_-]/g, '');
          if (FORBIDDEN_SENSITIVE_KEYS.has(lower)) {
            strippedKeys.push(k);
            continue;
          }
          cleanObj[k] = sanitizeValue(v);
        }
        return cleanObj;
      }
      return val;
    };

    const sanitized = sanitizeValue(input);

    // Agent-specific required input validation
    if (agentId === 'financial-planner') {
      if (
        sanitized.monthlyIncome === undefined ||
        typeof sanitized.monthlyIncome !== 'number' ||
        isNaN(sanitized.monthlyIncome) ||
        sanitized.monthlyIncome < 0
      ) {
        throw new Error(
          'Missing or invalid financial information for Financial Planner: monthlyIncome (non-negative number) is required.'
        );
      }
    } else if (agentId === 'transaction-intelligence') {
      if (!Array.isArray(sanitized.transactions)) {
        throw new Error(
          'Missing or invalid financial information for Transaction Intelligence: transactions array is required.'
        );
      }
    } else if (agentId === 'mandate-intelligence') {
      if (!Array.isArray(sanitized.mandates) && !Array.isArray(sanitized.transactions)) {
        throw new Error(
          'Missing financial information for Mandate Intelligence: mandates or transactions array is required.'
        );
      }
    } else if (agentId === 'financial-recovery') {
      if (
        sanitized.monthlyIncome === undefined ||
        typeof sanitized.monthlyIncome !== 'number' ||
        sanitized.monthlyIncome <= 0
      ) {
        throw new Error(
          'Missing or invalid financial information for Financial Recovery Advisor: positive monthlyIncome is required.'
        );
      }
    } else if (agentId === 'purchase-intelligence') {
      if (
        typeof sanitized.monthlyIncomeInr !== 'number' ||
        typeof sanitized.availableDiscretionaryBudgetInr !== 'number'
      ) {
        throw new Error(
          'Missing financial information for Purchase Intelligence: monthlyIncomeInr and availableDiscretionaryBudgetInr are required.'
        );
      }
    } else if (agentId === 'financial-guardian') {
      if (
        typeof sanitized.amountInr !== 'number' ||
        isNaN(sanitized.amountInr) ||
        sanitized.amountInr <= 0
      ) {
        throw new Error(
          'Invalid financial input for Financial Guardian: positive amountInr is required.'
        );
      }
    }

    return { sanitized, strippedKeys };
  }

  /**
   * Parses and validates untrusted structured JSON output from an Astropods agent.
   * Enforces schema requirements, budget caps, and payment security boundaries.
   */
  parseAndValidateAgentOutput(
    agentId: AuraAgentId,
    rawResponseText: string,
    verifiedContext: Record<string, any>
  ): {
    valid: boolean;
    errors: string[];
    parsed: Record<string, any> | null;
  } {
    const errors: string[] = [];
    if (!rawResponseText || typeof rawResponseText !== 'string') {
      return { valid: false, errors: ['Empty or non-string response from agent'], parsed: null };
    }

    let jsonText = rawResponseText.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      jsonText = fenceMatch[1].trim();
    } else {
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.slice(firstBrace, lastBrace + 1);
      }
    }

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err: any) {
      return {
        valid: false,
        errors: [`Invalid JSON returned by agent ${agentId}: ${err?.message}`],
        parsed: null,
      };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        valid: false,
        errors: [`Agent ${agentId} output must be a JSON object`],
        parsed: null,
      };
    }

    // Security invariant: reject any agent output attempting to authorize or execute payments
    if (
      parsed.executePayment === true ||
      parsed.paymentExecuted === true ||
      parsed.bypassPin === true ||
      parsed.approvalRecommendation?.canAuthorizeOrExecutePayment === true ||
      parsed.affordabilityAssessment?.canInitiatePurchase === true
    ) {
      errors.push(
        `CRITICAL SECURITY VIOLATION: Agent ${agentId} attempted to claim payment/purchase execution authority.`
      );
      return { valid: false, errors, parsed: null };
    }

    // Normalize common schema aliases across agents
    if (agentId === 'mandate-intelligence') {
      if (parsed.recurringCommitmentRecords && !parsed.recurringCommitments) {
        parsed.recurringCommitments = parsed.recurringCommitmentRecords;
      }
      if (parsed.unusualMandateChanges && !parsed.unusualChanges) {
        parsed.unusualChanges = parsed.unusualMandateChanges;
      }
    }

    const expectedFields = AURA_AGENTS[agentId].outputSchemaFields;
    for (const field of expectedFields) {
      if (parsed[field] === undefined) {
        errors.push(`Missing required field "${field}" in ${agentId} response`);
      }
    }

    // Over-budget guard for Financial Planner
    if (agentId === 'financial-planner' && Array.isArray(parsed.recommendedAllocations)) {
      const income = Number(verifiedContext.monthlyIncome || verifiedContext.monthlyIncomeInr || 0);
      const totalRecommended = parsed.recommendedAllocations.reduce(
        (sum: number, item: any) =>
          sum + Number(item?.recommendedAmount ?? item?.recommendedAmountInr ?? 0),
        0
      );
      if (income > 0 && totalRecommended > income * 1.05) {
        errors.push(
          `Over-budget recommendation rejected: Agent recommended total allocations of INR ${totalRecommended}, exceeding verified monthly income of INR ${income}.`
        );
      }
    }

    // Essential commitment protection guard for Financial Recovery
    if (agentId === 'financial-recovery' && Array.isArray(parsed.suggestedAdjustments)) {
      const protectedCats = new Set(['rent', 'housing', 'loan emi', 'emi', 'insurance', 'utilities']);
      for (const adj of parsed.suggestedAdjustments) {
        const cat = String(adj?.category || '').toLowerCase();
        if (protectedCats.has(cat) && Number(adj?.recommendedReduction || 0) > 0) {
          errors.push(
            `Unsafe recovery adjustment rejected: Agent attempted to reduce protected essential category "${adj.category}".`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      parsed: errors.length === 0 ? parsed : null,
    };
  }

  /**
   * Invokes a single Astropods agent remotely via:
   * 1. Official Astropods Cloud Messaging API (`https://astropods.com/api/v1/deployments/{deploymentId}/messaging/conversations`)
   * 2. Official Astropods Web Adapter API (`{adapterUrl}/api/conversations`)
   * With request timeouts, safe retries on transient errors, correlation IDs, deduplication, and strict output validation.
   */
  async invokeAgent<T = Record<string, any>>(
    request: AgentInvocationRequest
  ): Promise<AgentInvocationResponse<T>> {
    const startTime = Date.now();
    const def = AURA_AGENTS[request.agentId];
    if (!def) {
      throw new Error(`Unknown AURA agent ID: ${request.agentId}`);
    }

    const correlationId =
      request.correlationId ||
      `astro-corr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Validate & sanitize input before any network or fallback processing
    const { sanitized } = this.validateAndSanitizeAgentInput(request.agentId, request.input);

    // Check idempotency / duplicate in-flight deduplication
    const dedupKey =
      request.idempotencyKey ||
      `${request.agentId}:${request.task}:${crypto
        .createHash('sha256')
        .update(JSON.stringify(sanitized))
        .digest('hex')
        .slice(0, 16)}`;

    const cached = this.completedIdempotentCache.get(dedupKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.response,
        correlationId,
      };
    }

    const existingInFlight = this.inFlightRequests.get(dedupKey);
    if (existingInFlight) {
      const sharedResp = await existingInFlight;
      return {
        ...sharedResp,
        correlationId,
      };
    }

    const executionPromise = this.executeAgentInvocationInternal<T>(
      request,
      def,
      sanitized,
      correlationId,
      startTime
    );

    this.inFlightRequests.set(dedupKey, executionPromise);
    try {
      const result = await executionPromise;
      if (request.idempotencyKey && result.validationPassed) {
        this.completedIdempotentCache.set(dedupKey, {
          expiresAt: Date.now() + 60_000,
          response: result,
        });
      }
      return result;
    } finally {
      this.inFlightRequests.delete(dedupKey);
    }
  }

  private async executeAgentInvocationInternal<T = Record<string, any>>(
    request: AgentInvocationRequest,
    def: AuraAgentDefinition,
    sanitizedInput: Record<string, any>,
    correlationId: string,
    startTime: number
  ): Promise<AgentInvocationResponse<T>> {
    const cfg = this.getAgentEndpointConfig(request.agentId);
    const timeoutMs = request.timeoutMs || def.executionLimits.timeoutMs;
    const maxRetries = def.executionLimits.maxRetries;

    const messagePayload = JSON.stringify({
      correlationId,
      agentId: request.agentId,
      blueprintName: def.blueprintName,
      task: request.task,
      input: sanitizedInput,
      requireStructuredJson: true,
    });

    let lastErrorReason: string | undefined;

    // 1. Try Official Astropods Cloud Deployment API if configured
    if (cfg.deploymentId && env.ASTROPODS_ACCESS_TOKEN) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const cloudResp = await this.callAstropodsCloudDeployment({
            deploymentId: cfg.deploymentId,
            messageContent: messagePayload,
            correlationId,
            timeoutMs,
          });

          const validation = this.parseAndValidateAgentOutput(
            request.agentId,
            cloudResp.assistantText,
            sanitizedInput
          );

          if (validation.valid && validation.parsed) {
            return {
              agentId: request.agentId,
              blueprintName: def.blueprintName,
              correlationId,
              transport: 'astropods_cloud_api',
              remoteExecuted: true,
              deploymentId: cfg.deploymentId,
              conversationId: cloudResp.conversationId,
              durationMs: Date.now() - startTime,
              validationPassed: true,
              validationErrors: [],
              output: validation.parsed as T,
              rawText: cloudResp.assistantText,
            };
          } else {
            lastErrorReason = `Astropods cloud agent response failed schema validation: ${validation.errors.join('; ')}`;
            logger.warn('AstropodsIntegration', lastErrorReason, {
              agentId: request.agentId,
              correlationId,
            });
            break; // Do not retry schema validation failure
          }
        } catch (err: any) {
          const errMsg = String(err?.message || 'Astropods Cloud API request failed');
          lastErrorReason = errMsg;
          const isTransient =
            errMsg.includes('502') ||
            errMsg.includes('503') ||
            errMsg.includes('504') ||
            errMsg.includes('fetch failed') ||
            errMsg.includes('ECONNREFUSED');
          if (!isTransient || attempt === maxRetries) {
            logger.warn('AstropodsIntegration', `Cloud invocation failed for ${def.blueprintName}`, {
              correlationId,
              attempt: attempt + 1,
              error: lastErrorReason,
            });
            break;
          }
          await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
        }
      }
    }

    // 2. Try Official Astropods Web Adapter API if configured
    if (cfg.adapterUrl) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const adapterResp = await this.callAstropodsWebAdapter({
            adapterUrl: cfg.adapterUrl,
            messageContent: messagePayload,
            correlationId,
            timeoutMs,
          });

          const validation = this.parseAndValidateAgentOutput(
            request.agentId,
            adapterResp.assistantText,
            sanitizedInput
          );

          if (validation.valid && validation.parsed) {
            return {
              agentId: request.agentId,
              blueprintName: def.blueprintName,
              correlationId,
              transport: 'astropods_web_adapter',
              remoteExecuted: true,
              conversationId: adapterResp.conversationId,
              durationMs: Date.now() - startTime,
              validationPassed: true,
              validationErrors: [],
              output: validation.parsed as T,
              rawText: adapterResp.assistantText,
            };
          } else {
            lastErrorReason = `Astropods Web Adapter response failed schema validation: ${validation.errors.join('; ')}`;
            logger.warn('AstropodsIntegration', lastErrorReason, {
              agentId: request.agentId,
              correlationId,
            });
            break;
          }
        } catch (err: any) {
          const errMsg = String(err?.message || 'Astropods Web Adapter request failed');
          lastErrorReason = errMsg;
          const isTransient =
            errMsg.includes('502') ||
            errMsg.includes('503') ||
            errMsg.includes('504') ||
            errMsg.includes('fetch failed') ||
            errMsg.includes('ECONNREFUSED');
          if (!isTransient || attempt === maxRetries) {
            logger.warn('AstropodsIntegration', `Web adapter invocation failed for ${def.blueprintName}`, {
              correlationId,
              attempt: attempt + 1,
              error: lastErrorReason,
            });
            break;
          }
          await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
        }
      }
    }

    // 3. Verified Deterministic Backend Fallback when remote Astropods deployment is unavailable or unconfigured
    const fallbackOutput = this.computeVerifiedDeterministicFallback(request.agentId, sanitizedInput);
    return {
      agentId: request.agentId,
      blueprintName: def.blueprintName,
      correlationId,
      transport: 'verified_backend_fallback',
      remoteExecuted: false,
      durationMs: Math.max(2, Date.now() - startTime),
      validationPassed: true,
      validationErrors: [],
      output: fallbackOutput as T,
      errorReason:
        lastErrorReason ||
        'Remote Astropods deployment ID / adapter URL not configured; used verified deterministic backend calculation.',
    };
  }

  /**
   * Consumes an Astropods SSE stream (`GET .../conversations/{conversationId}/stream`)
   * while concurrently posting the user message (`POST .../conversations/{conversationId}/messages`),
   * accumulating `chunk_type: "delta"` content until `chunk_type: "end"` or stream completion.
   */
  private async sendMessageAndReadAstropodsSseStream(params: {
    streamUrl: string;
    messageUrl: string;
    messageContent: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  }): Promise<string> {
    const streamResp = await fetch(params.streamUrl, {
      method: 'GET',
      headers: {
        ...params.headers,
        Accept: 'text/event-stream',
      },
      signal: params.signal,
    });

    if (!streamResp.ok || !streamResp.body) {
      throw new Error(`Astropods SSE stream GET returned HTTP ${streamResp.status}`);
    }

    const msgResp = await fetch(params.messageUrl, {
      method: 'POST',
      headers: params.headers,
      body: JSON.stringify({ content: params.messageContent }),
      signal: params.signal,
    });

    if (!msgResp.ok) {
      throw new Error(`Astropods message POST returned HTTP ${msgResp.status}`);
    }

    const reader = streamResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const dataStr = line.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') continue;

          try {
            const evt = JSON.parse(dataStr);
            if (evt.type === 'chunk') {
              if (typeof evt.content === 'string' && evt.content.length > 0) {
                accumulated += evt.content;
              }
              if (
                (evt.chunk_type === 'end' ||
                  evt.chunk_type === 'complete' ||
                  evt.chunk_type === 'finish') &&
                accumulated.trim().length > 0
              ) {
                return accumulated;
              }
              // If a single delta already contains a complete JSON object, check if valid JSON
              if (
                evt.chunk_type === 'delta' &&
                accumulated.trim().startsWith('{') &&
                accumulated.trim().endsWith('}')
              ) {
                try {
                  JSON.parse(accumulated.trim());
                  return accumulated;
                } catch {
                  // Wait for remaining chunks
                }
              }
            } else if (evt.type === 'error') {
              throw new Error(evt.message || evt.error || 'Astropods agent stream error');
            }
          } catch (parseErr: any) {
            if (parseErr?.message?.includes('Astropods agent stream error')) {
              throw parseErr;
            }
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Ignore reader cancel errors
      }
    }

    if (accumulated.trim().length > 0) {
      return accumulated;
    }
    throw new Error('Astropods SSE stream closed without returning assistant content');
  }

  /**
   * Executes a conversation turn against the official Astropods Cloud Messaging API:
   * - POST /api/v1/deployments/{deploymentId}/messaging/conversations
   * - GET  /api/v1/deployments/{deploymentId}/messaging/conversations/{conversationId}/stream
   * - POST /api/v1/deployments/{deploymentId}/messaging/conversations/{conversationId}/messages
   */
  private async callAstropodsCloudDeployment(params: {
    deploymentId: string;
    messageContent: string;
    correlationId: string;
    timeoutMs: number;
  }): Promise<{ conversationId: string; assistantText: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const baseUrl = env.ASTROPODS_API_URL.replace(/\/+$/, '');
      const headers: Record<string, string> = {
        Authorization: `Bearer ${env.ASTROPODS_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Correlation-ID': params.correlationId,
      };

      const createResp = await fetch(
        `${baseUrl}/deployments/${encodeURIComponent(params.deploymentId)}/messaging/conversations`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
          signal: controller.signal,
        }
      );
      if (!createResp.ok) {
        throw new Error(
          `Astropods POST /messaging/conversations returned HTTP ${createResp.status}`
        );
      }
      const createData: any = await createResp.json();
      const conversationId = String(
        createData?.conversation_id || createData?.id || createData?.conversationId || ''
      );
      if (!conversationId) {
        throw new Error('Astropods Cloud API did not return a valid conversation_id');
      }

      const streamUrl = `${baseUrl}/deployments/${encodeURIComponent(
        params.deploymentId
      )}/messaging/conversations/${encodeURIComponent(conversationId)}/stream`;
      const messageUrl = `${baseUrl}/deployments/${encodeURIComponent(
        params.deploymentId
      )}/messaging/conversations/${encodeURIComponent(conversationId)}/messages`;

      const assistantText = await this.sendMessageAndReadAstropodsSseStream({
        streamUrl,
        messageUrl,
        messageContent: params.messageContent,
        headers,
        signal: controller.signal,
      });

      return { conversationId, assistantText };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Executes a conversation turn against the official Astropods Web Adapter API:
   * - POST {adapterUrl}/api/conversations
   * - GET  {adapterUrl}/api/conversations/{conversationId}/stream
   * - POST {adapterUrl}/api/conversations/{conversationId}/messages
   */
  private async callAstropodsWebAdapter(params: {
    adapterUrl: string;
    messageContent: string;
    correlationId: string;
    timeoutMs: number;
  }): Promise<{ conversationId: string; assistantText: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const baseUrl = params.adapterUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Correlation-ID': params.correlationId,
      };
      if (env.ASTROPODS_ACCESS_TOKEN) {
        headers.Authorization = `Bearer ${env.ASTROPODS_ACCESS_TOKEN}`;
      }

      const createResp = await fetch(`${baseUrl}/api/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      if (!createResp.ok) {
        throw new Error(`Web Adapter POST /api/conversations returned HTTP ${createResp.status}`);
      }
      const createData: any = await createResp.json();
      const conversationId = String(
        createData?.conversation_id || createData?.conversationId || createData?.id || ''
      );
      if (!conversationId) {
        throw new Error('Web Adapter did not return a valid conversationId');
      }

      const streamUrl = `${baseUrl}/api/conversations/${encodeURIComponent(conversationId)}/stream`;
      const messageUrl = `${baseUrl}/api/conversations/${encodeURIComponent(
        conversationId
      )}/messages`;

      const assistantText = await this.sendMessageAndReadAstropodsSseStream({
        streamUrl,
        messageUrl,
        messageContent: params.messageContent,
        headers,
        signal: controller.signal,
      });

      return { conversationId, assistantText };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Computes deterministic, verified financial outputs matching each Astropods agent's exact JSON schema
   * when remote Astropods containers are unreachable or not yet configured.
   */
  private computeVerifiedDeterministicFallback(
    agentId: AuraAgentId,
    input: Record<string, any>
  ): Record<string, any> {
    switch (agentId) {
      case 'financial-planner': {
        const income = Number(input.monthlyIncome || 85000);
        const commitments = Array.isArray(input.upcomingCommitments)
          ? input.upcomingCommitments.reduce((s: number, c: any) => s + Number(c.amount || 0), 0)
          : Number(input.totalCommitments || 31398);
        const goalsTarget = Array.isArray(input.financialGoals)
          ? input.financialGoals.reduce(
              (s: number, g: any) => s + Number(g.monthlyContribution || 0),
              0
            )
          : Math.round(income * 0.2);
        const savings = Math.max(Math.round(income * 0.2), goalsTarget);
        const discretionary = Math.max(0, income - commitments - savings);
        const buffer = Math.round(discretionary * 0.2);

        return {
          financialPlan: {
            month: input.month || new Date().toISOString().slice(0, 7),
            monthlyIncome: income,
            totalCommitments: commitments,
            totalSavingsTarget: savings,
            totalDiscretionaryPool: discretionary - buffer,
            unallocatedBuffer: buffer,
            savingsRatePercent: income > 0 ? Math.round((savings / income) * 1000) / 10 : 0,
          },
          recommendedAllocations: [
            {
              category: 'Essential Commitments',
              type: 'essential',
              recommendedAmount: commitments,
              rationale: 'Covers confirmed recurring rent, utilities, and insurance mandates.',
            },
            {
              category: 'Savings & Financial Goals',
              type: 'savings',
              recommendedAmount: savings,
              rationale: 'Protects active goal milestones and emergency reserve growth.',
            },
            {
              category: 'Discretionary Lifestyle',
              type: 'discretionary',
              recommendedAmount: Math.max(0, discretionary - buffer),
              rationale: 'Flexible allowance for dining, shopping, and personal expenses.',
            },
            {
              category: 'Unallocated Safety Buffer',
              type: 'buffer',
              recommendedAmount: buffer,
              rationale: 'Cashflow cushion against unexpected mid-month expenditure.',
            },
          ],
          risks:
            commitments / Math.max(1, income) > 0.5
              ? ['Fixed commitments exceed 50% of monthly income, reducing discretionary flexibility.']
              : ['Committed obligations are within healthy bounds (<50% of monthly income).'],
          explanations: `Based on verified monthly income of ₹${income.toLocaleString(
            'en-IN'
          )}, ₹${commitments.toLocaleString(
            'en-IN'
          )} is reserved for recurring commitments and ₹${savings.toLocaleString(
            'en-IN'
          )} is allocated to savings goals, leaving ₹${(discretionary - buffer).toLocaleString(
            'en-IN'
          )} for discretionary spending and ₹${buffer.toLocaleString('en-IN')} as an unallocated buffer.`,
          suggestedNextActions: [
            'Automate goal contributions on payday before discretionary spending begins.',
            'Review recurring commitments in Bryntum Calendar 3 days prior to due dates.',
          ],
        };
      }

      case 'transaction-intelligence': {
        const txs: any[] = Array.isArray(input.transactions) ? input.transactions : [];
        const expenses = txs.filter((t) => t.type !== 'income');
        const totalExpense = expenses.reduce((s, t) => s + Number(t.amount || 0), 0);
        const catTotals: Record<string, number> = {};
        for (const t of expenses) {
          catTotals[t.category || 'Other'] =
            (catTotals[t.category || 'Other'] || 0) + Number(t.amount || 0);
        }
        const anomalies = expenses.filter(
          (t) =>
            t.isUnusual ||
            (Number(t.amount || 0) >= 10000 &&
              !['Rent', 'Housing', 'Loan EMI'].includes(t.category))
        );

        return {
          transactionClassifications: expenses.slice(0, 15).map((t) => ({
            merchant: t.merchant,
            amount: Number(t.amount || 0),
            category: t.category || 'Other',
            classification: ['Rent', 'Utilities', 'Insurance', 'Groceries'].includes(t.category)
              ? 'essential'
              : 'discretionary',
            isUnusual: Boolean(t.isUnusual || Number(t.amount || 0) >= 10000),
          })),
          spendingInsights: Object.entries(catTotals).map(([category, totalAmount]) => ({
            category,
            totalAmount,
            shareOfSpendPercent:
              totalExpense > 0 ? Math.round((totalAmount / totalExpense) * 1000) / 10 : 0,
            trendObservation: `${category} accounts for ₹${totalAmount.toLocaleString(
              'en-IN'
            )} of verified expenditure.`,
          })),
          anomalyObservations: anomalies.map((a) => ({
            merchant: a.merchant,
            amount: Number(a.amount || 0),
            category: a.category,
            date: a.date,
            reason:
              a.unusualReason ||
              `Expenditure of ₹${Number(a.amount || 0).toLocaleString(
                'en-IN'
              )} exceeds category baseline.`,
          })),
          explanations: `Analysed ${txs.length} transactions totalling ₹${totalExpense.toLocaleString(
            'en-IN'
          )} in expenditure, identifying ${anomalies.length} unusual transaction(s).`,
        };
      }

      case 'mandate-intelligence': {
        const mandates: any[] = Array.isArray(input.mandates) ? input.mandates : [];
        const now = new Date();
        const commitments = mandates
          .filter((m) => m.category !== 'Salary')
          .map((m) => {
            const dueDay = Number(m.dueDayOfMonth || 5);
            const nextDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
            if (nextDate < now) nextDate.setMonth(nextDate.getMonth() + 1);
            return {
              title: m.title || m.merchant,
              merchant: m.merchant,
              category: m.category || 'Recurring',
              amount: Number(m.amount || 0),
              expectedPaymentDate: m.nextDueDate
                ? new Date(m.nextDueDate).toISOString().slice(0, 10)
                : nextDate.toISOString().slice(0, 10),
              status: m.status || 'confirmed',
              confidenceLevel: Number(m.confidenceScore ?? 0.95),
            };
          });

        return {
          recurringCommitments: commitments,
          duplicateSubscriptions: [],
          unusualChanges: [],
          recommendations: [
            `Maintain at least ₹${commitments
              .reduce((s, c) => s + c.amount, 0)
              .toLocaleString('en-IN')} in liquid checking to cover confirmed monthly commitments.`,
          ],
        };
      }

      case 'financial-recovery': {
        const income = Number(input.monthlyIncome || 85000);
        const allocations: any[] = Array.isArray(input.allocations) ? input.allocations : [];
        const overruns = allocations.filter(
          (a) => Number(a.spentAmount || 0) > Number(a.allocatedAmount || 0)
        );
        const totalOverrun = overruns.reduce(
          (s, a) => s + (Number(a.spentAmount || 0) - Number(a.allocatedAmount || 0)),
          0
        );
        const shiftAmount = Math.max(2500, Math.round(totalOverrun || income * 0.04));

        return {
          recoveryPlan: {
            totalOverrunAmount: totalOverrun,
            protectedCommitmentsAmount: Number(input.totalCommitments || 31398),
            rebalancedBufferAmount: shiftAmount,
            recoveryHorizonDays: 14,
            status: 'actionable_without_touching_essentials',
          },
          suggestedAdjustments: [
            {
              category: 'Dining & Lifestyle',
              currentSpend: overruns[0]?.spentAmount || 8500,
              recommendedReduction: Math.round(shiftAmount * 0.6),
              action: `Gently pause non-essential dining/takeout by ₹${Math.round(
                shiftAmount * 0.6
              ).toLocaleString('en-IN')} over the next 14 days while keeping all essential bills untouched.`,
            },
            {
              category: 'Shopping & Discretionary',
              currentSpend: 6000,
              recommendedReduction: Math.round(shiftAmount * 0.4),
              action: `Defer non-urgent discretionary purchases by ₹${Math.round(
                shiftAmount * 0.4
              ).toLocaleString('en-IN')} this cycle to restore your cashflow buffer.`,
            },
          ],
          revisedGoalProjections: (Array.isArray(input.goals) ? input.goals : []).map((g: any) => ({
            goalTitle: g.title,
            targetAmount: Number(g.targetAmount || 0),
            currentAmount: Number(g.currentAmount || 0),
            projectedMonthsRemaining: Math.max(
              1,
              Math.ceil(
                (Number(g.targetAmount || 0) - Number(g.currentAmount || 0)) /
                  Math.max(1000, Number(g.monthlyContribution || 5000))
              )
            ),
            impactNote: 'Goal timeline remains intact when discretionary adjustments are applied.',
          })),
          explanations: `Your essential commitments (Rent, Insurance, Utilities) remain 100% protected. Shifting ₹${shiftAmount.toLocaleString(
            'en-IN'
          )} from flexible discretionary categories over the next two weeks restores your monthly safety cushion without stress.`,
        };
      }

      case 'purchase-intelligence': {
        const discBudget = Number(input.availableDiscretionaryBudgetInr || 18000);
        const commitments = Number(input.upcomingCommitmentsInr || 31398);
        const products: any[] = Array.isArray(input.products) ? input.products : [];
        const comparisons = products.map((p: any) => {
          const price = Number(p.priceInr || p.product?.priceInr || 50000);
          const name = String(p.name || p.product?.name || 'Evaluated Product');
          const affordableNow = price <= discBudget * 0.85;
          const borderline = !affordableNow && price <= discBudget * 1.25;
          return {
            productId: p.id || p.product?.id || 'ch3-item',
            name,
            priceInr: price,
            guidanceCategory: affordableNow
              ? 'Affordable now'
              : borderline
              ? 'Affordable if planned'
              : 'Defer purchase',
            discretionarySharePercent:
              discBudget > 0 ? Math.round((price / discBudget) * 1000) / 10 : 100,
            monthsToSaveSafely: affordableNow
              ? 0
              : Math.max(1, Math.ceil((price - discBudget * 0.4) / Math.max(3000, discBudget * 0.4))),
          };
        });

        const top = comparisons[0];
        return {
          affordabilityAssessment: {
            verdict: top?.guidanceCategory || 'Affordable if planned',
            canInitiatePurchase: false,
            availableDiscretionaryBudgetInr: discBudget,
            upcomingCommitmentsInr: commitments,
          },
          productComparisons: comparisons,
          financialImplications: {
            impactOnDiscretionaryBudget: top
              ? `Requires ${top.discretionarySharePercent}% of current monthly discretionary budget (₹${discBudget.toLocaleString('en-IN')}).`
              : 'Evaluated against current discretionary capacity.',
            impactOnUpcomingCommitments: `₹${commitments.toLocaleString(
              'en-IN'
            )} in upcoming commitments are ring-fenced and protected first.`,
          },
          recommendations: top
            ? [
                top.guidanceCategory === 'Affordable now'
                  ? `${top.name} (₹${top.priceInr.toLocaleString('en-IN')}) fits comfortably within your discretionary budget.`
                  : `Save over ${top.monthsToSaveSafely} month(s) or select a lower-cost alternative so your ₹${commitments.toLocaleString('en-IN')} in commitments and savings targets stay protected.`,
              ]
            : ['Compare options within your monthly discretionary cap before committing.'],
          potentialRisks:
            top && top.priceInr > discBudget
              ? [
                  `Immediate full-cash purchase of ₹${top.priceInr.toLocaleString(
                    'en-IN'
                  )} would exceed this month's ₹${discBudget.toLocaleString(
                    'en-IN'
                  )} discretionary allocation.`,
                ]
              : ['No immediate liquidity risk detected if commitments remain ring-fenced.'],
        };
      }

      case 'financial-guardian': {
        const amountInr = Number(input.amountInr || 0);
        const policy = input.policy || {};
        const singleLimit = Number(policy.singleTransactionLimit || 25000);
        const dailyLimit = Number(policy.dailySpendingLimit || 50000);
        const spentToday = Number(input.spentTodayInr || 0);
        const balance = Number(input.accountBalanceInr ?? 85000);
        const category = String(input.merchantCategory || 'General');
        const blockedCats: string[] = Array.isArray(policy.blockedCategories)
          ? policy.blockedCategories
          : [];

        const reasons: string[] = [];
        if (amountInr > singleLimit) {
          reasons.push(
            `Amount ₹${amountInr.toLocaleString(
              'en-IN'
            )} exceeds single transaction limit of ₹${singleLimit.toLocaleString('en-IN')}.`
          );
        }
        if (spentToday + amountInr > dailyLimit) {
          reasons.push(
            `Projected daily spend ₹${(spentToday + amountInr).toLocaleString(
              'en-IN'
            )} exceeds daily limit of ₹${dailyLimit.toLocaleString('en-IN')}.`
          );
        }
        if (blockedCats.includes(category)) {
          reasons.push(`Category "${category}" is blocked by user Financial Permission Policy.`);
        }
        if (balance < amountInr) {
          reasons.push(
            `Insufficient account balance (₹${balance.toLocaleString(
              'en-IN'
            )}) for payment of ₹${amountInr.toLocaleString('en-IN')}.`
          );
        }

        const passed = reasons.length === 0;
        return {
          riskAssessment: {
            riskLevel: !passed
              ? 'critical'
              : amountInr > singleLimit * 0.7
              ? 'medium'
              : 'low',
            affordabilityConcern: !passed,
            policyCompliant: passed,
          },
          validationObservations: [
            `Evaluated payment of ₹${amountInr.toLocaleString('en-IN')} to "${
              input.recipientName || 'Recipient'
            }" against single-tx cap (₹${singleLimit.toLocaleString(
              'en-IN'
            )}) and daily cap (₹${dailyLimit.toLocaleString('en-IN')}).`,
            'Deterministic backend enforcement required: explicit user approval, Argon2id PIN verification, and PayPal Sandbox order verification.',
          ],
          approvalRecommendation: {
            recommendedForUserConfirmation: passed,
            requiresExplicitUserApproval: true,
            requiresPinVerification: true,
            canAuthorizeOrExecutePayment: false,
          },
          reasonsForRejection: reasons,
        };
      }
    }
  }

  /**
   * Routes a natural language intent or workflow request to the appropriate primary agent
   * and coordinates required supporting agents (always including Financial Guardian when
   * affordability or payment actions are involved).
   */
  routeIntent(prompt: string): {
    primaryAgent: AuraAgentId;
    supportingAgents: AuraAgentId[];
    workflowType:
      | 'purchase_evaluation'
      | 'monthly_planning'
      | 'unusual_spending'
      | 'upcoming_commitments'
      | 'paypal_payment'
      | 'financial_recovery'
      | 'general_analytics';
  } {
    const q = prompt.toLowerCase();

    if (
      q.includes('prepare a payment') ||
      q.includes('pay ₹') ||
      q.includes('pay inr') ||
      q.includes('send money') ||
      q.includes('paypal')
    ) {
      return {
        primaryAgent: 'financial-guardian',
        supportingAgents: ['financial-planner', 'transaction-intelligence'],
        workflowType: 'paypal_payment',
      };
    }

    if (
      q.includes('afford') ||
      q.includes('buy a') ||
      q.includes('laptop') ||
      q.includes('phone') ||
      q.includes('compare products') ||
      q.includes('purchase')
    ) {
      return {
        primaryAgent: 'purchase-intelligence',
        supportingAgents: ['financial-planner', 'transaction-intelligence', 'financial-guardian'],
        workflowType: 'purchase_evaluation',
      };
    }

    if (
      q.includes('overspent') ||
      q.includes('overspending') ||
      q.includes('recover') ||
      q.includes('overrun') ||
      q.includes('exceeded budget')
    ) {
      return {
        primaryAgent: 'financial-recovery',
        supportingAgents: ['financial-planner', 'mandate-intelligence', 'financial-guardian'],
        workflowType: 'financial_recovery',
      };
    }

    if (
      q.includes('plan for next month') ||
      q.includes('financial plan') ||
      q.includes('create my plan') ||
      q.includes('allocate my income') ||
      q.includes('budget plan')
    ) {
      return {
        primaryAgent: 'financial-planner',
        supportingAgents: ['mandate-intelligence', 'transaction-intelligence', 'financial-guardian'],
        workflowType: 'monthly_planning',
      };
    }

    if (
      q.includes('coming up') ||
      q.includes('next week') ||
      q.includes('due date') ||
      q.includes('upcoming payment') ||
      q.includes('mandate') ||
      q.includes('subscription') ||
      q.includes('calendar')
    ) {
      return {
        primaryAgent: 'mandate-intelligence',
        supportingAgents: ['financial-planner'],
        workflowType: 'upcoming_commitments',
      };
    }

    if (q.includes('unusual') || q.includes('anomaly') || q.includes('spike')) {
      return {
        primaryAgent: 'transaction-intelligence',
        supportingAgents: ['financial-planner'],
        workflowType: 'unusual_spending',
      };
    }

    return {
      primaryAgent: 'transaction-intelligence',
      supportingAgents: ['financial-planner', 'financial-guardian'],
      workflowType: 'general_analytics',
    };
  }

  /**
   * Coordinates a multi-agent workflow across the primary and supporting Astropods agents,
   * invoking each agent with sanitized task-specific financial context and recording
   * genuine execution traces.
   */
  async executeCoordinatedWorkflow(params: {
    prompt: string;
    primaryAgent: AuraAgentId;
    supportingAgents: AuraAgentId[];
    contextSummary: Record<string, any>;
    agentPayloads?: Partial<Record<AuraAgentId, Record<string, any>>>;
    guardianCheck?: {
      approved: boolean;
      requiresExplicitUserConfirmation: boolean;
      requiresPin: boolean;
      policyNotes: string[];
    };
  }): Promise<OrchestratedWorkflowResult> {
    const startTime = Date.now();
    const workflowId = `astro-wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const correlationId = `astro-corr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const steps: AgentExecutionStep[] = [];

    const allAgents: AuraAgentId[] = [
      params.primaryAgent,
      ...params.supportingAgents.filter((a) => a !== params.primaryAgent),
    ];

    let primaryAgentOutput: Record<string, any> | undefined;
    let guardianAgentOutput: Record<string, any> | undefined;

    for (const agentId of allAgents) {
      const def = AURA_AGENTS[agentId];
      const inputPayload = this.buildDefaultPayloadForAgent(
        agentId,
        params.contextSummary,
        params.agentPayloads?.[agentId],
        params.prompt
      );

      const invocation = await this.invokeAgent({
        agentId,
        task: params.prompt || `Execute ${def.role}`,
        input: inputPayload,
        correlationId: `${correlationId}-${agentId}`,
      });

      if (agentId === params.primaryAgent) {
        primaryAgentOutput = invocation.output;
      }
      if (agentId === 'financial-guardian') {
        guardianAgentOutput = invocation.output;
      }

      let summary = `Executed ${def.role} (${
        invocation.remoteExecuted ? invocation.transport : 'verified_backend_fallback'
      }).`;
      if (agentId === 'purchase-intelligence') {
        summary = `Evaluated purchase intent against ${
          params.contextSummary.productCount ?? 0
        } Channel3 items and discretionary budget (INR ${
          params.contextSummary.discretionaryRemaining ?? 0
        }). Verdict: ${invocation.output?.affordabilityAssessment?.verdict || 'Evaluated'}.`;
      } else if (agentId === 'financial-planner') {
        summary = `Generated financial plan on monthly income (INR ${
          params.contextSummary.monthlyIncome ?? 0
        }) and commitments (INR ${params.contextSummary.totalCommitments ?? 0}).`;
      } else if (agentId === 'transaction-intelligence') {
        summary = `Analysed ${
          params.contextSummary.transactionCount ?? 0
        } authorised transactions and ${
          params.contextSummary.unusualCount ?? 0
        } flagged anomalies.`;
      } else if (agentId === 'mandate-intelligence') {
        summary = `Evaluated ${
          params.contextSummary.mandateCount ?? 0
        } recurring commitments and synchronised with Bryntum Financial Calendar.`;
      } else if (agentId === 'financial-recovery') {
        summary = `Computed empathetic recovery plan while protecting essential commitments.`;
      } else if (agentId === 'financial-guardian') {
        summary = `Financial Guardian risk check (${
          invocation.output?.riskAssessment?.riskLevel || 'low'
        } risk): no automatic payment execution permitted; explicit approval & PIN gate active.`;
      }

      steps.push({
        agentId,
        blueprintName: def.blueprintName,
        agentName: def.name,
        action: def.allowedTools[0] || 'evaluate_context',
        summary,
        durationMs: invocation.durationMs,
        timestamp: new Date().toISOString(),
        correlationId: invocation.correlationId,
        transport: invocation.transport,
        remoteExecuted: invocation.remoteExecuted,
        deploymentId: invocation.deploymentId,
        conversationId: invocation.conversationId,
        validationPassed: invocation.validationPassed,
        structuredOutput: invocation.output,
        errorReason: invocation.errorReason,
      });
    }

    const cloudSteps = steps.filter((s) => s.transport === 'astropods_cloud_api').length;
    const adapterSteps = steps.filter((s) => s.transport === 'astropods_web_adapter').length;
    const remoteExecutionCount = cloudSteps + adapterSteps;

    let executionMode:
      | 'astropods_cloud_deployment'
      | 'astropods_web_adapter'
      | 'astropods_local_orchestrator' = 'astropods_local_orchestrator';
    if (cloudSteps > 0) {
      executionMode = 'astropods_cloud_deployment';
    } else if (adapterSteps > 0) {
      executionMode = 'astropods_web_adapter';
    }

    const result: OrchestratedWorkflowResult = {
      workflowId,
      correlationId,
      primaryAgent: params.primaryAgent,
      participatingAgents: allAgents,
      executionMode,
      remoteExecutionCount,
      steps,
      primaryAgentOutput,
      guardianVerdict: params.guardianCheck || {
        approved:
          guardianAgentOutput?.approvalRecommendation?.recommendedForUserConfirmation ?? true,
        requiresExplicitUserConfirmation: true,
        requiresPin: true,
        riskLevel: guardianAgentOutput?.riskAssessment?.riskLevel || 'low',
        reasonsForRejection: guardianAgentOutput?.reasonsForRejection || [],
        policyNotes: [
          'Astropods agents are strictly advisory; Render backend deterministically enforces Argon2id PIN, approval token, and PayPal Sandbox verification.',
        ],
      },
    };

    this.executionHistory.unshift(result);
    if (this.executionHistory.length > 50) {
      this.executionHistory.pop();
    }

    logger.info(
      'AstropodsIntegration',
      `Completed workflow ${workflowId} (${executionMode}) in ${Date.now() - startTime}ms`,
      {
        primaryAgent: params.primaryAgent,
        agentCount: allAgents.length,
        remoteExecutionCount,
      }
    );

    return result;
  }

  private buildDefaultPayloadForAgent(
    agentId: AuraAgentId,
    contextSummary: Record<string, any>,
    explicitPayload?: Record<string, any>,
    prompt?: string
  ): Record<string, any> {
    if (explicitPayload) return explicitPayload;

    const monthlyIncome = Number(contextSummary.monthlyIncome || 85000);
    const totalCommitments = Number(contextSummary.totalCommitments || 31398);
    const discretionaryRemaining = Number(contextSummary.discretionaryRemaining || 18000);

    switch (agentId) {
      case 'financial-planner':
        return {
          monthlyIncome,
          totalCommitments,
          expenses: contextSummary.expenses || [],
          financialGoals: contextSummary.financialGoals || [],
          upcomingCommitments: contextSummary.upcomingCommitments || [],
        };
      case 'transaction-intelligence':
        return {
          monthlyIncome,
          transactions: contextSummary.transactions || [],
        };
      case 'mandate-intelligence':
        return {
          mandates: contextSummary.mandates || [],
          transactions: contextSummary.transactions || [],
        };
      case 'financial-recovery':
        return {
          monthlyIncome,
          totalCommitments,
          allocations: contextSummary.allocations || [],
          upcomingCommitments: contextSummary.upcomingCommitments || [],
          goals: contextSummary.financialGoals || [],
        };
      case 'purchase-intelligence':
        return {
          query: prompt || 'Purchase evaluation',
          monthlyIncomeInr: monthlyIncome,
          availableDiscretionaryBudgetInr: discretionaryRemaining,
          upcomingCommitmentsInr: totalCommitments,
          products: contextSummary.products || [],
        };
      case 'financial-guardian':
        return {
          actionType: contextSummary.actionType || 'financial_review',
          amountInr: Number(contextSummary.amountInr || 5000),
          recipientName: String(contextSummary.recipientName || 'Merchant'),
          merchantCategory: String(contextSummary.merchantCategory || 'General'),
          accountBalanceInr: Number(contextSummary.liquidBalanceInr ?? 85000),
          spentTodayInr: Number(contextSummary.spentTodayInr || 0),
          policy: contextSummary.policy || {
            singleTransactionLimit: 25000,
            dailySpendingLimit: 50000,
            blockedCategories: [],
          },
        };
    }
  }
}

export const astropodsIntegration = new AstropodsOrchestrationService();
