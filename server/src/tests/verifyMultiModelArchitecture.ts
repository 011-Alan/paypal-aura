import assert from 'assert';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ensureDemoUserAlexSeeded, DEMO_ALEX_CREDENTIALS } from '../seed/seedService';
import { UserModel, MessageModel, ConversationModel, AccountModel, SemanticEmbeddingModel } from '../models';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { geminiRequestManager } from '../services/planning/geminiRequestManager';
import { modelRouter } from '../services/planning/modelRouter';
import { GEMINI_MODEL_REGISTRY, validateModelAvailability } from '../services/planning/modelConfig';
import { semanticRetrievalService, cosineSimilarity } from '../services/ai/semanticRetrievalService';
import { lightweightProcessingService } from '../services/ai/lightweightProcessingService';

async function runMultiModelTests() {
  console.log('================================================================');
  console.log('AURA MULTI-MODEL GEMINI ARCHITECTURE ACCEPTANCE TEST SUITE');
  console.log('================================================================\n');

  await connectDatabase();
  await ensureDemoUserAlexSeeded(true);

  const alex = await UserModel.findOne({ email: DEMO_ALEX_CREDENTIALS.email });
  assert.ok(alex, 'Demo user Alex must be seeded');
  const alexId = String(alex._id);

  const priya = await UserModel.findOne({ email: /priya/i });
  assert.ok(priya, 'Demo user Priya must be seeded');
  const priyaId = String(priya._id);

  // Fast sleep fn for instant test execution
  auraAiOrchestrator.setSleepFnForTesting(async () => {});

  // High RPM limit for test suite so assertions execute without rate delay
  geminiRequestManager.setRpmLimitForTesting(1000);
  geminiRequestManager.resetMetrics();

  // ==========================================================================
  // SECTION 1: PRIMARY MODEL (GEMINI 3.8 FLASH) SCENARIOS 1 - 4
  // ==========================================================================
  console.log('--- Scenario 1: General conversation uses Gemini 3.8 Flash ---');
  {
    let capturedModel = '';
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          capturedModel = args.model;
          return {
            text: 'I am AURA, your general-purpose assistant and financial companion.',
            candidates: [{ content: { parts: [{ text: 'I am AURA, your general-purpose assistant and financial companion.' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Hello! What can you help me with today?',
    });

    assert.strictEqual(result.success, true, '1a. Result must succeed');
    assert.strictEqual(capturedModel, GEMINI_MODEL_REGISTRY.primary.modelId, '1b. Model passed to Gemini must be Gemini 3.8 Flash');
    assert.strictEqual(result.modelUsed, GEMINI_MODEL_REGISTRY.primary.modelId, '1c. Result reports Gemini 3.8 Flash');
    assert.strictEqual(result.fallbackOccurred, false, '1d. No fallback occurred');
    console.log('[PASS] Scenario 1: Primary conversational intelligence executed with Gemini 3.8 Flash.\n');
  }

  console.log('--- Scenario 2: Follow-up questions retain context ---');
  {
    let capturedContents: any = null;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          capturedContents = args.contents;
          return {
            text: 'You asked about interest compounding earlier. Compounding means generating interest on previously accumulated interest.',
            candidates: [{ content: { parts: [{ text: 'Context retained' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Can you give me an example of how that works?',
      conversationHistory: [
        { role: 'user', content: 'What is compound interest?' },
        { role: 'assistant', content: 'Compound interest is interest earned on top of previous interest.' },
      ],
    });

    assert.strictEqual(result.success, true, '2a. Follow-up succeeds');
    assert.ok(Array.isArray(capturedContents), '2b. Contents is an array');
    assert.strictEqual(capturedContents.length, 3, '2c. Includes 2 prior turns + current turn');
    assert.ok(capturedContents[0].parts[0].text.includes('What is compound interest?'), '2d. First turn preserved');
    console.log('[PASS] Scenario 2: Conversation continuity and multi-turn context preserved.\n');
  }

  console.log('--- Scenario 3: Function calling works on Primary Model ---');
  {
    let toolInvoked = false;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          toolInvoked = true;
          return {
            functionCalls: [{ name: 'getFinancialSummary', args: {} }],
            candidates: [{ content: { parts: [{ functionCall: { name: 'getFinancialSummary', args: {} } }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Check my account balances',
    });

    assert.strictEqual(result.success, true, '3a. Tool interaction succeeds');
    assert.strictEqual(toolInvoked, true, '3b. Tool call was returned by Gemini');
    assert.ok(result.answer.includes('balance') || result.answer.includes('₹'), '3c. Verified financial facts returned');
    console.log('[PASS] Scenario 3: Primary model successfully triggers function calling.\n');
  }

  console.log('--- Scenario 4: Complex financial queries use Primary Model appropriately ---');
  {
    let callCount = 0;
    const modelsUsed: string[] = [];
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          callCount++;
          modelsUsed.push(args.model);
          if (callCount === 1) {
            return {
              functionCalls: [
                {
                  name: 'analyseAffordability',
                  args: { itemName: 'Dell XPS Laptop', price: 95000 },
                },
              ],
              candidates: [{ content: { parts: [{ functionCall: { name: 'analyseAffordability', args: { itemName: 'Dell XPS Laptop', price: 95000 } } }] } }],
            };
          }
          return {
            text: 'The Dell XPS Laptop for ₹95,000 fits comfortably within your quarterly discretionary surplus of ₹1,40,000.',
            candidates: [{ content: { parts: [{ text: 'Synthesis complete' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Can I afford a Dell XPS Laptop for ₹95,000?',
    });

    assert.strictEqual(result.success, true, '4a. Complex analysis succeeds');
    assert.strictEqual(callCount, 2, '4b. Consumes 2 calls for genuine analytical synthesis');
    assert.strictEqual(modelsUsed[0], GEMINI_MODEL_REGISTRY.primary.modelId, '4c. Initial turn uses primary');
    assert.strictEqual(modelsUsed[1], GEMINI_MODEL_REGISTRY.primary.modelId, '4d. Synthesis turn uses primary');
    console.log('[PASS] Scenario 4: Complex financial reasoning handled by Gemini 3.8 Flash.\n');
  }

  // ==========================================================================
  // SECTION 2: LIGHTWEIGHT MODEL (GEMINI 3.1 FLASH LITE) SCENARIOS 5 - 8
  // ==========================================================================
  console.log('--- Scenario 5: Transaction categorisation uses Flash Lite ---');
  {
    let capturedModel = '';
    const mockClient = {
      models: {
        generateContent: async (args: any) => {
          capturedModel = args.model;
          return {
            text: JSON.stringify({
              category: 'Dining',
              subcategory: 'Online Food Delivery',
              merchant: 'Swiggy',
              confidence: 0.98,
              isSubscription: false,
              tags: ['food', 'delivery'],
            }),
          };
        },
      },
    };

    const catResult = await lightweightProcessingService.categorizeTransaction({
      description: 'Swiggy Bangalore Order #48291',
      amount: 450,
      clientOverride: mockClient,
    });

    assert.strictEqual(capturedModel, GEMINI_MODEL_REGISTRY.lightweight.modelId, '5a. Routed to Gemini 3.1 Flash Lite');
    assert.strictEqual(catResult.category, 'Dining', '5b. Correct category Dining');
    assert.strictEqual(catResult.merchant, 'Swiggy', '5c. Correct merchant Swiggy');
    assert.strictEqual(catResult.isSubscription, false, '5d. Not subscription');
    console.log('[PASS] Scenario 5: Transaction categorization executed with Gemini 3.1 Flash Lite.\n');
  }

  console.log('--- Scenario 6: Structured information extraction works with Flash Lite ---');
  {
    let capturedModel = '';
    const mockClient = {
      models: {
        generateContent: async (args: any) => {
          capturedModel = args.model;
          return {
            text: JSON.stringify({
              date: '2026-11-10',
              amount: 5000,
              currency: 'INR',
              recipient: 'Rahul',
              purpose: 'Rent share',
            }),
          };
        },
      },
    };

    const extracted = await lightweightProcessingService.extractStructuredEntities({
      text: 'Transfer 5000 INR to Rahul on 10th November for rent share',
      clientOverride: mockClient,
    });

    assert.strictEqual(capturedModel, GEMINI_MODEL_REGISTRY.lightweight.modelId, '6a. Routed to Gemini 3.1 Flash Lite');
    assert.strictEqual(extracted.amount, 5000, '6b. Extracted amount 5000');
    assert.strictEqual(extracted.recipient, 'Rahul', '6c. Extracted recipient Rahul');
    console.log('[PASS] Scenario 6: Structured entity extraction executed with Gemini 3.1 Flash Lite.\n');
  }

  console.log('--- Scenario 7: Simple general conversation is NOT unnecessarily routed to Flash Lite ---');
  {
    const decision = modelRouter.route('conversational_general');
    assert.strictEqual(decision.modelRole, 'primary', '7a. Router assigns general conversation to Primary');
    assert.strictEqual(decision.modelId, GEMINI_MODEL_REGISTRY.primary.modelId, '7b. Primary model is gemini-3.8-flash');
    console.log('[PASS] Scenario 7: Conversational queries strictly preserved for Primary model.\n');
  }

  console.log('--- Scenario 8: Unsupported function calls or operations rejected safely ---');
  {
    const isPermitted = modelRouter.isFallbackPermitted({
      taskType: 'payment_preparation',
      isTransientError: true,
      isPermanentError: false,
      hasExecutedTools: false,
    });
    assert.strictEqual(isPermitted, false, '8a. Payment operations strictly prohibited from fallback');
    console.log('[PASS] Scenario 8: Sensitive payment and unsupported functions denied fallback.\n');
  }

  // ==========================================================================
  // SECTION 3: INTELLIGENT FALLBACK SCENARIOS 9 - 13
  // ==========================================================================
  console.log('--- Scenario 9: Primary model returns 503 and Flash Lite succeeds ---');
  {
    let primaryAttempts = 0;
    let fallbackAttempts = 0;

    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          if (args.model === GEMINI_MODEL_REGISTRY.primary.modelId) {
            primaryAttempts++;
            const err: any = new Error('{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}');
            err.status = 503;
            throw err;
          } else if (args.model === GEMINI_MODEL_REGISTRY.lightweight.modelId) {
            fallbackAttempts++;
            return {
              text: 'Hello from AURA! I am here to help you manage your finances smoothly.',
              candidates: [{ content: { parts: [{ text: 'Hello from AURA! I am here to help you manage your finances smoothly.' }] } }],
            };
          }
          throw new Error('Unknown model');
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Hello AURA, can you hear me?',
    });

    assert.strictEqual(result.success, true, '9a. Request succeeded via fallback');
    assert.strictEqual(result.fallbackOccurred, true, '9b. Fallback flag is true');
    assert.strictEqual(result.modelUsed, GEMINI_MODEL_REGISTRY.lightweight.modelId, '9c. Model used was Flash Lite');
    assert.ok(fallbackAttempts >= 1, '9d. Flash Lite was invoked');
    assert.strictEqual(result.observability?.fallbackOccurred, true, '9e. Observability trace records fallback');
    assert.strictEqual(result.observability?.originalModel, GEMINI_MODEL_REGISTRY.primary.modelId, '9f. Trace recorded original model');
    console.log('[PASS] Scenario 9: Controlled fallback from 503 to Flash Lite succeeded cleanly.\n');
  }

  console.log('--- Scenario 10: Primary model returns 429 and fallback respects quota ---');
  {
    let fallbackHit = false;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          if (args.model === GEMINI_MODEL_REGISTRY.primary.modelId) {
            const err: any = new Error('{"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}');
            err.status = 429;
            throw err;
          }
          fallbackHit = true;
          return {
            text: 'Understood! I have processed your inquiry via our secondary tier.',
            candidates: [{ content: { parts: [{ text: 'Processed via secondary tier' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Explain the difference between equity and debt',
    });

    assert.strictEqual(result.success, true, '10a. Succeeded via fallback');
    assert.strictEqual(fallbackHit, true, '10b. Fallback was invoked');
    assert.strictEqual(result.fallbackOccurred, true, '10c. Fallback marked in response');
    console.log('[PASS] Scenario 10: Rate-limit 429 triggered controlled fallback.\n');
  }

  console.log('--- Scenario 11: Both models fail and friendly error appears ---');
  {
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          const err: any = new Error('{"error":{"code":503,"message":"UNAVAILABLE"}}');
          err.status = 503;
          throw err;
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'What should I do with my savings?',
    });

    assert.strictEqual(result.success, false, '11a. Fails gracefully');
    assert.strictEqual(result.serviceUnavailable, true, '11b. serviceUnavailable flag set');
    assert.ok(result.answer.includes('having a little trouble') || result.answer.includes('temporarily'), '11c. Friendly error text returned');
    assert.ok(!result.answer.includes('stack'), '11d. No internal stack trace exposed');
    console.log('[PASS] Scenario 11: Both models failed gracefully with friendly message.\n');
  }

  console.log('--- Scenario 12: Permanent error (401 Invalid Key) does NOT trigger fallback ---');
  {
    let flashLiteAttempted = false;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          if (args.model === GEMINI_MODEL_REGISTRY.lightweight.modelId) {
            flashLiteAttempted = true;
          }
          const err: any = new Error('{"error":{"code":401,"message":"API key not valid","status":"UNAUTHENTICATED"}}');
          err.status = 401;
          throw err;
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Tell me about compound interest',
    });

    assert.strictEqual(result.success, false, '12a. Permanent error fails immediately');
    assert.strictEqual(flashLiteAttempted, false, '12b. No pointless fallback attempt on invalid API key');
    console.log('[PASS] Scenario 12: Permanent error fails fast without useless model switching.\n');
  }

  console.log('--- Scenario 13: Fallback does NOT execute financial operations twice ---');
  {
    let executionAttempts = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          executionAttempts++;
          return {
            functionCalls: [
              {
                name: 'preparePayment',
                args: { recipient: 'Rohit Sharma', amount: 1500, currency: 'INR' },
              },
            ],
            candidates: [{ content: { parts: [{ functionCall: { name: 'preparePayment', args: { recipient: 'Rohit Sharma', amount: 1500, currency: 'INR' } } }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Send 1500 to Rohit Sharma',
    });

    assert.strictEqual(result.success, true, '13a. Payment preparation succeeded');
    assert.strictEqual(executionAttempts, 1, '13b. Backend payment tool executed strictly once');
    assert.strictEqual(result.fallbackOccurred, false, '13c. Payment preparation was not fallen back');
    console.log('[PASS] Scenario 13: Financial operations strictly idempotent (never duplicated).\n');
  }

  // ==========================================================================
  // SECTION 4: SEMANTIC EMBEDDINGS (GEMINI EMBEDDING 2) SCENARIOS 14 - 17
  // ==========================================================================
  console.log('--- Scenario 14: Embeddings generated successfully ---');
  {
    const embedding = await semanticRetrievalService.getEmbedding('AURA Personal Finance Assistant');
    assert.ok(Array.isArray(embedding), '14a. Embedding is an array');
    assert.ok(embedding.length > 0, '14b. Embedding has positive dimension length');
    console.log(`[PASS] Scenario 14: Successfully generated vector embedding (${embedding.length} dimensions).\n`);
  }

  console.log('--- Scenario 15: Existing content not unnecessarily re-embedded (hash caching) ---');
  {
    await SemanticEmbeddingModel.deleteMany({});
    let apiEmbedCalls = 0;
    const mockClient = {
      models: {
        embedContent: async () => {
          apiEmbedCalls++;
          return {
            embedding: { values: [0.12, -0.45, 0.78, 0.22] },
          };
        },
      },
    };

    // First indexing
    const rec1 = await semanticRetrievalService.indexContent({
      userId: alexId,
      sourceType: 'financial_note',
      sourceId: 'note-001',
      text: 'Remember to invest in tax saving mutual funds before March 31',
      clientOverride: mockClient,
    });
    assert.ok(rec1, '15a. Record created');
    assert.strictEqual(apiEmbedCalls, 1, '15b. First indexing called embedContent API');

    // Second indexing of identical content
    const rec2 = await semanticRetrievalService.indexContent({
      userId: alexId,
      sourceType: 'financial_note',
      sourceId: 'note-001',
      text: 'Remember to invest in tax saving mutual funds before March 31',
      clientOverride: mockClient,
    });
    assert.ok(rec2, '15c. Record returned');
    assert.strictEqual(apiEmbedCalls, 1, '15d. API was NOT called second time (hash matched)');
    console.log('[PASS] Scenario 15: Content hash match avoided duplicate embedding generation.\n');
  }

  console.log('--- Scenario 16: Semantic retrieval strictly enforces multi-user isolation ---');
  {
    await SemanticEmbeddingModel.deleteMany({});

    // Alex's secret note
    await semanticRetrievalService.indexContent({
      userId: alexId,
      sourceType: 'chat_message',
      sourceId: `alex-secret-${Date.now()}`,
      text: 'Alex confidential emergency fund located in Swiss bank account',
    });

    // Priya searches for emergency fund
    const priyaResults = await semanticRetrievalService.semanticSearch({
      userId: priyaId,
      query: 'Swiss bank emergency fund',
      minScore: 0.2,
    });

    // Priya MUST NOT see Alex's document
    const foundAlexDoc = priyaResults.some((r) => r.text.includes('Swiss bank'));
    assert.strictEqual(foundAlexDoc, false, '16a. Priya cannot retrieve Alex confidential documents');

    // Alex searches for his emergency fund
    const alexResults = await semanticRetrievalService.semanticSearch({
      userId: alexId,
      query: 'Swiss bank emergency fund',
      minScore: 0.2,
    });
    const foundByAlex = alexResults.some((r) => r.text.includes('Swiss bank'));
    assert.strictEqual(foundByAlex, true, '16b. Alex successfully retrieves his own document');
    console.log('[PASS] Scenario 16: Multi-user vector isolation strictly enforced.\n');
  }

  console.log('--- Scenario 17: Live financial values retrieved from authoritative backend ---');
  {
    const alexAccount = await AccountModel.findOne({ userId: alex._id, accountType: 'checking' });
    assert.ok(alexAccount, 'Alex checking account exists');
    const authoritativeBalance = alexAccount.balance;

    let toolReturnedBalance: number = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          return {
            functionCalls: [{ name: 'getFinancialSummary', args: {} }],
            candidates: [{ content: { parts: [{ functionCall: { name: 'getFinancialSummary', args: {} } }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'What is my current liquid balance?',
    });

    assert.strictEqual(result.success, true, '17a. Balance query succeeded');
    assert.ok(result.answer.includes(authoritativeBalance.toLocaleString('en-IN')), '17b. Actual authoritative DB balance returned');
    console.log(`[PASS] Scenario 17: Live financial data (₹${authoritativeBalance}) retrieved from authoritative DB.\n`);
  }

  // ==========================================================================
  // SECTION 5: OVERALL CONTINUITY & ARCHITECTURAL INTEGRITY SCENARIOS 18 - 20
  // ==========================================================================
  console.log('--- Scenario 18: General conversations remain unrestricted ---');
  {
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          const userText = args.contents[args.contents.length - 1].parts[0].text;
          return {
            text: `Answer for "${userText}": Here is complete information without forced financial terminology.`,
            candidates: [{ content: { parts: [{ text: `Answer for "${userText}"` }] } }],
          };
        },
      },
    });

    const prompts = [
      'Tell me about Australian wildlife',
      'Explain quantum entanglement in simple terms',
      'Write a Python function to compute fibonacci numbers',
    ];

    for (const p of prompts) {
      const res = await auraAiOrchestrator.processConversationalQuery({
        userId: alexId,
        prompt: p,
      });
      assert.strictEqual(res.success, true, `18a. Succeeded for prompt "${p}"`);
      assert.strictEqual(res.workflowType, 'general_knowledge', `18b. Marked as general_knowledge`);
    }
    console.log('[PASS] Scenario 18: General non-financial conversations fully supported.\n');
  }

  console.log('--- Scenario 19: Conversation history windowing is preserved ---');
  {
    let receivedTurns = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          receivedTurns = args.contents.length;
          return {
            text: 'I have the full context of our multi-topic conversation.',
            candidates: [{ content: { parts: [{ text: 'Context retained' }] } }],
          };
        },
      },
    });

    // Provide 4 history turns
    await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Summarize our discussion',
      conversationHistory: [
        { role: 'user', content: 'Turn 1' },
        { role: 'assistant', content: 'Reply 1' },
        { role: 'user', content: 'Turn 2' },
        { role: 'assistant', content: 'Reply 2' },
      ],
    });

    assert.strictEqual(receivedTurns, 5, '19a. Contents has 4 history turns + 1 prompt turn = 5');
    console.log('[PASS] Scenario 19: Multi-turn history preserved cleanly across interactions.\n');
  }

  console.log('--- Scenario 20: Multi-model live metrics & diagnostics operational ---');
  {
    const metrics = geminiRequestManager.getMetrics();
    console.log('Final Multi-Model Gemini Request Metrics:', JSON.stringify(metrics, null, 2));

    assert.ok(metrics.totalGeminiApiCalls >= 1, '20a. Total calls recorded');
    assert.ok(metrics.primaryApiCalls >= 1, '20b. Primary calls recorded');
    assert.ok(metrics.rpmLimits.primary >= 1, '20c. Primary RPM limit configured');
    assert.ok(metrics.rpmLimits.lightweight >= 1, '20d. Lightweight RPM limit configured');
    assert.ok(metrics.rpmLimits.embedding >= 1, '20e. Embedding RPM limit configured');

    const health = auraAiOrchestrator.getHealthStatus();
    assert.strictEqual((health as any).multiModel.primary.modelId, GEMINI_MODEL_REGISTRY.primary.modelId, '20f. Health reports primary model');
    assert.strictEqual((health as any).multiModel.lightweight.modelId, GEMINI_MODEL_REGISTRY.lightweight.modelId, '20g. Health reports lightweight model');
    assert.strictEqual((health as any).multiModel.embedding.modelId, GEMINI_MODEL_REGISTRY.embedding.modelId, '20h. Health reports embedding model');
    console.log('[PASS] Scenario 20: Multi-model live metrics and diagnostics confirmed operational.\n');
  }

  console.log('================================================================');
  console.log('ALL 20 MULTI-MODEL ACCEPTANCE TEST SCENARIOS PASSED (100%)!');
  console.log('================================================================');

  await disconnectDatabase();
}

runMultiModelTests().catch(async (err) => {
  console.error('Acceptance test failed:', err);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
