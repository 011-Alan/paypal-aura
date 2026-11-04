import assert from 'assert';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ensureDemoUserAlexSeeded, DEMO_ALEX_CREDENTIALS } from '../seed/seedService';
import { UserModel, MessageModel, ConversationModel } from '../models';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { geminiRequestManager } from '../services/planning/geminiRequestManager';

async function runOptimizationTests() {
  console.log('================================================================');
  console.log('AURA GEMINI API OPTIMISATION & EFFICIENCY ACCEPTANCE TEST SUITE');
  console.log('================================================================\n');

  await connectDatabase();
  await ensureDemoUserAlexSeeded(true);

  const alex = await UserModel.findOne({ email: DEMO_ALEX_CREDENTIALS.email });
  assert.ok(alex, 'Demo user Alex must be seeded');
  const userId = String(alex._id);

  // Fast sleep fn for instant test execution
  auraAiOrchestrator.setSleepFnForTesting(async () => {});

  // Set high RPM limit for test suite so assertions execute instantaneously without sleeping 60s
  geminiRequestManager.setRpmLimitForTesting(1000);

  // Reset metrics
  geminiRequestManager.resetMetrics();

  // --------------------------------------------------------------------------
  // Test 1: Ordinary conversational query consumes exactly 1 Gemini API call
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Ordinary conversation consumes exactly 1 Gemini API call ---');
  {
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          return {
            text: 'Hello! I am AURA, your intelligent financial assistant.',
            candidates: [{ content: { parts: [{ text: 'Hello! I am AURA, your intelligent financial assistant.' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Hello there, who are you?',
    });

    assert.strictEqual(result.success, true, '1a. Result must succeed');
    assert.strictEqual(callCount, 1, '1b. Ordinary conversation must make exactly 1 API call');
    assert.strictEqual(result.observability?.geminiCallsMade, 1, '1c. Observability records 1 Gemini call');
    console.log('[PASS] Test 1: Exactly 1 API call consumed for general conversation.\n');
  }

  // --------------------------------------------------------------------------
  // Test 2: Clarification request consumes exactly 1 Gemini API call
  // --------------------------------------------------------------------------
  console.log('--- Test 2: Clarification request consumes exactly 1 Gemini API call ---');
  {
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          return {
            text: 'Could you please specify whether you mean an athletic water bottle or an insulated flask?',
            candidates: [{ content: { parts: [{ text: 'Could you please specify whether you mean an athletic water bottle or an insulated flask?' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Can I buy a bottle?',
    });

    assert.strictEqual(result.success, true, '2a. Clarification result succeeds');
    assert.strictEqual(callCount, 1, '2b. Clarification makes exactly 1 API call');
    assert.strictEqual(result.observability?.geminiCallsMade, 1, '2c. Observability records 1 Gemini call');
    console.log('[PASS] Test 2: Exactly 1 API call consumed for clarification request.\n');
  }

  // --------------------------------------------------------------------------
  // Test 3: Simple balance retrieval consumes exactly 1 call (follow-up synthesis avoided)
  // --------------------------------------------------------------------------
  console.log('--- Test 3: Simple balance retrieval skips redundant synthesis (1 call) ---');
  {
    const initialAvoided = geminiRequestManager.getMetrics().followUpCallsAvoided;
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          return {
            functionCalls: [
              {
                name: 'getFinancialSummary',
                args: {},
              },
            ],
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'getFinancialSummary',
                        args: {},
                      },
                    },
                  ],
                },
              },
            ],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'What is my current balance?',
    });

    assert.strictEqual(result.success, true, '3a. Balance retrieval succeeds');
    assert.strictEqual(callCount, 1, '3b. Tool call executed without second Gemini synthesis call');
    assert.strictEqual(result.observability?.geminiCallsMade, 1, '3c. Observability confirms 1 API call');
    assert.ok(result.answer.includes('balance') || result.answer.includes('₹') || result.answer.includes('Alex'), '3d. Response contains financial details');
    const newAvoided = geminiRequestManager.getMetrics().followUpCallsAvoided;
    assert.strictEqual(newAvoided, initialAvoided + 1, '3e. Metrics recorded 1 follow-up synthesis avoided');
    console.log('[PASS] Test 3: Redundant follow-up avoided for getFinancialSummary (50% reduction).\n');
  }

  // --------------------------------------------------------------------------
  // Test 4: Complex financial analysis uses 2 calls when synthesis is genuinely needed
  // --------------------------------------------------------------------------
  console.log('--- Test 4: Complex financial analysis uses 2 calls when synthesis needed ---');
  {
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              functionCalls: [
                {
                  name: 'analyseAffordability',
                  args: { itemName: 'MacBook Pro', price: 150000 },
                },
              ],
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: 'analyseAffordability',
                          args: { itemName: 'MacBook Pro', price: 150000 },
                        },
                      },
                    ],
                  },
                },
              ],
            };
          }
          // Second call: Gemini synthesizes complex advisory
          return {
            text: 'Based on your monthly surplus and current liquidity, purchasing the MacBook Pro for ₹150,000 would consume 72% of your available funds. I recommend spreading the cost over 3 installments.',
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'Based on your monthly surplus and current liquidity, purchasing the MacBook Pro for ₹150,000 would consume 72% of your available funds. I recommend spreading the cost over 3 installments.',
                    },
                  ],
                },
              },
            ],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Can I afford a MacBook Pro for ₹150,000?',
    });

    assert.strictEqual(result.success, true, '4a. Complex analysis succeeds');
    assert.strictEqual(callCount, 2, '4b. Complex analysis correctly uses 2 API calls for AI synthesis');
    assert.strictEqual(result.observability?.geminiCallsMade, 2, '4c. Observability records 2 Gemini calls');
    assert.ok(result.answer.includes('MacBook Pro') || result.answer.includes('installments'), '4d. Contains synthesized advisory');
    console.log('[PASS] Test 4: Complex analysis correctly executed with 2 calls.\n');
  }

  // --------------------------------------------------------------------------
  // Test 5: In-flight deduplication coalesces simultaneous duplicate requests
  // --------------------------------------------------------------------------
  console.log('--- Test 5: In-flight deduplication coalesces simultaneous duplicate requests ---');
  {
    const initialDedups = geminiRequestManager.getMetrics().deduplicatedSubmissions;
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          // Simulate slight latency
          await new Promise((r) => setTimeout(r, 60));
          return {
            text: 'Here is the answer to your concurrent question.',
            candidates: [{ content: { parts: [{ text: 'Here is the answer to your concurrent question.' }] } }],
          };
        },
      },
    });

    // Fire two identical queries simultaneously
    const p1 = auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'What is compound interest in finance?',
    });
    const p2 = auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'What is compound interest in finance?',
    });

    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(res1.success, true, '5a. Request 1 succeeds');
    assert.strictEqual(res2.success, true, '5b. Request 2 succeeds');
    assert.strictEqual(res1.answer, res2.answer, '5c. Responses match');
    assert.strictEqual(callCount, 1, '5d. Exactly 1 Gemini API call made despite 2 concurrent requests');
    const newDedups = geminiRequestManager.getMetrics().deduplicatedSubmissions;
    assert.strictEqual(newDedups, initialDedups + 1, '5e. In-flight deduplication counter incremented');
    console.log('[PASS] Test 5: Rapid duplicate submissions coalesced into 1 Gemini call.\n');
  }

  // --------------------------------------------------------------------------
  // Test 6: Safe general-knowledge TTL caching
  // --------------------------------------------------------------------------
  console.log('--- Test 6: Safe general knowledge caching returns cached response with 0 calls ---');
  {
    const initialCacheHits = geminiRequestManager.getMetrics().cachedResponsesServed;
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          return {
            text: 'Inflation is the rate at which the general level of prices for goods and services rises.',
            candidates: [{ content: { parts: [{ text: 'Inflation is the rate at which the general level of prices for goods and services rises.' }] } }],
          };
        },
      },
    });

    // First call (populates cache)
    const res1 = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'What is inflation in economics?',
    });
    assert.strictEqual(callCount, 1, '6a. First query calls API');
    assert.strictEqual(res1.observability?.cached, false, '6b. First query is not cached');

    // Second call (cache hit)
    const res2 = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'What is inflation in economics?',
    });
    assert.strictEqual(callCount, 1, '6c. Second query made NO additional Gemini API call');
    assert.strictEqual(res2.observability?.cached, true, '6d. Second query marked as cached');
    assert.strictEqual(res2.observability?.geminiCallsMade, 0, '6e. 0 Gemini calls on cache hit');
    const newCacheHits = geminiRequestManager.getMetrics().cachedResponsesServed;
    assert.strictEqual(newCacheHits, initialCacheHits + 1, '6f. Cache hit counter incremented');
    console.log('[PASS] Test 6: Safe general knowledge caching avoids calls on repeated queries.\n');
  }

  // --------------------------------------------------------------------------
  // Test 7: User data isolation (Personal / financial queries are NEVER cached)
  // --------------------------------------------------------------------------
  console.log('--- Test 7: User data isolation — financial data is NEVER cached or shared ---');
  {
    const priya = await UserModel.findOne({ email: /priya/i });
    assert.ok(priya, 'Priya must be seeded');
    const priyaId = String(priya._id);

    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          return {
            functionCalls: [{ name: 'getFinancialSummary', args: {} }],
            candidates: [{ content: { parts: [{ functionCall: { name: 'getFinancialSummary', args: {} } }] } }],
          };
        },
      },
    });

    const res1 = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Show my balance and savings',
    });
    assert.strictEqual(res1.observability?.cached, false, '7a. Personal balance query is not cached');

    // A small tick to ensure microtask cleanup
    await new Promise((r) => setTimeout(r, 20));

    // Priya queries the same prompt: must NOT serve a stale/cross-user cache
    const res2 = await auraAiOrchestrator.processConversationalQuery({
      userId: priyaId,
      prompt: 'Show my balance and savings',
    });
    assert.strictEqual(res2.observability?.cached, false, '7b. Second user balance query is also fresh, not cached');
    assert.strictEqual(callCount, 2, '7c. Each personal financial check queries freshly');
    console.log('[PASS] Test 7: User financial data strictly excluded from general cache.\n');
  }

  // --------------------------------------------------------------------------
  // Test 8: Rate-limiter sliding window queue executes requests safely
  // --------------------------------------------------------------------------
  console.log('--- Test 8: Rate-limiter queue processes requests safely ---');
  {
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          return {
            text: `Response for request ${callCount}`,
            candidates: [{ content: { parts: [{ text: `Response for request ${callCount}` }] } }],
          };
        },
      },
    });

    const requests = [
      auraAiOrchestrator.processConversationalQuery({ userId, prompt: 'Query A for queue test' }),
      auraAiOrchestrator.processConversationalQuery({ userId, prompt: 'Query B for queue test' }),
    ];

    const results = await Promise.all(requests);
    assert.strictEqual(results.length, 2, '8a. Both queued requests resolved');
    assert.strictEqual(results[0].success, true, '8b. Request A succeeded');
    assert.strictEqual(results[1].success, true, '8c. Request B succeeded');
    console.log('[PASS] Test 8: Rate-limiter queue safely processes sequential/concurrent requests.\n');
  }

  // --------------------------------------------------------------------------
  // Test 9: Conversation history windowing maintains context without token bloat
  // --------------------------------------------------------------------------
  console.log('--- Test 9: Conversation history windowing and turn truncation ---');
  {
    let capturedContents: any = null;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          capturedContents = args.contents;
          return {
            text: 'I remember the context from our conversation.',
            candidates: [{ content: { parts: [{ text: 'I remember the context from our conversation.' }] } }],
          };
        },
      },
    });

    // Seed 10 previous messages in DB for this user
    await MessageModel.deleteMany({ userId });
    let conv = await ConversationModel.findOne({ userId });
    if (!conv) {
      conv = await ConversationModel.create({
        userId,
        title: 'Test Windowing Conversation',
        messages: [],
      });
    }

    for (let i = 1; i <= 10; i++) {
      await MessageModel.create({
        conversationId: conv._id,
        userId,
        role: i % 2 === 1 ? 'user' : 'assistant',
        content: `Turn ${i}: ${'x'.repeat(600)}`, // > 500 chars to test truncation
        createdAt: new Date(Date.now() - (10 - i) * 60000),
      });
    }

    await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'What was my last question?',
    });

    assert.ok(Array.isArray(capturedContents), '9a. Contents must be an array');
    // Contents = history (max 6 turns) + current turn = 7
    assert.ok(capturedContents.length <= 7, `9b. History trimmed to window (got ${capturedContents.length} turns)`);
    // Check that history items were truncated to ~500 chars
    const historyTextPart = capturedContents[0]?.parts?.[0]?.text || '';
    assert.ok(historyTextPart.length <= 550, `9c. History turn truncated to avoid TPM bloat (${historyTextPart.length} chars)`);
    console.log('[PASS] Test 9: Conversation history windowing & truncation prevents token bloat.\n');
  }

  // --------------------------------------------------------------------------
  // Test 10: Follow-up questions resolve context from recent history
  // --------------------------------------------------------------------------
  console.log('--- Test 10: Follow-up questions maintain recent context ---');
  {
    let capturedPrompt = '';
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          const lastMsg = args.contents[args.contents.length - 1];
          capturedPrompt = lastMsg?.parts?.[0]?.text || '';
          return {
            text: 'I can help you review your SIP contributions.',
            candidates: [{ content: { parts: [{ text: 'I can help you review your SIP contributions.' }] } }],
          };
        },
      },
    });

    const res = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'How much do I invest in them?',
    });

    assert.strictEqual(res.success, true, '10a. Follow-up query executed');
    assert.ok(capturedPrompt.includes('How much do I invest in them?'), '10b. Gemini received current follow-up');
    console.log('[PASS] Test 10: Follow-up question successfully passed with context window.\n');
  }

  // --------------------------------------------------------------------------
  // Test 11: Retry mechanism handles transient errors without duplicating operations
  // --------------------------------------------------------------------------
  console.log('--- Test 11: Retry mechanism with exponential backoff on transient 503 ---');
  {
    let attempts = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          attempts++;
          if (attempts === 1) {
            const err: any = new Error('{"error":{"code":503,"message":"UNAVAILABLE"}}');
            err.status = 503;
            throw err;
          }
          return {
            text: 'Recovered after transient 503 error.',
            candidates: [{ content: { parts: [{ text: 'Recovered after transient 503 error.' }] } }],
          };
        },
      },
    });

    const res = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Tell me a tip for budgeting',
    });

    assert.strictEqual(res.success, true, '11a. Succeeded on retry');
    assert.strictEqual(attempts, 2, '11b. Exactly 2 attempts (initial + 1 retry)');
    assert.strictEqual(res.observability?.retriesAttempted, 1, '11c. Observability records 1 retry');
    console.log('[PASS] Test 11: Transient retry succeeded cleanly.\n');
  }

  // --------------------------------------------------------------------------
  // Test 12: Financial actions are idempotent and never duplicated
  // --------------------------------------------------------------------------
  console.log('--- Test 12: Financial operations are never executed multiple times ---');
  {
    let toolExecutionCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          toolExecutionCount++;
          return {
            functionCalls: [
              {
                name: 'preparePayment',
                args: { recipient: 'Rahul Verma', amount: 500, currency: 'INR' },
              },
            ],
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'preparePayment',
                        args: { recipient: 'Rahul Verma', amount: 500, currency: 'INR' },
                      },
                    },
                  ],
                },
              },
            ],
          };
        },
      },
    });

    const res = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Send 500 to Rahul Verma',
    });

    assert.strictEqual(res.success, true, '12a. Payment preparation succeeded');
    assert.strictEqual(toolExecutionCount, 1, '12b. Tool was invoked exactly once');
    assert.strictEqual(res.observability?.geminiCallsMade, 1, '12c. Consumed exactly 1 Gemini call (deterministic tool)');
    assert.ok(res.answer.includes('PIN') || res.answer.includes('500') || res.answer.includes('Rahul'), '12d. Contains payment approval response');
    console.log('[PASS] Test 12: Financial action executed strictly once without duplicate calls.\n');
  }

  // --------------------------------------------------------------------------
  // Test 13: Live Metrics reporting via geminiRequestManager
  // --------------------------------------------------------------------------
  console.log('--- Test 13: Live Metrics Reporting ---');
  {
    const metrics = geminiRequestManager.getMetrics();
    console.log('Current Gemini Request Metrics:', JSON.stringify(metrics, null, 2));

    assert.ok(metrics.totalGeminiApiCalls >= 1, '13a. Total calls recorded');
    assert.ok(metrics.followUpCallsAvoided >= 1, '13b. Avoided redundant calls recorded');
    assert.ok(metrics.cachedResponsesServed >= 1, '13c. Cache hits recorded');
    assert.ok(metrics.deduplicatedSubmissions >= 1, '13d. In-flight deduplication recorded');
    console.log('[PASS] Test 13: Comprehensive metrics tracking confirmed.\n');
  }

  console.log('================================================================');
  console.log('ALL 13 GEMINI OPTIMISATION ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');

  await disconnectDatabase();
}

runOptimizationTests().catch(async (err) => {
  console.error('Test suite failed:', err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
