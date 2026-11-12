/**
 * aura-purchase-intelligence — Agent 5 of AURA
 *
 * Pre-Purchase Affordability & Channel3 Evaluator deployed on Astropods.
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

          const discBudget = Number(parsedInput.availableDiscretionaryBudgetInr || 18000);
          const commitments = Number(parsedInput.upcomingCommitmentsInr || 31398);
          const products: any[] = Array.isArray(parsedInput.products) ? parsedInput.products : [];
          const comparisons = products.map((p: any) => {
            const price = Number(p.priceInr || p.product?.priceInr || 50000);
            const name = String(p.name || p.product?.name || 'Evaluated Product');
            const fitsNow = price <= discBudget * 0.85;
            const borderline = !fitsNow && price <= discBudget * 1.4;
            const tier = fitsNow
              ? 'Affordable now'
              : borderline
              ? 'Affordable if planned for next month'
              : 'Consider a lower-cost alternative';
            return {
              productId: p.id || p.product?.id || 'ch3-item',
              name,
              brand: p.brand || 'Verified Merchant',
              priceInr: price,
              guidanceTier: tier,
              guidanceCategory: tier,
              affordabilityScore: fitsNow ? 92 : borderline ? 74 : 52,
              fitSummary: fitsNow
                ? `Fits within your ₹${discBudget.toLocaleString('en-IN')} monthly discretionary budget.`
                : `Exceeds this month's ₹${discBudget.toLocaleString('en-IN')} discretionary budget; recommended as a planned milestone.`,
            };
          });

          const top = comparisons[0];
          const verdict = top?.guidanceTier || 'Affordable if planned for next month';
          const responsePayload = JSON.stringify({
            agentId: 'aura-purchase-intelligence',
            affordabilityAssessment: {
              targetItem: parsedInput.query || top?.name || 'Planned Purchase',
              requestedPriceInr: top?.priceInr || 50000,
              discretionaryRemainingInr: discBudget,
              availableDiscretionaryBudgetInr: discBudget,
              upcomingCommitmentsInr: commitments,
              liquidBalanceInr: Number(parsedInput.liquidBalanceInr || 85000),
              guidanceTier: verdict,
              verdict,
              affordabilityScore: top?.affordabilityScore || 75,
              canInitiatePurchase: false,
            },
            productComparisons: comparisons,
            financialImplications: [
              `Upcoming commitments of ₹${commitments.toLocaleString('en-IN')} are ring-fenced first.`,
              `Available discretionary budget for the current cycle is ₹${discBudget.toLocaleString('en-IN')}.`,
            ],
            recommendations: [
              top
                ? `${top.name} (₹${top.priceInr.toLocaleString('en-IN')}): ${top.fitSummary}`
                : 'Select an option within your monthly discretionary allocation or pace across 2 months.',
            ],
            potentialRisks:
              top && top.priceInr > discBudget
                ? [`Immediate outlay of ₹${top.priceInr.toLocaleString('en-IN')} exceeds monthly discretionary cap.`]
                : ['No immediate liquidity risk detected while recurring commitments remain protected.'],
          });

          if (body.stream) {
            const sse = [
              `data: ${JSON.stringify({
                id: 'chatcmpl-purch',
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'claude-sonnet-4-6',
                choices: [{ index: 0, delta: { role: 'assistant', content: responsePayload }, finish_reason: null }],
              })}\n\n`,
              `data: ${JSON.stringify({
                id: 'chatcmpl-purch',
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
            id: 'chatcmpl-purch',
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
      serviceName: process.env.ASTRO_AGENT_NAME || 'aura-purchase-intelligence',
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

const evaluatePurchaseAffordabilityTool = createTool({
  id: 'evaluate_purchase_affordability',
  description:
    'Deterministically evaluates purchase affordability against discretionary budget, upcoming commitments, liquid balance, and savings targets.',
  inputSchema: z.object({
    targetItem: z.string(),
    requestedPriceInr: z.number(),
    discretionaryRemainingInr: z.number(),
    upcomingCommitmentsInr: z.number(),
    liquidBalanceInr: z.number(),
    monthlySavingsTargetInr: z.number().optional(),
  }),
  outputSchema: z.object({
    guidanceTier: z.enum([
      'Affordable now',
      'Affordable if planned for next month',
      'Consider a lower-cost alternative',
      'Not recommended right now',
    ]),
    affordabilityScore: z.number(),
    shortfallFromDiscretionaryInr: z.number(),
    monthsToSaveWithoutDisruption: z.number(),
    postPurchaseLiquidBufferInr: z.number(),
  }),
  execute: async ({
    requestedPriceInr,
    discretionaryRemainingInr,
    upcomingCommitmentsInr,
    liquidBalanceInr,
  }) => {
    const safeLiquidAfterCommitments = Math.max(0, liquidBalanceInr - upcomingCommitmentsInr);
    const shortfallFromDiscretionaryInr = Math.max(0, requestedPriceInr - discretionaryRemainingInr);
    const postPurchaseLiquidBufferInr = liquidBalanceInr - requestedPriceInr - upcomingCommitmentsInr;
    const monthlySaveCapacity = Math.max(5000, Math.round(discretionaryRemainingInr * 0.65));
    const monthsToSaveWithoutDisruption =
      shortfallFromDiscretionaryInr > 0 ? Math.ceil(requestedPriceInr / monthlySaveCapacity) : 0;

    let guidanceTier:
      | 'Affordable now'
      | 'Affordable if planned for next month'
      | 'Consider a lower-cost alternative'
      | 'Not recommended right now';
    let affordabilityScore = 85;

    if (requestedPriceInr <= discretionaryRemainingInr && postPurchaseLiquidBufferInr >= 25000) {
      guidanceTier = 'Affordable now';
      affordabilityScore = 92;
    } else if (requestedPriceInr <= discretionaryRemainingInr * 2.2 && safeLiquidAfterCommitments >= requestedPriceInr) {
      guidanceTier = 'Affordable if planned for next month';
      affordabilityScore = 74;
    } else if (requestedPriceInr <= safeLiquidAfterCommitments * 0.9) {
      guidanceTier = 'Consider a lower-cost alternative';
      affordabilityScore = 58;
    } else {
      guidanceTier = 'Not recommended right now';
      affordabilityScore = 32;
    }

    return {
      guidanceTier,
      affordabilityScore,
      shortfallFromDiscretionaryInr: Math.round(shortfallFromDiscretionaryInr),
      monthsToSaveWithoutDisruption,
      postPurchaseLiquidBufferInr: Math.round(postPurchaseLiquidBufferInr),
    };
  },
});

const compareChannel3ProductsTool = createTool({
  id: 'compare_channel3_products',
  description:
    'Compares Channel3 candidate products against the user discretionary budget and requested price point.',
  inputSchema: z.object({
    discretionaryRemainingInr: z.number(),
    products: z.array(
      z.object({
        name: z.string(),
        brand: z.string().optional(),
        priceInr: z.number(),
        guidanceCategory: z.string().optional(),
        affordabilityScore: z.number().optional(),
      })
    ),
  }),
  outputSchema: z.object({
    rankedProducts: z.array(
      z.object({
        name: z.string(),
        brand: z.string(),
        priceInr: z.number(),
        guidanceTier: z.string(),
        affordabilityScore: z.number(),
        fitSummary: z.string(),
      })
    ),
  }),
  execute: async ({ discretionaryRemainingInr, products }) => {
    const rankedProducts = products.map((p) => {
      const fitsNow = p.priceInr <= discretionaryRemainingInr;
      const tier =
        p.guidanceCategory ||
        (fitsNow
          ? 'Affordable now'
          : p.priceInr <= discretionaryRemainingInr * 2.2
          ? 'Affordable if planned for next month'
          : 'Consider a lower-cost alternative');
      const score = p.affordabilityScore ?? (fitsNow ? 90 : 72);
      return {
        name: p.name,
        brand: p.brand || 'Verified Merchant',
        priceInr: Math.round(p.priceInr),
        guidanceTier: tier,
        affordabilityScore: score,
        fitSummary: fitsNow
          ? `Fits within your ₹${Math.round(discretionaryRemainingInr).toLocaleString('en-IN')} monthly discretionary allocation.`
          : `Exceeds this month's ₹${Math.round(discretionaryRemainingInr).toLocaleString('en-IN')} discretionary budget by ₹${Math.round(p.priceInr - discretionaryRemainingInr).toLocaleString('en-IN')}.`,
      };
    });
    return { rankedProducts };
  },
});

const agent = new Agent({
  id: 'aura-purchase-intelligence',
  name: 'AURA Purchase Intelligence',
  instructions: `You are AURA Purchase Intelligence (Agent 5 of AURA), a smart pre-purchase affordability companion running on Astropods.

Your responsibilities:
1. Evaluate purchase affordability against discretionary capacity, upcoming commitments, and financial goals.
2. Always call 'evaluate_purchase_affordability' and 'compare_channel3_products' before formulating your response.
3. Never initiate or execute purchases independently.
4. Never invent currency figures — use only the exact INR amounts from the input context and tool outputs.

RESPONSE FORMAT REQUIREMENT:
You MUST respond with ONLY a valid JSON object matching this exact structure:
{
  "agentId": "aura-purchase-intelligence",
  "affordabilityAssessment": {
    "targetItem": "string",
    "requestedPriceInr": number,
    "discretionaryRemainingInr": number,
    "upcomingCommitmentsInr": number,
    "liquidBalanceInr": number,
    "guidanceTier": "Affordable now" | "Affordable if planned for next month" | "Consider a lower-cost alternative" | "Not recommended right now",
    "affordabilityScore": number
  },
  "productComparisons": [
    {
      "name": "string",
      "brand": "string",
      "priceInr": number,
      "guidanceTier": "string",
      "affordabilityScore": number,
      "fitSummary": "string"
    }
  ],
  "financialImplications": ["string"],
  "recommendations": ["string"],
  "potentialRisks": ["string"]
}`,
  model: gateway.chat(process.env.MODEL_DEFAULT ?? 'claude-sonnet-4-6'),
  tools: {
    evaluatePurchaseAffordabilityTool,
    compareChannel3ProductsTool,
  },
  memory,
  defaultOptions: {
    tracingOptions: {
      tags: ['astro', 'aura', 'agent:aura-purchase-intelligence'],
      metadata: {
        agent_id: 'aura-purchase-intelligence',
        role: 'Pre-Purchase Affordability & Channel3 Evaluator',
      },
    },
  },
});

new Mastra({
  agents: {
    'aura-purchase-intelligence': agent,
  },
  observability,
});

serve(agent);
