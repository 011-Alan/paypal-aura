import assert from 'assert';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ensureDemoUserAlexSeeded, DEMO_ALEX_CREDENTIALS } from '../seed/seedService';
import { UserModel, AccountModel } from '../models';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { geminiRequestManager } from '../services/planning/geminiRequestManager';
import { modelRouter } from '../services/planning/modelRouter';
import { GEMINI_MODEL_REGISTRY } from '../services/planning/modelConfig';
import { logger } from '../config/logger';

async function runQuotaAndFallbackTests() {
  console.log('================================================================');
  console.log('AURA GEMINI QUOTA & MULTI-MODEL FALLBACK TEST SUITE');
  console.log('================================================================\n');

  await connectDatabase();
  await ensureDemoUserAlexSeeded(true);

  const alex = await UserModel.findOne({ email: DEMO_ALEX_CREDENTIALS.email });
  assert.ok(alex, 'Demo user Alex must be seeded');
  const alexId = String(alex._id);

  // Fast sleep fn for instant execution without real clock delays
  auraAiOrchestrator.setSleepFnForTesting(async () => {});
  geminiRequestManager.setRpmLimitForTesting(1000);
  geminiRequestManager.resetMetrics();

  // Helper to inspect recent logs
  function getRecentLogMessages(): string[] {
    return logger.getRecentLogs(50).map((l) => l.message);
  }

  // ==========================================================================
  // SCENARIO 1: Primary model succeeds
  // ==========================================================================
  console.log('--- Scenario 1: Primary model succeeds ---');
  {
    let capturedModel = '';
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          capturedModel = args.model;
          return {
            text: 'Hello Alex! I am Gemini 3.8 Flash, your primary AI companion.',
            candidates: [{ content: { parts: [{ text: 'Hello Alex! I am Gemini 3.8 Flash, your primary AI companion.' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Hello from Alex',
    });

    assert.strictEqual(result.success, true, '1a. Result must succeed');
    assert.strictEqual(capturedModel, GEMINI_MODEL_REGISTRY.primary.modelId, '1b. Model must be primary');
    assert.strictEqual(result.modelUsed, GEMINI_MODEL_REGISTRY.primary.modelId, '1c. Model used matches primary');
    assert.strictEqual(result.fallbackOccurred, false, '1d. Fallback did not occur');

    const logs = getRecentLogMessages();
    const primaryLog = logs.find((m) => m.includes(`[GEMINI] Primary model: ${GEMINI_MODEL_REGISTRY.primary.modelId}`));
    assert.ok(primaryLog, '1e. Must log [GEMINI] Primary model: gemini-3.8-flash');
    console.log('[PASS] Scenario 1: Primary model succeeded cleanly on initial turn.\n');
  }

  // ==========================================================================
  // SCENARIO 2: Primary returns 503 and subsequently succeeds
  // ==========================================================================
  console.log('--- Scenario 2: Primary returns 503 and subsequently succeeds ---');
  {
    let attempts = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          attempts++;
          if (attempts === 1) {
            const err: any = new Error('{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}');
            err.status = 503;
            throw err;
          }
          return {
            text: 'Recovered from temporary 503 outage!',
            candidates: [{ content: { parts: [{ text: 'Recovered from temporary 503 outage!' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'How is the weather today?',
    });

    assert.strictEqual(result.success, true, '2a. Result must succeed after retry');
    assert.strictEqual(attempts, 2, '2b. Consumed 2 attempts (initial 503 + retry 1)');
    assert.strictEqual(result.modelUsed, GEMINI_MODEL_REGISTRY.primary.modelId, '2c. Model used was primary');
    assert.strictEqual(result.fallbackOccurred, false, '2d. No fallback occurred because retry succeeded');
    assert.strictEqual(result.observability?.retriesAttempted, 1, '2e. Observability recorded 1 retry');
    console.log('[PASS] Scenario 2: Primary model retried temporary 503 and succeeded without fallback.\n');
  }

  // ==========================================================================
  // SCENARIO 3: Primary daily quota is exhausted and alternative succeeds
  // ==========================================================================
  console.log('--- Scenario 3: Primary daily quota is exhausted and alternative succeeds ---');
  {
    let primaryAttempts = 0;
    let alternativeAttempts = 0;

    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          if (args.model === GEMINI_MODEL_REGISTRY.primary.modelId) {
            primaryAttempts++;
            // Simulate Google's official daily quota exhaustion error
            const err: any = new Error(
              '{"error":{"code":429,"message":"Quota exceeded for quota metric \'Generate Content API requests per day\' and limit \'RequestsPerDay per project\'","status":"RESOURCE_EXHAUSTED"}}'
            );
            err.status = 429;
            throw err;
          }
          if (args.model === GEMINI_MODEL_REGISTRY.lightweight.modelId) {
            alternativeAttempts++;
            return {
              text: 'Hello from Gemini 3.1 Flash Lite! I stepped in seamlessly while the primary model daily quota is reset.',
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: 'Hello from Gemini 3.1 Flash Lite! I stepped in seamlessly while the primary model daily quota is reset.',
                      },
                    ],
                  },
                },
              ],
            };
          }
          throw new Error(`Unexpected model: ${args.model}`);
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Can you summarize financial risk management principles?',
    });

    assert.strictEqual(result.success, true, '3a. Fallback request succeeded');
    assert.strictEqual(primaryAttempts, 1, '3b. Primary failed fast without futile retries on daily quota exhaustion');
    assert.strictEqual(alternativeAttempts, 1, '3c. Alternative model was invoked');
    assert.strictEqual(result.fallbackOccurred, true, '3d. fallbackOccurred is true');
    assert.strictEqual(result.modelUsed, GEMINI_MODEL_REGISTRY.lightweight.modelId, '3e. Model used is gemini-3.1-flash-lite');

    // Verify structured log sequence
    const logs = getRecentLogMessages();
    const hasPrimaryModelLog = logs.some((m) => m.includes(`[GEMINI] Primary model: ${GEMINI_MODEL_REGISTRY.primary.modelId}`));
    const hasPrimaryFailureLog = logs.some((m) => m.includes('[GEMINI] Primary failure: 429 daily_quota_exhausted'));
    const hasInitiatingFallbackLog = logs.some((m) => m.includes('[GEMINI] Initiating fallback'));
    const hasAlternativeModelLog = logs.some((m) => m.includes(`[GEMINI] Alternative model: ${GEMINI_MODEL_REGISTRY.lightweight.modelId}`));
    const hasAlternativeStartedLog = logs.some((m) => m.includes('[GEMINI] Alternative request started'));
    const hasAlternativeSuccessLog = logs.some((m) => m.includes('[GEMINI] Alternative request successful'));

    assert.ok(hasPrimaryModelLog, '3f. Log: [GEMINI] Primary model');
    assert.ok(hasPrimaryFailureLog, '3g. Log: [GEMINI] Primary failure: 429 daily_quota_exhausted');
    assert.ok(hasInitiatingFallbackLog, '3h. Log: [GEMINI] Initiating fallback');
    assert.ok(hasAlternativeModelLog, '3i. Log: [GEMINI] Alternative model');
    assert.ok(hasAlternativeStartedLog, '3j. Log: [GEMINI] Alternative request started');
    assert.ok(hasAlternativeSuccessLog, '3k. Log: [GEMINI] Alternative request successful');

    console.log('[PASS] Scenario 3: Daily quota exhaustion immediately and successfully fell back to Flash Lite.\n');
  }

  // ==========================================================================
  // SCENARIO 4: Both models have exhausted quotas
  // ==========================================================================
  console.log('--- Scenario 4: Both models have exhausted quotas ---');
  {
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          const err: any = new Error(
            `{"error":{"code":429,"message":"Quota exceeded for quota metric 'requests per day' for ${args.model}","status":"RESOURCE_EXHAUSTED"}}`
          );
          err.status = 429;
          throw err;
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Explain what an ETF is',
    });

    assert.strictEqual(result.success, false, '4a. Should fail gracefully');
    assert.strictEqual(result.serviceUnavailable, true, '4b. serviceUnavailable flag set');
    assert.ok(result.answer.includes('having a little trouble') || result.answer.includes('safe'), '4c. Friendly message returned');

    const logs = getRecentLogMessages();
    const hasAltFailedLog = logs.some((m) => m.includes('[GEMINI] Alternative request failed: 429 daily_quota_exhausted'));
    assert.ok(hasAltFailedLog, '4d. Log: [GEMINI] Alternative request failed: 429 daily_quota_exhausted');

    console.log('[PASS] Scenario 4: Quota exhaustion on both models handled gracefully with friendly message.\n');
  }

  // ==========================================================================
  // SCENARIO 5: Alternative model returns 503
  // ==========================================================================
  console.log('--- Scenario 5: Alternative model returns 503 ---');
  {
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          if (args.model === GEMINI_MODEL_REGISTRY.primary.modelId) {
            const err: any = new Error('{"error":{"code":429,"message":"daily_quota_exhausted","status":"RESOURCE_EXHAUSTED"}}');
            err.status = 429;
            throw err;
          }
          const err: any = new Error('{"error":{"code":503,"message":"UNAVAILABLE","status":"UNAVAILABLE"}}');
          err.status = 503;
          throw err;
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'What is a mutual fund?',
    });

    assert.strictEqual(result.success, false, '5a. Result fails gracefully');
    assert.strictEqual(result.serviceUnavailable, true, '5b. serviceUnavailable flag set');

    const logs = getRecentLogMessages();
    const hasAlt503Log = logs.some((m) => m.includes('[GEMINI] Alternative request failed: 503 service_unavailable'));
    assert.ok(hasAlt503Log, '5c. Log: [GEMINI] Alternative request failed: 503 service_unavailable');

    console.log('[PASS] Scenario 5: Alternative model 503 captured and reported cleanly.\n');
  }

  // ==========================================================================
  // SCENARIO 6: Alternative model does not support a required capability
  // ==========================================================================
  console.log('--- Scenario 6: Alternative model does not support a required capability ---');
  {
    // 6a: Payment preparation prompt cannot fall back
    const paymentPermitted = modelRouter.isFallbackPermitted({
      taskType: 'payment_preparation',
      isTransientError: false,
      isPermanentError: true,
      hasExecutedTools: false,
      reason: 'daily_quota_exhausted',
      statusCode: 429,
    });
    assert.strictEqual(paymentPermitted, false, '6a. Payment preparation strictly prohibited from fallback');

    // 6b: Custom unsupported capability denied
    const capabilityPermitted = modelRouter.isFallbackPermitted({
      taskType: 'conversational_general',
      isTransientError: true,
      isPermanentError: false,
      hasExecutedTools: false,
      requiredCapability: 'unsupported_quantum_finance_engine',
    });
    assert.strictEqual(capabilityPermitted, false, '6b. Unsupported capability denied fallback');

    // 6c: End-to-end payment query with primary failure does NOT invoke Flash Lite
    let flashLiteInvoked = false;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          if (args.model === GEMINI_MODEL_REGISTRY.lightweight.modelId) {
            flashLiteInvoked = true;
          }
          const err: any = new Error('{"error":{"code":429,"message":"daily_quota_exhausted"}}');
          err.status = 429;
          throw err;
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'Pay 5000 INR to Alice for rent',
    });

    assert.strictEqual(result.success, false, '6c. Payment operation fails safely');
    assert.strictEqual(flashLiteInvoked, false, '6d. Flash Lite was NEVER invoked for payment operation');

    console.log('[PASS] Scenario 6: Unsupported capabilities and payment tasks strictly denied fallback.\n');
  }

  // ==========================================================================
  // SCENARIO 7: Financial tool execution is not duplicated during fallback
  // ==========================================================================
  console.log('--- Scenario 7: Financial tool execution is not duplicated during fallback ---');
  {
    // Verify that modelRouter denies fallback once tools have already executed
    const toolExecutedPermitted = modelRouter.isFallbackPermitted({
      taskType: 'financial_advisory',
      isTransientError: true,
      isPermanentError: false,
      hasExecutedTools: true, // Tools already ran!
      reason: 'service_unavailable',
      statusCode: 503,
    });
    assert.strictEqual(toolExecutedPermitted, false, '7a. Fallback denied if tools were already executed');

    // End-to-end check: tool call during fallback executes exactly once
    let toolExecutionCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (args: any) => {
          // Primary fails with daily quota exhaustion
          if (args.model === GEMINI_MODEL_REGISTRY.primary.modelId) {
            const err: any = new Error('{"error":{"code":429,"message":"daily_quota_exhausted"}}');
            err.status = 429;
            throw err;
          }

          // Alternative model steps in and requests getFinancialSummary tool
          toolExecutionCount++;
          return {
            functionCalls: [{ name: 'getFinancialSummary', args: {} }],
            candidates: [
              {
                content: {
                  parts: [{ functionCall: { name: 'getFinancialSummary', args: {} } }],
                },
              },
            ],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId: alexId,
      prompt: 'What is my current balance?',
    });

    assert.strictEqual(result.success, true, '7b. Result succeeds via fallback');
    assert.strictEqual(result.fallbackOccurred, true, '7c. Fallback occurred');
    assert.strictEqual(toolExecutionCount, 1, '7d. Gemini tool turn was requested exactly once');
    assert.ok(result.answer.includes('balance') || result.answer.includes('₹'), '7e. Fact-checked balance returned');

    console.log('[PASS] Scenario 7: Backend tools never duplicated during fallback.\n');
  }

  await disconnectDatabase();
  console.log('================================================================');
  console.log('ALL 7 GEMINI QUOTA & FALLBACK SCENARIOS PASSED WITH ZERO ERRORS');
  console.log('================================================================\n');
}

runQuotaAndFallbackTests().catch((err) => {
  console.error('Fatal error in verifyGeminiQuotaAndFallback:', err);
  process.exit(1);
});
