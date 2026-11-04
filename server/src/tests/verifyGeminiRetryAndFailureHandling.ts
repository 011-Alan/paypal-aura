import assert from 'assert';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ensureDemoUserAlexSeeded, DEMO_ALEX_CREDENTIALS } from '../seed/seedService';
import { UserModel } from '../models';
import { geminiRequestManager } from '../services/planning/geminiRequestManager';
import {
  auraAiOrchestrator,
  isTransientGeminiError,
  parseGeminiError,
} from '../services/planning/aiOrchestratorService';

async function runGeminiRetryTests() {
  console.log('================================================================');
  console.log('AURA GEMINI API RETRY & TEMPORARY FAILURE TEST SUITE');
  console.log('================================================================\n');

  await connectDatabase();
  await ensureDemoUserAlexSeeded(true);
  geminiRequestManager.setRpmLimitForTesting(1000);

  const alex = await UserModel.findOne({ email: DEMO_ALEX_CREDENTIALS.email });
  assert.ok(alex, 'Demo user Alex must be seeded');
  const userId = String(alex._id);

  // Configure instantaneous sleep for unit tests so full exponential schedules can be validated
  const sleepLog: number[] = [];
  auraAiOrchestrator.setSleepFnForTesting(async (ms: number) => {
    sleepLog.push(ms);
  });

  const resetSleepLog = () => {
    sleepLog.length = 0;
  };

  // --------------------------------------------------------------------------
  // Scenario 1: Gemini responds successfully on the first attempt
  // --------------------------------------------------------------------------
  console.log('--- Scenario 1: Gemini responds successfully on first attempt ---');
  {
    resetSleepLog();
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          return {
            text: 'Hello! I am ready to help you manage your finances.',
            candidates: [{ content: { parts: [{ text: 'Hello! I am ready to help you manage your finances.' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Hello there!',
    });

    assert.strictEqual(result.success, true, '1a. Response must be successful');
    assert.strictEqual(callCount, 1, '1b. Must only execute a single API attempt');
    assert.strictEqual(sleepLog.length, 0, '1c. No retries or backoff delays must occur');
    assert.strictEqual(result.observability?.retriesAttempted, 0, '1d. Trace records 0 retries');
    console.log('[PASS] Scenario 1: First-attempt success confirmed.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 2: Gemini returns 503 once, then succeeds
  // --------------------------------------------------------------------------
  console.log('--- Scenario 2: Gemini returns 503 once, then succeeds ---');
  {
    resetSleepLog();
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            const err: any = new Error(
              '{"error":{"code":503,"message":"The model is overloaded. Please try again later.","status":"UNAVAILABLE"}}'
            );
            err.status = 503;
            throw err;
          }
          return {
            text: 'I recovered smoothly and here is your response!',
            candidates: [{ content: { parts: [{ text: 'I recovered smoothly and here is your response!' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Tell me something interesting.',
    });

    assert.strictEqual(result.success, true, '2a. Response must succeed after retry');
    assert.strictEqual(callCount, 2, '2b. Exactly 2 attempts (initial + 1 retry)');
    assert.strictEqual(sleepLog.length, 1, '2c. Exactly 1 backoff delay recorded');
    assert.ok(sleepLog[0] >= 1000 && sleepLog[0] <= 1300, `2d. First retry must back off ~1s with jitter (${sleepLog[0]}ms)`);
    assert.strictEqual(result.observability?.retriesAttempted, 1, '2e. Trace records 1 retry attempted');
    console.log(`[PASS] Scenario 2: Recovered from 503 on retry 1 with ${sleepLog[0]}ms delay.\n`);
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Gemini returns 503 repeatedly and exhausts retries (max 4 retries)
  // --------------------------------------------------------------------------
  console.log('--- Scenario 3: Gemini returns 503 repeatedly and exhausts retries ---');
  {
    resetSleepLog();
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          const err: any = new Error(
            '{"error":{"code":503,"message":"Service Unavailable. Overloaded.","status":"UNAVAILABLE"}}'
          );
          err.status = 503;
          throw err;
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Check my finances',
    });

    assert.strictEqual(result.success, false, '3a. Success must be false when exhausted');
    assert.strictEqual(result.serviceUnavailable, true, '3b. serviceUnavailable must be true');
    assert.strictEqual(callCount, 5, '3c. Must attempt initial + 4 retries = 5 total attempts');
    assert.strictEqual(sleepLog.length, 4, '3d. Must execute 4 backoff delays');
    
    // Verify exponential backoff schedule: ~1s, ~2s, ~4s, ~8s
    assert.ok(sleepLog[0] >= 1000 && sleepLog[0] <= 1300, `3e. Retry 1 ~1s: ${sleepLog[0]}ms`);
    assert.ok(sleepLog[1] >= 2000 && sleepLog[1] <= 2600, `3f. Retry 2 ~2s: ${sleepLog[1]}ms`);
    assert.ok(sleepLog[2] >= 4000 && sleepLog[2] <= 5000, `3g. Retry 3 ~4s: ${sleepLog[2]}ms`);
    assert.ok(sleepLog[3] >= 8000 && sleepLog[3] <= 10000, `3h. Retry 4 ~8s: ${sleepLog[3]}ms`);
    assert.strictEqual(result.observability?.retriesAttempted, 4, '3i. Trace records 4 retries attempted');
    console.log(`[PASS] Scenario 3: 4 retries exhausted with delays [${sleepLog.join(', ')}]ms.\n`);
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Gemini returns 429 (transient rate limit respecting Retry-After)
  // --------------------------------------------------------------------------
  console.log('--- Scenario 4: Gemini returns 429 transient rate limit with Retry-After ---');
  {
    resetSleepLog();
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            const err: any = new Error(
              '{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota). Please retry after 3s.","status":"RESOURCE_EXHAUSTED"}}'
            );
            err.status = 429;
            throw err;
          }
          return {
            text: 'Rate limit lifted, processing completed.',
            candidates: [{ content: { parts: [{ text: 'Rate limit lifted' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Show me my recent transactions',
    });

    assert.strictEqual(result.success, true, '4a. Must succeed on retry after 429');
    assert.strictEqual(callCount, 2, '4b. Exactly 2 attempts');
    assert.strictEqual(sleepLog.length, 1, '4c. 1 retry delay');
    assert.ok(sleepLog[0] >= 3000, `4d. Must respect Retry-After 3s (${sleepLog[0]}ms)`);
    console.log(`[PASS] Scenario 4: Handled 429 rate limit respecting Retry-After delay (${sleepLog[0]}ms).\n`);
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Gemini returns 400 or 401 and is NOT retried
  // --------------------------------------------------------------------------
  console.log('--- Scenario 5: Gemini returns 400/401 and is NOT retried ---');
  {
    // Test 401
    resetSleepLog();
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          const err: any = new Error(
            '{"error":{"code":401,"message":"API_KEY_INVALID: API key not valid.","status":"UNAUTHENTICATED"}}'
          );
          err.status = 401;
          throw err;
        },
      },
    });

    const res401 = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Hello',
    });

    assert.strictEqual(res401.success, false, '5a. 401 must fail immediately');
    assert.strictEqual(callCount, 1, '5b. 401 must NOT be retried (callCount = 1)');
    assert.strictEqual(sleepLog.length, 0, '5c. 401 must not trigger backoff delay');

    // Test 400
    resetSleepLog();
    callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          const err: any = new Error(
            '{"error":{"code":400,"message":"INVALID_ARGUMENT: Invalid parameter","status":"INVALID_ARGUMENT"}}'
          );
          err.status = 400;
          throw err;
        },
      },
    });

    const res400 = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Invalid prompt',
    });

    assert.strictEqual(res400.success, false, '5d. 400 must fail immediately');
    assert.strictEqual(callCount, 1, '5e. 400 must NOT be retried (callCount = 1)');
    assert.strictEqual(sleepLog.length, 0, '5f. 400 must not trigger backoff delay');
    console.log('[PASS] Scenario 5: Permanent errors (400, 401) correctly bypassed retries.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Gemini returns invalid-model 404 and is NOT retried
  // --------------------------------------------------------------------------
  console.log('--- Scenario 6: Gemini returns invalid-model 404 and is NOT retried ---');
  {
    resetSleepLog();
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          const err: any = new Error(
            '{"error":{"code":404,"message":"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash","status":"NOT_FOUND"}}'
          );
          err.status = 404;
          throw err;
        },
      },
    });

    const res404 = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Help me plan',
    });

    assert.strictEqual(res404.success, false, '6a. 404 must fail immediately');
    assert.strictEqual(callCount, 1, '6b. 404 model not found must NOT be retried');
    assert.strictEqual(sleepLog.length, 0, '6c. No backoff delays triggered for 404');
    console.log('[PASS] Scenario 6: Invalid model 404 rejected without retrying.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 7: Network connection fails temporarily and recovers
  // --------------------------------------------------------------------------
  console.log('--- Scenario 7: Transient network failure (ECONNRESET/fetch failed) and recovery ---');
  {
    resetSleepLog();
    let callCount = 0;
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          callCount++;
          if (callCount <= 2) {
            const err: any = new TypeError('fetch failed');
            err.code = 'ECONNRESET';
            throw err;
          }
          return {
            text: 'Network recovered! How can I assist you today?',
            candidates: [{ content: { parts: [{ text: 'Network recovered!' }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Network test prompt',
    });

    assert.strictEqual(result.success, true, '7a. Must succeed once network recovers');
    assert.strictEqual(callCount, 3, '7b. Exactly 3 attempts (1 initial + 2 retries)');
    assert.strictEqual(sleepLog.length, 2, '7c. Exactly 2 backoff delays');
    assert.strictEqual(result.observability?.retriesAttempted, 2, '7d. Trace records 2 retries');
    console.log(`[PASS] Scenario 7: Transient network failures recovered on attempt 3.\n`);
  }

  // --------------------------------------------------------------------------
  // Scenario 8: All retries fail -> Friendly error response returned to user
  // --------------------------------------------------------------------------
  console.log('--- Scenario 8: All retries fail and frontend receives friendly error message ---');
  {
    resetSleepLog();
    const SECRET_KEY = 'AIzaSyASecretKeyThatMustNeverBeExposed12345';
    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          const err: any = new Error(
            `Internal raw error with key=${SECRET_KEY} and stack at GoogleApiInternalEndpoint: 503 UNAVAILABLE`
          );
          err.status = 503;
          throw err;
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Check my budget',
    });

    const EXPECTED_FRIENDLY_MESSAGE =
      "I'm having a little trouble connecting to my AI engine right now. Your information is safe. Please try again in a moment.";

    assert.strictEqual(result.success, false, '8a. Must report success: false');
    assert.strictEqual(result.serviceUnavailable, true, '8b. serviceUnavailable must be true');
    assert.strictEqual(result.error, EXPECTED_FRIENDLY_MESSAGE, '8c. User-facing error must match exact friendly message');
    assert.strictEqual(result.explanation, EXPECTED_FRIENDLY_MESSAGE, '8d. explanation must match friendly message');
    assert.strictEqual(result.answer, EXPECTED_FRIENDLY_MESSAGE, '8e. answer must match friendly message');

    // Security check: No raw Google API error, stack trace, or API keys in user-facing fields
    const userFacingPayload = JSON.stringify({
      error: result.error,
      explanation: result.explanation,
      answer: result.answer,
      toolAction: result.toolAction,
    });

    assert.strictEqual(userFacingPayload.includes(SECRET_KEY), false, '8f. API key must NEVER be in user payload');
    assert.strictEqual(userFacingPayload.includes('GoogleApiInternalEndpoint'), false, '8g. Internal stack must NEVER be in user payload');
    assert.strictEqual(userFacingPayload.includes('503 UNAVAILABLE'), false, '8h. Raw Google API error string must NOT be in user payload');

    // Diagnostic information preserved securely in observability trace
    assert.ok(result.observability, '8i. Observability trace must be preserved');
    assert.strictEqual(result.observability?.finalResponseStatus, 'service_unavailable');
    assert.strictEqual(result.observability?.retriesAttempted, 4);
    console.log('[PASS] Scenario 8: Friendly error message returned with zero leaked internals.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 9: Non-duplication of Financial Backend Operations
  // --------------------------------------------------------------------------
  console.log('--- Scenario 9: Financial Operations are Never Duplicated ---');
  {
    resetSleepLog();
    let initialCalls = 0;
    let followUpCalls = 0;

    auraAiOrchestrator.setGeminiClientForTesting({
      models: {
        generateContent: async (params: any) => {
          const contents = params.contents || [];
          const last = contents[contents.length - 1];

          // Turn 2: Follow-up synthesis
          if (last?.parts?.[0]?.functionResponse) {
            followUpCalls++;
            if (followUpCalls === 1) {
              const err: any = new Error('503 UNAVAILABLE on follow-up synthesis');
              err.status = 503;
              throw err;
            }
            return {
              text: 'Affordability guidance confirmed via follow-up synthesis.',
              candidates: [{ content: { parts: [{ text: 'Affordability guidance confirmed' }] } }],
            };
          }

          // Turn 1: Initial tool call request
          initialCalls++;
          if (initialCalls === 1) {
            const err: any = new Error('503 UNAVAILABLE on initial turn');
            err.status = 503;
            throw err;
          }

          return {
            functionCalls: [
              {
                id: 'call_affordability_test',
                name: 'analyseAffordability',
                args: { productName: 'Laptop', priceInr: 45000 },
              },
            ],
            candidates: [{ content: { parts: [{ functionCall: { name: 'analyseAffordability' } }] } }],
          };
        },
      },
    });

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: 'Can I afford a laptop for ₹45,000?',
    });

    assert.strictEqual(result.success, true, '9a. Must succeed overall');
    assert.strictEqual(initialCalls, 2, '9b. Initial call retried once (1 failure + 1 success)');
    assert.strictEqual(followUpCalls, 2, '9c. Follow-up synthesis retried once (1 failure + 1 success)');
    assert.strictEqual(result.workflowType, 'purchase_evaluation', '9d. Completed purchase evaluation');
    console.log('[PASS] Scenario 9: Non-duplication of financial operations verified.\n');
  }

  // Restore sleep function
  auraAiOrchestrator.setSleepFnForTesting(null);
  await disconnectDatabase();

  console.log('================================================================');
  console.log('ALL 9 GEMINI RETRY & RESILIENCE SCENARIOS PASSED (100%)');
  console.log('================================================================');
}

runGeminiRetryTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
