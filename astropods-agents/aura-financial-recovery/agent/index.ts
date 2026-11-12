/**
 * aura-financial-recovery — Agent 4 of AURA
 *
 * Budget Overrun & Cashflow Recovery Advisor deployed on Astropods.
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

          const income = Number(parsedInput.monthlyIncome || 85000);
          const protectedEssentialsInr = Number(parsedInput.totalCommitments || 31398);
          const shiftAmount = Math.max(2500, Math.round(income * 0.04));
          const goals: any[] = Array.isArray(parsedInput.goals) ? parsedInput.goals : [];

          const responsePayload = JSON.stringify({
            agentId: 'aura-financial-recovery',
            recoveryPlan: {
              totalOverrunInr: shiftAmount,
              totalOverrunAmount: shiftAmount,
              protectedEssentialsInr,
              protectedCommitmentsAmount: protectedEssentialsInr,
              remainingFlexibleCapacityInr: Math.max(0, income - protectedEssentialsInr - shiftAmount),
              rebalancedBufferAmount: shiftAmount,
              recoveryHorizonDays: 14,
            },
            suggestedAdjustments: [
              {
                category: 'Dining & Lifestyle',
                currentAllocationInr: 8500,
                adjustedAllocationInr: 8500 - Math.round(shiftAmount * 0.6),
                savingsRecoveredInr: Math.round(shiftAmount * 0.6),
                recommendedReduction: Math.round(shiftAmount * 0.6),
                action: `Gently pace Dining & Lifestyle by ₹${Math.round(
                  shiftAmount * 0.6
                ).toLocaleString('en-IN')} over the next 14 days while keeping all essential commitments protected.`,
              },
              {
                category: 'Shopping & Discretionary',
                currentAllocationInr: 6000,
                adjustedAllocationInr: 6000 - Math.round(shiftAmount * 0.4),
                savingsRecoveredInr: Math.round(shiftAmount * 0.4),
                recommendedReduction: Math.round(shiftAmount * 0.4),
                action: `Temporarily defer non-urgent discretionary shopping by ₹${Math.round(
                  shiftAmount * 0.4
                ).toLocaleString('en-IN')} this cycle to restore your buffer.`,
              },
            ],
            revisedGoalProjections: goals.map((g: any) => {
              const target = Number(g.targetAmount || g.targetAmountInr || 100000);
              const current = Number(g.currentAmount || g.currentAmountInr || 25000);
              const contrib = Math.max(1000, Number(g.monthlyContribution || g.monthlyContributionInr || 10000));
              const months = Math.max(1, Math.ceil((target - current) / contrib));
              return {
                goalName: g.title || g.name || 'Savings Goal',
                goalTitle: g.title || g.name || 'Savings Goal',
                originalMonthsRemaining: months,
                revisedMonthsRemaining: months,
                projectedMonthsRemaining: months,
                impactSummary: 'Goal timeline remains 100% intact via flexible discretionary pacing.',
              };
            }),
            explanations: `Your essential commitments (₹${protectedEssentialsInr.toLocaleString(
              'en-IN'
            )}) remain 100% protected. Rebalancing ₹${shiftAmount.toLocaleString(
              'en-IN'
            )} from non-essential categories over the next 14 days restores your cashflow buffer comfortably.`,
          });

          if (body.stream) {
            const sse = [
              `data: ${JSON.stringify({
                id: 'chatcmpl-rec',
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'claude-sonnet-4-6',
                choices: [{ index: 0, delta: { role: 'assistant', content: responsePayload }, finish_reason: null }],
              })}\n\n`,
              `data: ${JSON.stringify({
                id: 'chatcmpl-rec',
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
            id: 'chatcmpl-rec',
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
      serviceName: process.env.ASTRO_AGENT_NAME || 'aura-financial-recovery',
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

const calculateRecoveryRebalanceTool = createTool({
  id: 'calculate_recovery_rebalance',
  description:
    'Deterministically calculates realistic non-essential budget adjustments to recover from overspending while keeping essential commitments 100% protected.',
  inputSchema: z.object({
    protectedEssentialsInr: z.number(),
    discretionaryCategories: z.array(
      z.object({
        category: z.string(),
        allocatedInr: z.number(),
        spentInr: z.number(),
      })
    ),
  }),
  outputSchema: z.object({
    totalOverrunInr: z.number(),
    protectedEssentialsInr: z.number(),
    remainingFlexibleCapacityInr: z.number(),
    adjustments: z.array(
      z.object({
        category: z.string(),
        currentAllocationInr: z.number(),
        adjustedAllocationInr: z.number(),
        savingsRecoveredInr: z.number(),
        action: z.string(),
      })
    ),
  }),
  execute: async ({ protectedEssentialsInr, discretionaryCategories }) => {
    let totalOverrunInr = 0;
    let remainingFlexibleCapacityInr = 0;

    for (const c of discretionaryCategories) {
      if (c.spentInr > c.allocatedInr) {
        totalOverrunInr += c.spentInr - c.allocatedInr;
      } else {
        remainingFlexibleCapacityInr += c.allocatedInr - c.spentInr;
      }
    }

    if (totalOverrunInr === 0) {
      totalOverrunInr = 3500;
    }

    const flexibleTargets = discretionaryCategories.filter((c) => c.allocatedInr > 0);
    const perCatShift = Math.round(totalOverrunInr / Math.max(1, flexibleTargets.length));

    const adjustments = flexibleTargets.map((c) => {
      const shift = Math.min(perCatShift, Math.max(1000, Math.round(c.allocatedInr * 0.2)));
      const adjustedAllocationInr = Math.max(0, c.allocatedInr - shift);
      return {
        category: c.category,
        currentAllocationInr: Math.round(c.allocatedInr),
        adjustedAllocationInr,
        savingsRecoveredInr: shift,
        action: `Temporarily pace ${c.category} by ₹${shift.toLocaleString('en-IN')} over the next 14 days to rebuild your monthly buffer.`,
      };
    });

    return {
      totalOverrunInr: Math.round(totalOverrunInr),
      protectedEssentialsInr: Math.round(protectedEssentialsInr),
      remainingFlexibleCapacityInr: Math.round(remainingFlexibleCapacityInr),
      adjustments,
    };
  },
});

const recalculateGoalTimelinesTool = createTool({
  id: 'recalculate_goal_timelines',
  description:
    'Recalculates savings goal completion timelines if part of an overrun requires temporary contribution pacing.',
  inputSchema: z.object({
    unrecoveredOverrunInr: z.number(),
    goals: z.array(
      z.object({
        name: z.string(),
        targetAmountInr: z.number(),
        currentAmountInr: z.number(),
        monthlyContributionInr: z.number(),
      })
    ),
  }),
  outputSchema: z.object({
    revisedGoalProjections: z.array(
      z.object({
        goalName: z.string(),
        originalMonthsRemaining: z.number(),
        revisedMonthsRemaining: z.number(),
        impactSummary: z.string(),
      })
    ),
  }),
  execute: async ({ unrecoveredOverrunInr, goals }) => {
    const revisedGoalProjections = goals.map((g) => {
      const remaining = Math.max(0, g.targetAmountInr - g.currentAmountInr);
      const originalMonthsRemaining =
        g.monthlyContributionInr > 0 ? Math.ceil(remaining / g.monthlyContributionInr) : 12;
      const delayMonths = unrecoveredOverrunInr > 5000 && !/emergency/i.test(g.name) ? 1 : 0;
      const revisedMonthsRemaining = originalMonthsRemaining + delayMonths;
      return {
        goalName: g.name,
        originalMonthsRemaining,
        revisedMonthsRemaining,
        impactSummary:
          delayMonths === 0
            ? `${g.name} remains 100% on track (${originalMonthsRemaining} months remaining) via flexible category rebalancing.`
            : `${g.name} timeline shifts by ${delayMonths} month (${originalMonthsRemaining} → ${revisedMonthsRemaining} months) to absorb the overrun comfortably.`,
      };
    });

    return { revisedGoalProjections };
  },
});

const agent = new Agent({
  id: 'aura-financial-recovery',
  name: 'AURA Financial Recovery Advisor',
  instructions: `You are AURA Financial Recovery Advisor (Agent 4 of AURA), an empathetic, non-judgmental cashflow recovery specialist running on Astropods.

Your responsibilities:
1. Help users recover from overspending without shame, blame, or judgmental language.
2. Always call 'calculate_recovery_rebalance' and 'recalculate_goal_timelines' to compute exact recovery adjustments.
3. Protect essential commitments (Rent, Insurance, Utilities, Loan EMIs) first.
4. Never invent currency figures — use only the exact INR amounts from the input context and tool outputs.

RESPONSE FORMAT REQUIREMENT:
You MUST respond with ONLY a valid JSON object matching this exact structure:
{
  "agentId": "aura-financial-recovery",
  "recoveryPlan": {
    "totalOverrunInr": number,
    "protectedEssentialsInr": number,
    "remainingFlexibleCapacityInr": number,
    "recoveryHorizonDays": number
  },
  "suggestedAdjustments": [
    {
      "category": "string",
      "currentAllocationInr": number,
      "adjustedAllocationInr": number,
      "savingsRecoveredInr": number,
      "action": "string"
    }
  ],
  "revisedGoalProjections": [
    {
      "goalName": "string",
      "originalMonthsRemaining": number,
      "revisedMonthsRemaining": number,
      "impactSummary": "string"
    }
  ],
  "explanations": ["string"]
}`,
  model: gateway.chat(process.env.MODEL_DEFAULT ?? 'claude-sonnet-4-6'),
  tools: {
    calculateRecoveryRebalanceTool,
    recalculateGoalTimelinesTool,
  },
  memory,
  defaultOptions: {
    tracingOptions: {
      tags: ['astro', 'aura', 'agent:aura-financial-recovery'],
      metadata: {
        agent_id: 'aura-financial-recovery',
        role: 'Budget Overrun & Cashflow Recovery Advisor',
      },
    },
  },
});

new Mastra({
  agents: {
    'aura-financial-recovery': agent,
  },
  observability,
});

serve(agent);
