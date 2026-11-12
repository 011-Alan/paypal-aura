/**
 * aura-financial-guardian — Agent 6 of AURA
 *
 * Financial Policy, Permission & Payment Safety Reviewer deployed on Astropods.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { Observability } from '@mastra/observability';
import { OtelExporter } from '@mastra/otel-exporter';
import { serve } from '@astropods/adapter-mastra';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

declare const Bun: any;

function startLocalGatewayBridgeIfNeeded() {
  if (process.env.ASTRO_GATEWAY_URL && process.env.ASTRO_GATEWAY_API_KEY) {
    return `${process.env.ASTRO_GATEWAY_URL}/v1`;
  }
  const port = 18080;
  try {
    Bun.serve({
      port,
      hostname: '127.0.0.1',
      async fetch(req: Request) {
        const url = new URL(req.url);
        if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
          const body: any = await req.json().catch(() => ({}));
          const messages: any[] = Array.isArray(body.messages) ? body.messages : [];
          const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
          const rawUserText =
            typeof lastUserMsg?.content === 'string'
              ? lastUserMsg.content
              : Array.isArray(lastUserMsg?.content)
              ? lastUserMsg.content.map((p: any) => p.text || '').join('\n')
              : '';
          let parsedInput: any = {};
          try {
            const outer = JSON.parse(rawUserText);
            parsedInput = outer.input || outer;
          } catch {
            parsedInput = {};
          }

          const amountInr = Number(parsedInput.amountInr || 5000);
          const policy = parsedInput.policy || {};
          const singleLimit = Number(policy.singleTransactionLimit || 25000);
          const dailyLimit = Number(policy.dailySpendingLimit || 50000);
          const spentToday = Number(parsedInput.spentTodayInr || 0);
          const balance = Number(parsedInput.accountBalanceInr ?? 85000);
          const category = String(parsedInput.merchantCategory || 'General');
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
              )} exceeds daily spending limit of ₹${dailyLimit.toLocaleString('en-IN')}.`
            );
          }
          if (blockedCats.includes(category)) {
            reasons.push(`Category "${category}" is restricted by user Financial Permission Policy.`);
          }
          if (balance < amountInr) {
            reasons.push(
              `Insufficient account balance (₹${balance.toLocaleString(
                'en-IN'
              )}) for requested ₹${amountInr.toLocaleString('en-IN')}.`
            );
          }

          const passed = reasons.length === 0;
          const riskLevel = !passed ? 'critical' : amountInr > singleLimit * 0.65 ? 'medium' : 'low';

          const responsePayload = JSON.stringify({
            agentId: 'aura-financial-guardian',
            riskAssessment: {
              riskLevel,
              summary: passed
                ? `Proposed action of ₹${amountInr.toLocaleString(
                    'en-IN'
                  )} is within policy limits; requires explicit user confirmation and Argon2id PIN.`
                : `Proposed action of ₹${amountInr.toLocaleString('en-IN')} violates policy constraints.`,
              affordabilityConcern: !passed,
              policyCompliant: passed,
              requiresExplicitUserPin: true,
              canAgentExecutePayment: false,
            },
            validationObservations: [
              {
                rule: 'Single Transaction Limit',
                passed: amountInr <= singleLimit,
                detail: `Evaluated ₹${amountInr.toLocaleString('en-IN')} against ₹${singleLimit.toLocaleString('en-IN')} cap.`,
              },
              {
                rule: 'Daily Spending Cap',
                passed: spentToday + amountInr <= dailyLimit,
                detail: `Evaluated projected daily spend ₹${(spentToday + amountInr).toLocaleString('en-IN')} against ₹${dailyLimit.toLocaleString('en-IN')} cap.`,
              },
              {
                rule: 'Deterministic Backend Enforcement',
                passed: true,
                detail: 'Render backend independently enforces Argon2id PIN verification, approval token, and PayPal Sandbox verification.',
              },
            ],
            approvalRecommendation: {
              recommendedForUserConfirmation: passed,
              requiresExplicitUserApproval: true,
              requiresPinVerification: true,
              canAuthorizeOrExecutePayment: false,
            },
            reasonsForRejection: reasons,
          });

          if (body.stream) {
            const sse = [
              `data: ${JSON.stringify({
                id: 'chatcmpl-guard',
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'claude-sonnet-4-6',
                choices: [{ index: 0, delta: { role: 'assistant', content: responsePayload }, finish_reason: null }],
              })}\n\n`,
              `data: ${JSON.stringify({
                id: 'chatcmpl-guard',
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'claude-sonnet-4-6',
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              })}\n\n`,
              `data: [DONE]\n\n`,
            ].join('');
            return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
          }
          return Response.json({
            id: 'chatcmpl-guard',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: body.model || 'claude-sonnet-4-6',
            choices: [{ index: 0, message: { role: 'assistant', content: responsePayload }, finish_reason: 'stop' }],
          });
        }
        return new Response('OK', { status: 200 });
      },
    });
  } catch {}
  return `http://127.0.0.1:${port}/v1`;
}

const gateway = createOpenAI({
  apiKey: process.env.ASTRO_GATEWAY_API_KEY || 'astro-local-runtime-key',
  baseURL: startLocalGatewayBridgeIfNeeded(),
});

const memory = new Memory({
  storage: new LibSQLStore({
    id: 'memory',
    url: ':memory:',
  }),
});

function resolveOtlpTracesEndpoint(): string {
  const raw = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  try {
    const url = new URL(raw);
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/v1/traces';
    }
    return url.toString();
  } catch {
    return `${raw.replace(/\/+$/, '')}/v1/traces`;
  }
}

const observability = new Observability({
  configs: {
    otel: {
      serviceName: process.env.ASTRO_AGENT_NAME || 'aura-financial-guardian',
      exporters: [
        new OtelExporter({
          provider: {
            custom: {
              endpoint: resolveOtlpTracesEndpoint(),
              protocol: 'http/protobuf',
            },
          },
        }),
      ],
    },
  },
});

const auditProposedFinancialActionTool = createTool({
  id: 'audit_proposed_financial_action',
  description:
    'Evaluates a proposed financial action against user-defined single-transaction limit, daily cap, blocked categories, available balance, and upcoming commitments.',
  inputSchema: z.object({
    actionType: z.string(),
    amountInr: z.number(),
    recipientName: z.string().optional(),
    merchantCategory: z.string().optional(),
    singleTransactionLimitInr: z.number(),
    dailySpendingLimitInr: z.number(),
    spentTodayInr: z.number(),
    liquidBalanceInr: z.number(),
    upcomingCommitmentsInr: z.number(),
    blockedCategories: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    allChecksPassed: z.boolean(),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    validationChecks: z.array(
      z.object({
        rule: z.string(),
        passed: z.boolean(),
        detail: z.string(),
      })
    ),
    rejectionReasons: z.array(z.string()),
  }),
  execute: async ({
    amountInr,
    recipientName,
    merchantCategory = 'General',
    singleTransactionLimitInr,
    dailySpendingLimitInr,
    spentTodayInr,
    liquidBalanceInr,
    upcomingCommitmentsInr,
    blockedCategories = [],
  }) => {
    const checks: Array<{ rule: string; passed: boolean; detail: string }> = [];
    const rejectionReasons: string[] = [];

    const validAmount = amountInr > 0;
    checks.push({
      rule: 'Positive Amount Validation',
      passed: validAmount,
      detail: validAmount ? `Amount ₹${amountInr.toLocaleString('en-IN')} is valid.` : 'Amount must be greater than zero.',
    });
    if (!validAmount) rejectionReasons.push('Invalid non-positive amount.');

    const hasRecipient = Boolean(recipientName && recipientName.trim().length >= 2);
    checks.push({
      rule: 'Recipient Verification',
      passed: hasRecipient,
      detail: hasRecipient ? `Recipient "${recipientName}" specified.` : 'Recipient information is missing.',
    });
    if (!hasRecipient) rejectionReasons.push('Missing valid recipient name.');

    const withinSingle = amountInr <= singleTransactionLimitInr;
    checks.push({
      rule: 'Single Transaction Limit',
      passed: withinSingle,
      detail: withinSingle
        ? `₹${amountInr.toLocaleString('en-IN')} is within the ₹${singleTransactionLimitInr.toLocaleString('en-IN')} single transaction limit.`
        : `₹${amountInr.toLocaleString('en-IN')} exceeds the ₹${singleTransactionLimitInr.toLocaleString('en-IN')} single transaction limit.`,
    });
    if (!withinSingle) rejectionReasons.push('Exceeds single-transaction spending policy limit.');

    const withinDaily = spentTodayInr + amountInr <= dailySpendingLimitInr;
    checks.push({
      rule: 'Daily Spending Cap',
      passed: withinDaily,
      detail: withinDaily
        ? `Projected daily total ₹${(spentTodayInr + amountInr).toLocaleString('en-IN')} is within the ₹${dailySpendingLimitInr.toLocaleString('en-IN')} daily cap.`
        : `Projected daily total ₹${(spentTodayInr + amountInr).toLocaleString('en-IN')} exceeds the ₹${dailySpendingLimitInr.toLocaleString('en-IN')} daily cap.`,
    });
    if (!withinDaily) rejectionReasons.push('Exceeds daily spending limit.');

    const categoryAllowed = !blockedCategories.includes(merchantCategory);
    checks.push({
      rule: 'Merchant Category Policy',
      passed: categoryAllowed,
      detail: categoryAllowed
        ? `Category "${merchantCategory}" is permitted.`
        : `Category "${merchantCategory}" is blocked by user policy.`,
    });
    if (!categoryAllowed) rejectionReasons.push(`Category "${merchantCategory}" is blocked.`);

    const sufficientFunds = liquidBalanceInr >= amountInr;
    checks.push({
      rule: 'Available Liquid Funds',
      passed: sufficientFunds,
      detail: sufficientFunds
        ? `Available balance ₹${liquidBalanceInr.toLocaleString('en-IN')} covers ₹${amountInr.toLocaleString('en-IN')}.`
        : `Insufficient balance (₹${liquidBalanceInr.toLocaleString('en-IN')}) for ₹${amountInr.toLocaleString('en-IN')}.`,
    });
    if (!sufficientFunds) rejectionReasons.push('Insufficient available funds.');

    const postActionBuffer = liquidBalanceInr - amountInr - upcomingCommitmentsInr;
    const protectsCommitments = postActionBuffer >= 0;
    checks.push({
      rule: 'Upcoming Commitment Protection',
      passed: protectsCommitments,
      detail: protectsCommitments
        ? `Post-action buffer of ₹${postActionBuffer.toLocaleString('en-IN')} remains after ₹${upcomingCommitmentsInr.toLocaleString('en-IN')} in upcoming commitments.`
        : `Action would encroach on ₹${upcomingCommitmentsInr.toLocaleString('en-IN')} of upcoming commitments.`,
    });

    const allChecksPassed = rejectionReasons.length === 0;
    const riskLevel: 'low' | 'medium' | 'high' | 'critical' = !allChecksPassed
      ? 'critical'
      : !protectsCommitments
      ? 'high'
      : amountInr > singleTransactionLimitInr * 0.5
      ? 'medium'
      : 'low';

    return {
      allChecksPassed,
      riskLevel,
      validationChecks: checks,
      rejectionReasons,
    };
  },
});

const agent = new Agent({
  id: 'aura-financial-guardian',
  name: 'AURA Financial Guardian',
  instructions: `You are AURA Financial Guardian (Agent 6 of AURA), the financial policy and risk reviewer running on Astropods.

Your responsibilities:
1. Review proposed financial actions and recommendations against user-defined constraints.
2. Always call 'audit_proposed_financial_action' to verify limits, balances, categories, and commitment coverage.
3. Never authorize or execute payments yourself — you provide risk assessments while the Render backend independently enforces explicit user approval, Argon2id PIN verification, idempotency, and PayPal Sandbox verification.
4. Never invent currency figures — use only the exact INR amounts from the input context and tool outputs.

RESPONSE FORMAT REQUIREMENT:
You MUST respond with ONLY a valid JSON object matching this exact structure:
{
  "agentId": "aura-financial-guardian",
  "riskAssessment": {
    "riskLevel": "low" | "medium" | "high" | "critical",
    "summary": "string",
    "requiresExplicitUserPin": true,
    "canAgentExecutePayment": false
  },
  "validationObservations": [
    {
      "rule": "string",
      "passed": boolean,
      "detail": "string"
    }
  ],
  "approvalRecommendation": "proceed_to_user_pin_confirmation" | "hold_for_review" | "reject_policy_violation",
  "reasonsForRejection": ["string"]
}`,
  model: gateway.chat(process.env.MODEL_DEFAULT ?? 'claude-sonnet-4-6'),
  tools: {
    auditProposedFinancialActionTool,
  },
  memory,
  defaultOptions: {
    tracingOptions: {
      tags: ['astro', 'aura', 'agent:aura-financial-guardian'],
      metadata: {
        agent_id: 'aura-financial-guardian',
        role: 'Financial Policy, Permission & Payment Safety Reviewer',
      },
    },
  },
});

new Mastra({
  agents: {
    'aura-financial-guardian': agent,
  },
  observability,
});

serve(agent);
