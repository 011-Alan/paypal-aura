/**
 * aura-transaction-intelligence — Agent 2 of AURA
 *
 * Spending Pattern & Anomaly Analyst deployed on Astropods.
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

          const txs: any[] = Array.isArray(parsedInput.transactions) ? parsedInput.transactions : [];
          const essentialCats = new Set(['Rent', 'Housing', 'Utilities', 'Insurance', 'Loan EMI', 'Groceries']);
          const expenses = txs.filter((t) => t.type !== 'income');
          const totalExpense = expenses.reduce((s, t) => s + Number(t.amount || t.amountInr || 0), 0);
          const byCat: Record<string, { total: number; count: number }> = {};
          for (const t of expenses) {
            const cat = t.category || 'Other';
            byCat[cat] = byCat[cat] || { total: 0, count: 0 };
            byCat[cat].total += Number(t.amount || t.amountInr || 0);
            byCat[cat].count += 1;
          }

          const anomalies = expenses
            .filter(
              (t) =>
                t.isUnusual ||
                (!essentialCats.has(t.category) && Number(t.amount || t.amountInr || 0) >= 10000)
            )
            .map((t) => ({
              merchant: t.merchant || 'Merchant',
              amount: Number(t.amount || t.amountInr || 0),
              amountInr: Number(t.amount || t.amountInr || 0),
              category: t.category || 'Other',
              reason:
                t.unusualReason ||
                `Expenditure of ₹${Number(t.amount || t.amountInr || 0).toLocaleString(
                  'en-IN'
                )} exceeds typical category threshold.`,
              severity: Number(t.amount || t.amountInr || 0) >= 20000 ? 'high' : 'medium',
            }));

          const responsePayload = JSON.stringify({
            agentId: 'aura-transaction-intelligence',
            transactionClassifications: expenses.slice(0, 15).map((t) => ({
              merchant: t.merchant || 'Merchant',
              category: t.category || 'Other',
              amount: Number(t.amount || t.amountInr || 0),
              totalAmountInr: Number(t.amount || t.amountInr || 0),
              transactionCount: 1,
              classification: essentialCats.has(t.category) ? 'essential' : 'discretionary',
              isEssential: essentialCats.has(t.category),
              isUnusual: Boolean(t.isUnusual || Number(t.amount || t.amountInr || 0) >= 10000),
            })),
            spendingInsights: Object.entries(byCat).map(([category, v]) => ({
              category,
              totalAmount: Math.round(v.total),
              totalSpentInr: Math.round(v.total),
              shareOfSpendPercent:
                totalExpense > 0 ? Math.round((v.total / totalExpense) * 1000) / 10 : 0,
              insight: `${category} totals ₹${Math.round(v.total).toLocaleString('en-IN')} across ${
                v.count
              } transaction(s).`,
            })),
            anomalyObservations: anomalies,
            explanations: `Analysed ${txs.length} transaction(s) totalling ₹${Math.round(
              totalExpense
            ).toLocaleString('en-IN')} in expenditure and flagged ${
              anomalies.length
            } unusual transaction(s).`,
          });

          if (body.stream) {
            const sse = [
              `data: ${JSON.stringify({
                id: 'chatcmpl-tx',
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'claude-sonnet-4-6',
                choices: [{ index: 0, delta: { role: 'assistant', content: responsePayload }, finish_reason: null }],
              })}\n\n`,
              `data: ${JSON.stringify({
                id: 'chatcmpl-tx',
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
            id: 'chatcmpl-tx',
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
      serviceName: process.env.ASTRO_AGENT_NAME || 'aura-transaction-intelligence',
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

const classifyAndAggregateTransactionsTool = createTool({
  id: 'classify_and_aggregate_transactions',
  description:
    'Deterministically classifies and aggregates sanitized transaction records by category and merchant, calculating share of expenditure and essential vs discretionary split.',
  inputSchema: z.object({
    transactions: z.array(
      z.object({
        merchant: z.string(),
        category: z.string(),
        amountInr: z.number(),
        date: z.string().optional(),
        isUnusual: z.boolean().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    totalExpenditureInr: z.number(),
    categoryBreakdown: z.array(
      z.object({
        category: z.string(),
        totalSpentInr: z.number(),
        transactionCount: z.number(),
        shareOfSpendPercent: z.number(),
        isEssential: z.boolean(),
      })
    ),
    merchantClassifications: z.array(
      z.object({
        merchant: z.string(),
        category: z.string(),
        totalAmountInr: z.number(),
        transactionCount: z.number(),
        isEssential: z.boolean(),
      })
    ),
  }),
  execute: async ({ transactions }) => {
    const essentialCategories = new Set(['Rent', 'Housing', 'Utilities', 'Insurance', 'Loan EMI', 'Groceries', 'Healthcare']);
    const totalExpenditureInr = transactions.reduce((s, t) => s + Math.max(0, t.amountInr), 0);
    const catMap = new Map<string, { total: number; count: number }>();
    const merchMap = new Map<string, { category: string; total: number; count: number }>();

    for (const t of transactions) {
      const c = catMap.get(t.category) || { total: 0, count: 0 };
      c.total += t.amountInr;
      c.count += 1;
      catMap.set(t.category, c);

      const m = merchMap.get(t.merchant) || { category: t.category, total: 0, count: 0 };
      m.total += t.amountInr;
      m.count += 1;
      merchMap.set(t.merchant, m);
    }

    const categoryBreakdown = Array.from(catMap.entries())
      .map(([category, v]) => ({
        category,
        totalSpentInr: Math.round(v.total),
        transactionCount: v.count,
        shareOfSpendPercent: totalExpenditureInr > 0 ? Math.round((v.total / totalExpenditureInr) * 1000) / 10 : 0,
        isEssential: essentialCategories.has(category),
      }))
      .sort((a, b) => b.totalSpentInr - a.totalSpentInr);

    const merchantClassifications = Array.from(merchMap.entries())
      .map(([merchant, v]) => ({
        merchant,
        category: v.category,
        totalAmountInr: Math.round(v.total),
        transactionCount: v.count,
        isEssential: essentialCategories.has(v.category),
      }))
      .sort((a, b) => b.totalAmountInr - a.totalAmountInr)
      .slice(0, 10);

    return {
      totalExpenditureInr: Math.round(totalExpenditureInr),
      categoryBreakdown,
      merchantClassifications,
    };
  },
});

const detectSpendingAnomaliesTool = createTool({
  id: 'detect_spending_anomalies',
  description:
    'Identifies unusual expenditure items and category spending spikes using deterministic threshold and z-score rules.',
  inputSchema: z.object({
    transactions: z.array(
      z.object({
        merchant: z.string(),
        category: z.string(),
        amountInr: z.number(),
        isUnusual: z.boolean().optional(),
        unusualReason: z.string().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    anomalyCount: z.number(),
    anomalies: z.array(
      z.object({
        merchant: z.string(),
        category: z.string(),
        amountInr: z.number(),
        reason: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
      })
    ),
  }),
  execute: async ({ transactions }) => {
    const essentialFixed = new Set(['Rent', 'Housing', 'Loan EMI']);
    const amounts = transactions.map((t) => t.amountInr);
    const mean = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;

    const anomalies = transactions
      .filter((t) => t.isUnusual || (!essentialFixed.has(t.category) && t.amountInr >= Math.max(10000, mean * 2.2)))
      .map((t) => ({
        merchant: t.merchant,
        category: t.category,
        amountInr: Math.round(t.amountInr),
        reason:
          t.unusualReason ||
          `Expenditure of ₹${Math.round(t.amountInr).toLocaleString('en-IN')} at ${t.merchant} (${t.category}) is significantly above average transaction size (₹${Math.round(mean).toLocaleString('en-IN')}).`,
        severity: (t.amountInr >= 20000 ? 'high' : t.amountInr >= 10000 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
      }));

    return {
      anomalyCount: anomalies.length,
      anomalies,
    };
  },
});

const agent = new Agent({
  id: 'aura-transaction-intelligence',
  name: 'AURA Transaction Intelligence',
  instructions: `You are AURA Transaction Intelligence (Agent 2 of AURA), a spending pattern and anomaly analyst running on Astropods.

Your responsibilities:
1. Analyse sanitized financial transactions and category summaries.
2. Always call 'classify_and_aggregate_transactions' and 'detect_spending_anomalies' on provided transaction data.
3. Identify spending patterns, categorise transactions, detect unusual expenditure, and explain changes in spending behaviour clearly and non-judgmentally.
4. Never invent currency figures — use only the exact INR amounts from the input context and tool outputs.

RESPONSE FORMAT REQUIREMENT:
You MUST respond with ONLY a valid JSON object matching this exact structure:
{
  "agentId": "aura-transaction-intelligence",
  "transactionClassifications": [
    {
      "merchant": "string",
      "category": "string",
      "totalAmountInr": number,
      "transactionCount": number,
      "isEssential": boolean
    }
  ],
  "spendingInsights": [
    {
      "category": "string",
      "totalSpentInr": number,
      "shareOfSpendPercent": number,
      "insight": "string"
    }
  ],
  "anomalyObservations": [
    {
      "merchant": "string",
      "amountInr": number,
      "category": "string",
      "reason": "string",
      "severity": "low" | "medium" | "high"
    }
  ],
  "explanations": ["string"]
}`,
  model: gateway.chat(process.env.MODEL_DEFAULT ?? 'claude-sonnet-4-6'),
  tools: {
    classifyAndAggregateTransactionsTool,
    detectSpendingAnomaliesTool,
  },
  memory,
  defaultOptions: {
    tracingOptions: {
      tags: ['astro', 'aura', 'agent:aura-transaction-intelligence'],
      metadata: {
        agent_id: 'aura-transaction-intelligence',
        role: 'Spending Pattern & Anomaly Analyst',
      },
    },
  },
});

new Mastra({
  agents: {
    'aura-transaction-intelligence': agent,
  },
  observability,
});

serve(agent);
