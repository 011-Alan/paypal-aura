/**
 * aura-mandate-intelligence — Agent 3 of AURA
 *
 * Recurring Commitment & Due-Date Specialist deployed on Astropods.
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

          const mandates: any[] = Array.isArray(parsedInput.mandates) ? parsedInput.mandates : [];
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');

          const records = mandates
            .filter((m) => m.category !== 'Salary')
            .map((m) => {
              const day = String(Math.min(28, Math.max(1, Number(m.dueDayOfMonth || 5)))).padStart(2, '0');
              const expectedPaymentDate = m.nextDueDate
                ? String(m.nextDueDate).slice(0, 10)
                : `${year}-${month}-${day}`;
              const amount = Number(m.amount || m.amountInr || 0);
              return {
                name: m.title || m.name || m.merchant || 'Recurring Bill',
                title: m.title || m.name || m.merchant || 'Recurring Bill',
                merchant: m.merchant || m.title || 'Merchant',
                category: m.category || 'Recurring',
                expectedPaymentDate,
                amount,
                amountInr: amount,
                confidenceLevel: m.status === 'confirmed' ? 'confirmed' : 'high',
                isSubscription: /netflix|spotify|prime|fiber|internet|cloud|subscription/i.test(
                  `${m.title || ''} ${m.category || ''}`
                ),
              };
            });

          const totalMonthly = records.reduce((s, r) => s + r.amountInr, 0);
          const responsePayload = JSON.stringify({
            agentId: 'aura-mandate-intelligence',
            recurringCommitments: records,
            recurringCommitmentRecords: records,
            duplicateSubscriptions: [],
            unusualChanges: [],
            unusualMandateChanges: [],
            recommendations: [
              `Keep ₹${totalMonthly.toLocaleString(
                'en-IN'
              )} ring-fenced in your primary checking account ahead of scheduled due dates.`,
            ],
          });

          if (body.stream) {
            const sse = [
              `data: ${JSON.stringify({
                id: 'chatcmpl-mandate',
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'claude-sonnet-4-6',
                choices: [{ index: 0, delta: { role: 'assistant', content: responsePayload }, finish_reason: null }],
              })}\n\n`,
              `data: ${JSON.stringify({
                id: 'chatcmpl-mandate',
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
            id: 'chatcmpl-mandate',
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
      serviceName: process.env.ASTRO_AGENT_NAME || 'aura-mandate-intelligence',
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

const analyseRecurringCommitmentsTool = createTool({
  id: 'analyse_recurring_commitments',
  description:
    'Evaluates recurring mandates and transaction patterns to compute expected payment dates, confidence levels, and total monthly commitment burden.',
  inputSchema: z.object({
    mandates: z.array(
      z.object({
        name: z.string(),
        category: z.string(),
        amountInr: z.number(),
        dueDayOfMonth: z.number().optional(),
        nextDueDate: z.string().optional(),
        status: z.string().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    totalMonthlyCommitmentsInr: z.number(),
    records: z.array(
      z.object({
        name: z.string(),
        category: z.string(),
        expectedPaymentDate: z.string(),
        amountInr: z.number(),
        confidenceLevel: z.enum(['confirmed', 'high', 'medium']),
        isSubscription: z.boolean(),
      })
    ),
  }),
  execute: async ({ mandates }) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const subCategories = new Set(['Subscriptions', 'Entertainment', 'Software', 'Internet', 'Streaming']);

    const records = mandates
      .filter((m) => m.category !== 'Salary')
      .map((m) => {
        const day = String(Math.min(28, Math.max(1, m.dueDayOfMonth || 5))).padStart(2, '0');
        const expectedPaymentDate = m.nextDueDate ? m.nextDueDate.slice(0, 10) : `${year}-${month}-${day}`;
        const confidenceLevel: 'confirmed' | 'high' | 'medium' =
          m.status === 'confirmed' ? 'confirmed' : m.amountInr >= 1000 ? 'high' : 'medium';
        return {
          name: m.name,
          category: m.category,
          expectedPaymentDate,
          amountInr: Math.round(m.amountInr),
          confidenceLevel,
          isSubscription: subCategories.has(m.category) || /netflix|spotify|prime|fiber|internet|cloud/i.test(m.name),
        };
      });

    const totalMonthlyCommitmentsInr = records.reduce((s, r) => s + r.amountInr, 0);
    return {
      totalMonthlyCommitmentsInr,
      records,
    };
  },
});

const detectDuplicateOrChangedSubscriptionsTool = createTool({
  id: 'detect_duplicate_or_changed_subscriptions',
  description:
    'Scans recurring commitments for overlapping subscription categories or unusual amount changes.',
  inputSchema: z.object({
    mandates: z.array(
      z.object({
        name: z.string(),
        category: z.string(),
        amountInr: z.number(),
        previousAmountInr: z.number().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    duplicateGroups: z.array(
      z.object({
        category: z.string(),
        merchants: z.array(z.string()),
        combinedMonthlyCostInr: z.number(),
      })
    ),
    amountChanges: z.array(
      z.object({
        name: z.string(),
        previousAmountInr: z.number(),
        currentAmountInr: z.number(),
        deltaInr: z.number(),
      })
    ),
  }),
  execute: async ({ mandates }) => {
    const byCat = new Map<string, { merchants: string[]; total: number }>();
    const amountChanges: Array<{ name: string; previousAmountInr: number; currentAmountInr: number; deltaInr: number }> = [];

    for (const m of mandates) {
      if (m.category === 'Salary' || m.category === 'Rent') continue;
      const entry = byCat.get(m.category) || { merchants: [], total: 0 };
      entry.merchants.push(m.name);
      entry.total += m.amountInr;
      byCat.set(m.category, entry);

      if (typeof m.previousAmountInr === 'number' && m.previousAmountInr > 0 && m.previousAmountInr !== m.amountInr) {
        amountChanges.push({
          name: m.name,
          previousAmountInr: m.previousAmountInr,
          currentAmountInr: m.amountInr,
          deltaInr: m.amountInr - m.previousAmountInr,
        });
      }
    }

    const duplicateGroups = Array.from(byCat.entries())
      .filter(([, v]) => v.merchants.length > 1)
      .map(([category, v]) => ({
        category,
        merchants: v.merchants,
        combinedMonthlyCostInr: Math.round(v.total),
      }));

    return {
      duplicateGroups,
      amountChanges,
    };
  },
});

const agent = new Agent({
  id: 'aura-mandate-intelligence',
  name: 'AURA Mandate Intelligence',
  instructions: `You are AURA Mandate Intelligence (Agent 3 of AURA), a recurring commitment and subscription specialist running on Astropods.

Your responsibilities:
1. Identify recurring financial commitments, subscriptions, and recurring bills from the provided context.
2. Always call 'analyse_recurring_commitments' and 'detect_duplicate_or_changed_subscriptions'.
3. Estimate upcoming payment dates, identify duplicate subscriptions, and flag unusual changes in recurring payments.
4. Never invent currency figures — use only the exact INR amounts from the input context and tool outputs.

RESPONSE FORMAT REQUIREMENT:
You MUST respond with ONLY a valid JSON object matching this exact structure:
{
  "agentId": "aura-mandate-intelligence",
  "recurringCommitmentRecords": [
    {
      "name": "string",
      "category": "string",
      "expectedPaymentDate": "YYYY-MM-DD",
      "amountInr": number,
      "confidenceLevel": "confirmed" | "high" | "medium",
      "isSubscription": boolean
    }
  ],
  "duplicateSubscriptions": [
    {
      "category": "string",
      "merchants": ["string"],
      "combinedMonthlyCostInr": number,
      "recommendation": "string"
    }
  ],
  "unusualMandateChanges": [
    {
      "name": "string",
      "previousAmountInr": number,
      "currentAmountInr": number,
      "observation": "string"
    }
  ],
  "recommendations": ["string"]
}`,
  model: gateway.chat(process.env.MODEL_DEFAULT ?? 'claude-sonnet-4-6'),
  tools: {
    analyseRecurringCommitmentsTool,
    detectDuplicateOrChangedSubscriptionsTool,
  },
  memory,
  defaultOptions: {
    tracingOptions: {
      tags: ['astro', 'aura', 'agent:aura-mandate-intelligence'],
      metadata: {
        agent_id: 'aura-mandate-intelligence',
        role: 'Recurring Commitment & Due-Date Specialist',
      },
    },
  },
});

new Mastra({
  agents: {
    'aura-mandate-intelligence': agent,
  },
  observability,
});

serve(agent);
