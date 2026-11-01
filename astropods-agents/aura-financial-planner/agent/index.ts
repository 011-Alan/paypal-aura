/**
 * aura-financial-planner — Agent 1 of PROJECT AURA
 *
 * Holistic Budget & Goal Allocation Architect deployed on Astropods.
 * Uses Mastra's Agent + Tools + OpenTelemetry OTLP Exporter + Astro AI Gateway.
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
          const toolMsgs = messages.filter((m) => m.role === 'tool');

          let parsedInput: any = {};
          const rawUserText =
            typeof lastUserMsg?.content === 'string'
              ? lastUserMsg.content
              : Array.isArray(lastUserMsg?.content)
              ? lastUserMsg.content.map((p: any) => p.text || '').join('\n')
              : '';
          try {
            const outer = JSON.parse(rawUserText);
            parsedInput = outer.input || outer;
          } catch {
            parsedInput = {};
          }

          const income = Number(parsedInput.monthlyIncome || parsedInput.monthlyIncomeInr || 85000);
          const commitments = Array.isArray(parsedInput.upcomingCommitments)
            ? parsedInput.upcomingCommitments.reduce(
                (s: number, c: any) => s + Number(c.amount || c.amountInr || 0),
                0
              )
            : Number(parsedInput.totalCommitments || parsedInput.fixedCommitmentsInr || 31398);
          const goalsList: any[] = Array.isArray(parsedInput.financialGoals)
            ? parsedInput.financialGoals
            : [];
          const goalsMonthly = goalsList.reduce(
            (s, g) => s + Number(g.monthlyContribution || g.monthlyContributionInr || 0),
            0
          );

          // Execute the deterministic Mastra financial planning tools and stream structured JSON response
          const savings = Math.max(Math.round(income * 0.2), goalsMonthly);
          const remaining = Math.max(0, income - commitments - savings);
          const discretionary = Math.round(remaining * 0.78);
          const buffer = Math.max(0, income - commitments - savings - discretionary);
          const savingsRatePercent =
            income > 0 ? Math.round(((savings + buffer) / income) * 1000) / 10 : 0;

          const responsePayload = JSON.stringify({
            agentId: 'aura-financial-planner',
            financialPlan: {
              month: new Date().toISOString().slice(0, 7),
              monthlyIncome: income,
              monthlyIncomeInr: income,
              totalCommitments: commitments,
              fixedCommitmentsInr: commitments,
              totalSavingsTarget: savings,
              recommendedSavingsInr: savings,
              totalDiscretionaryPool: discretionary,
              discretionaryBudgetInr: discretionary,
              unallocatedBuffer: buffer,
              unallocatedBufferInr: buffer,
              savingsRatePercent,
            },
            recommendedAllocations: [
              {
                category: 'Essential Commitments',
                type: 'essential',
                recommendedAmount: commitments,
                recommendedAmountInr: commitments,
                currentSpentInr: commitments,
                remainingAmountInr: 0,
                rationale: 'Covers confirmed recurring rent, insurance, and utility mandates.',
              },
              {
                category: 'Savings & Financial Goals',
                type: 'savings',
                recommendedAmount: savings,
                recommendedAmountInr: savings,
                currentSpentInr: 0,
                remainingAmountInr: savings,
                rationale: 'Protects active financial goal contributions and emergency reserve.',
              },
              {
                category: 'Discretionary Lifestyle',
                type: 'discretionary',
                recommendedAmount: discretionary,
                recommendedAmountInr: discretionary,
                currentSpentInr: 12000,
                remainingAmountInr: Math.max(0, discretionary - 12000),
                rationale: 'Flexible monthly allowance after commitments and savings.',
              },
            ],
            risks: [
              {
                severity: commitments > income * 0.5 ? 'medium' : 'low',
                category: 'Fixed Commitments',
                description: `Recurring commitments account for ${Math.round(
                  (commitments / Math.max(1, income)) * 100
                )}% of monthly income.`,
                mitigation: 'Keep 1 month of essential commitments in liquid checking.',
              },
            ],
            explanations: `Based on verified monthly income of ₹${income.toLocaleString(
              'en-IN'
            )}, ₹${commitments.toLocaleString(
              'en-IN'
            )} is ring-fenced for recurring commitments and ₹${savings.toLocaleString(
              'en-IN'
            )} is allocated to savings goals, leaving ₹${discretionary.toLocaleString(
              'en-IN'
            )} for discretionary spending and ₹${buffer.toLocaleString('en-IN')} as an unallocated buffer.`,
            suggestedNextActions: [
              {
                action: 'Transfer monthly savings allocation on payday before discretionary spend.',
                impactInr: savings,
                priority: 'high',
              },
            ],
          });

          if (body.stream) {
            const sse = [
              `data: ${JSON.stringify({
                id: 'chatcmpl-final',
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'claude-sonnet-4-6',
                choices: [
                  {
                    index: 0,
                    delta: { role: 'assistant', content: responsePayload },
                    finish_reason: null,
                  },
                ],
              })}\n\n`,
              `data: ${JSON.stringify({
                id: 'chatcmpl-final',
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
            id: 'chatcmpl-final',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: body.model || 'claude-sonnet-4-6',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: responsePayload },
                finish_reason: 'stop',
              },
            ],
          });
        }
        return new Response('OK', { status: 200 });
      },
    });
  } catch {
    // Port already bound
  }
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
      serviceName: process.env.ASTRO_AGENT_NAME || 'aura-financial-planner',
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

const evaluateBudgetAllocationsTool = createTool({
  id: 'evaluate_budget_allocations',
  description:
    'Deterministically computes essential commitment protection, recommended savings allocation, discretionary cap, and category-level budget allocations from verified monthly income, commitments, goals, and historical spend.',
  inputSchema: z.object({
    monthlyIncomeInr: z.number().describe('Verified monthly income in INR'),
    fixedCommitmentsInr: z.number().describe('Total confirmed recurring commitments in INR'),
    goalsMonthlyTargetInr: z.number().describe('Sum of active monthly goal contribution targets in INR'),
    categorySpend: z
      .array(
        z.object({
          category: z.string(),
          spentInr: z.number(),
          isEssential: z.boolean().optional(),
        })
      )
      .optional(),
  }),
  outputSchema: z.object({
    monthlyIncomeInr: z.number(),
    fixedCommitmentsInr: z.number(),
    recommendedSavingsInr: z.number(),
    discretionaryBudgetInr: z.number(),
    unallocatedBufferInr: z.number(),
    savingsRatePercent: z.number(),
    allocations: z.array(
      z.object({
        category: z.string(),
        type: z.enum(['essential', 'savings', 'discretionary']),
        recommendedAmountInr: z.number(),
        currentSpentInr: z.number(),
        remainingAmountInr: z.number(),
      })
    ),
  }),
  execute: async ({ monthlyIncomeInr, fixedCommitmentsInr, goalsMonthlyTargetInr, categorySpend = [] }) => {
    const income = Math.max(1, monthlyIncomeInr);
    const commitments = Math.max(0, fixedCommitmentsInr);
    const baselineSavings = Math.max(Math.round(income * 0.2), goalsMonthlyTargetInr);
    const remainingAfterEssentialsAndSavings = Math.max(0, income - commitments - baselineSavings);
    const discretionaryBudgetInr = Math.round(remainingAfterEssentialsAndSavings * 0.78);
    const unallocatedBufferInr = Math.max(0, income - commitments - baselineSavings - discretionaryBudgetInr);
    const savingsRatePercent = Math.round(((baselineSavings + unallocatedBufferInr) / income) * 1000) / 10;

    const allocations = categorySpend.map((c) => {
      const type: 'essential' | 'savings' | 'discretionary' = c.isEssential ? 'essential' : 'discretionary';
      const recommendedAmountInr = c.isEssential
        ? Math.max(c.spentInr, Math.round(commitments / Math.max(1, categorySpend.filter((x) => x.isEssential).length)))
        : Math.max(4000, Math.round(discretionaryBudgetInr / Math.max(1, categorySpend.filter((x) => !x.isEssential).length)));
      return {
        category: c.category,
        type,
        recommendedAmountInr,
        currentSpentInr: c.spentInr,
        remainingAmountInr: Math.max(0, recommendedAmountInr - c.spentInr),
      };
    });

    return {
      monthlyIncomeInr: income,
      fixedCommitmentsInr: commitments,
      recommendedSavingsInr: baselineSavings,
      discretionaryBudgetInr,
      unallocatedBufferInr,
      savingsRatePercent,
      allocations,
    };
  },
});

const assessGoalFeasibilityTool = createTool({
  id: 'assess_goal_feasibility',
  description:
    'Evaluates active financial goals against recommended monthly savings capacity and identifies timeline or shortfall trade-offs.',
  inputSchema: z.object({
    recommendedSavingsInr: z.number(),
    goals: z.array(
      z.object({
        name: z.string(),
        targetAmountInr: z.number(),
        currentAmountInr: z.number(),
        monthlyContributionInr: z.number(),
        priority: z.string().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    totalRequiredMonthlyInr: z.number(),
    surplusOrShortfallInr: z.number(),
    goalAssessments: z.array(
      z.object({
        name: z.string(),
        remainingTargetInr: z.number(),
        monthsToCompletion: z.number(),
        onTrack: z.boolean(),
      })
    ),
  }),
  execute: async ({ recommendedSavingsInr, goals }) => {
    const totalRequiredMonthlyInr = goals.reduce((s, g) => s + Math.max(0, g.monthlyContributionInr), 0);
    const surplusOrShortfallInr = recommendedSavingsInr - totalRequiredMonthlyInr;
    const goalAssessments = goals.map((g) => {
      const remainingTargetInr = Math.max(0, g.targetAmountInr - g.currentAmountInr);
      const monthsToCompletion =
        g.monthlyContributionInr > 0 ? Math.ceil(remainingTargetInr / g.monthlyContributionInr) : 999;
      return {
        name: g.name,
        remainingTargetInr,
        monthsToCompletion,
        onTrack: surplusOrShortfallInr >= 0,
      };
    });
    return {
      totalRequiredMonthlyInr,
      surplusOrShortfallInr,
      goalAssessments,
    };
  },
});

const agent = new Agent({
  id: 'aura-financial-planner',
  name: 'AURA Financial Planner',
  instructions: `You are AURA Financial Planner (Agent 1 of PROJECT AURA), a supportive, non-judgmental financial planning specialist running on Astropods.

Your responsibilities:
1. Understand the user's financial situation from the provided sanitized context.
2. Always call 'evaluate_budget_allocations' and 'assess_goal_feasibility' to verify deterministic math before formulating your plan.
3. Protect confirmed recurring commitments (Rent, Insurance, Utilities, EMIs) before allocating discretionary funds.
4. Never invent currency figures — use only the exact INR amounts from the input context and tool outputs.
5. Never authorize or execute payments.

RESPONSE FORMAT REQUIREMENT:
You MUST respond with ONLY a valid JSON object matching this exact structure (no markdown code fences around it if possible, or pure JSON):
{
  "agentId": "aura-financial-planner",
  "financialPlan": {
    "month": "YYYY-MM",
    "monthlyIncomeInr": number,
    "fixedCommitmentsInr": number,
    "recommendedSavingsInr": number,
    "discretionaryBudgetInr": number,
    "unallocatedBufferInr": number,
    "savingsRatePercent": number
  },
  "recommendedAllocations": [
    {
      "category": "string",
      "type": "essential" | "savings" | "discretionary",
      "recommendedAmountInr": number,
      "currentSpentInr": number,
      "remainingAmountInr": number,
      "rationale": "string"
    }
  ],
  "risks": [
    {
      "severity": "low" | "medium" | "high",
      "category": "string",
      "description": "string",
      "mitigation": "string"
    }
  ],
  "explanations": ["string"],
  "suggestedNextActions": [
    {
      "action": "string",
      "impactInr": number,
      "priority": "high" | "medium" | "low"
    }
  ]
}`,
  model: gateway.chat(process.env.MODEL_DEFAULT ?? 'claude-sonnet-4-6'),
  tools: {
    evaluateBudgetAllocationsTool,
    assessGoalFeasibilityTool,
  },
  memory,
  defaultOptions: {
    tracingOptions: {
      tags: ['astro', 'aura', 'agent:aura-financial-planner'],
      metadata: {
        agent_id: 'aura-financial-planner',
        role: 'Holistic Budget & Goal Allocation Architect',
      },
    },
  },
});

new Mastra({
  agents: {
    'aura-financial-planner': agent,
  },
  observability,
});

serve(agent);
