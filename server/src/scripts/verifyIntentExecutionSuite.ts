import http from 'http';
import { AddressInfo } from 'net';
import mongoose from 'mongoose';
import { app } from '../index';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  ensureDemoUserAlexSeeded,
  ensureDemoMerchantBruceSeeded,
} from '../seed/seedService';
import { applicationIntentClassifier } from '../services/ai/applicationIntentClassifier';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { GoalModel, ScheduledTaskModel } from '../models';

export async function runIntentExecutionVerificationSuite() {
  console.log('========================================================================');
  console.log('  ASK AURA INTENT EXECUTION & COMPONENT HANDOFF VERIFICATION SUITE      ');
  console.log('========================================================================\n');

  await connectDatabase();
  const alexSeed = await ensureDemoUserAlexSeeded();
  const alexUser = alexSeed.user;
  const bruceSeed = await ensureDemoMerchantBruceSeeded();
  const bruceUser = bruceSeed.user;

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[Test Harness] Ephemeral test server running at ${baseUrl}\n`);

  let passed = 0;
  let total = 0;

  async function test(id: string, name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(` [✓] Test ${id}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(` [✗] Test ${id}: ${name} FAILED:`, err.message);
    }
  }

  // Helper HTTP fetch wrapper
  async function api(path: string, options: any = {}): Promise<{ status: number; ok: boolean; data: any }> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  }

  // Log in as Alex
  const loginRes = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'alex.chen@example.com', password: 'Password123!' }),
  });
  const alexToken = loginRes.data?.token || '';

  // 1. PROMPT 1: "Take me to Commerce and search for ASUS Vivobook 14."
  await test('01', 'Prompt 1: "Take me to Commerce and search for ASUS Vivobook 14." executes search & navigation', async () => {
    const prompt = 'Take me to Commerce and search for ASUS Vivobook 14.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'COMMERCE_PRODUCT_DISCOVERY') {
      throw new Error(`Expected COMMERCE_PRODUCT_DISCOVERY, got ${classified.intent}`);
    }
    if (classified.extractedRequirements?.productQuery !== 'ASUS Vivobook 14') {
      throw new Error(`Expected productQuery "ASUS Vivobook 14", got "${classified.extractedRequirements?.productQuery}"`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'smart-purchases') {
      throw new Error(`Expected navTarget 'smart-purchases', got ${res.toolAction?.navTarget}`);
    }
    const hasSearchStep = res.toolAction?.workflowSteps?.some((s: any) => s.type === 'SEARCH_PRODUCTS');
    if (!hasSearchStep) {
      throw new Error(`Expected workflowSteps with SEARCH_PRODUCTS, got ${JSON.stringify(res.toolAction?.workflowSteps)}`);
    }
    // Must NOT contain markdown navigation links like [Commerce](/smart-purchases)
    if (/\[.*?\]\(\/smart-purchases\)/.test(res.explanation)) {
      throw new Error(`Response must not return markdown navigation links`);
    }
  });

  // 2. PROMPT 2: "Find me a laptop under ₹70,000."
  await test('02', 'Prompt 2: "Find me a laptop under ₹70,000." applies price filter to Commerce', async () => {
    const prompt = 'Find me a laptop under ₹70,000.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'COMMERCE_PRODUCT_FILTERING') {
      throw new Error(`Expected COMMERCE_PRODUCT_FILTERING, got ${classified.intent}`);
    }
    if (classified.extractedRequirements?.maxPrice !== 70000) {
      throw new Error(`Expected maxPrice 70000, got ${classified.extractedRequirements?.maxPrice}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'smart-purchases') {
      throw new Error(`Expected navTarget 'smart-purchases', got ${res.toolAction?.navTarget}`);
    }
    const hasFilterStep = res.toolAction?.workflowSteps?.some((s: any) => s.type === 'FILTER_PRODUCTS');
    if (!hasFilterStep) {
      throw new Error(`Expected workflowSteps with FILTER_PRODUCTS`);
    }
  });

  // 3. PROMPT 3: "Compare the first three products."
  await test('03', 'Prompt 3: "Compare the first three products." executes comparison without navigating away', async () => {
    // Provide 3 mock context products
    const mockContext = {
      lastSearchQuery: 'laptops',
      products: [
        { id: 'p1', name: 'ASUS Vivobook 14', priceInr: 54990, brand: 'ASUS' },
        { id: 'p2', name: 'Lenovo IdeaPad Slim 3', priceInr: 48990, brand: 'Lenovo' },
        { id: 'p3', name: 'Dell Inspiron 15', priceInr: 61990, brand: 'Dell' },
      ],
      recommendedProductId: 'p1',
    };

    const prompt = 'Compare the first three products.';
    const classified = applicationIntentClassifier.classify(prompt, { commerceContext: mockContext as any });
    if (classified.intent !== 'COMMERCE_PRODUCT_COMPARISON') {
      throw new Error(`Expected COMMERCE_PRODUCT_COMPARISON, got ${classified.intent}`);
    }
    if (classified.shouldNavigate !== false) {
      throw new Error(`Comparison should not navigate away`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
      commerceContext: mockContext as any,
    });

    if (res.workflowType !== 'purchase_evaluation') {
      throw new Error(`Expected purchase_evaluation workflow, got ${res.workflowType}`);
    }
  });

  // 4. PROMPT 4: "Which one would you recommend?"
  await test('04', 'Prompt 4: "Which one would you recommend?" provides reasoned recommendation', async () => {
    const mockContext = {
      lastSearchQuery: 'laptops',
      products: [
        { id: 'p1', name: 'ASUS Vivobook 14', priceInr: 54990, brand: 'ASUS' },
        { id: 'p2', name: 'Lenovo IdeaPad Slim 3', priceInr: 48990, brand: 'Lenovo' },
      ],
      recommendedProductId: 'p1',
    };

    const prompt = 'Which one would you recommend?';
    const classified = applicationIntentClassifier.classify(prompt, { commerceContext: mockContext as any });
    if (classified.intent !== 'COMMERCE_PRODUCT_RECOMMENDATION') {
      throw new Error(`Expected COMMERCE_PRODUCT_RECOMMENDATION, got ${classified.intent}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
      commerceContext: mockContext as any,
    });

    if (!res.explanation.toLowerCase().includes('recommend')) {
      throw new Error(`Explanation should contain recommendation advice`);
    }
  });

  // 5. PROMPT 5: "Open Financial Goals."
  await test('05', 'Prompt 5: "Open Financial Goals." performs pure navigation to Goals', async () => {
    const prompt = 'Open Financial Goals.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'APP_NAVIGATION') {
      throw new Error(`Expected APP_NAVIGATION, got ${classified.intent}`);
    }
    if (classified.navTarget !== 'goals') {
      throw new Error(`Expected navTarget 'goals', got ${classified.navTarget}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'goals') {
      throw new Error(`Expected navTarget 'goals', got ${res.toolAction?.navTarget}`);
    }
  });

  // 6. PROMPT 6: "Create a goal to save ₹50,000 in six months."
  await test('06', 'Prompt 6: "Create a goal to save ₹50,000 in six months." creates goal & handoff', async () => {
    const prompt = 'Create a goal to save ₹50,000 in six months.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'GOAL_CREATION') {
      throw new Error(`Expected GOAL_CREATION, got ${classified.intent}`);
    }
    if (classified.goalRequirements?.targetAmount !== 50000) {
      throw new Error(`Expected targetAmount 50000, got ${classified.goalRequirements?.targetAmount}`);
    }
    if (classified.goalRequirements?.durationMonths !== 6) {
      throw new Error(`Expected durationMonths 6, got ${classified.goalRequirements?.durationMonths}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.type !== 'goal_created') {
      throw new Error(`Expected toolAction type 'goal_created', got ${res.toolAction?.type}`);
    }
    const hasGoalStep = res.toolAction?.workflowSteps?.some((s: any) => s.type === 'REFRESH_GOALS');
    if (!hasGoalStep) {
      throw new Error(`Expected workflowSteps with REFRESH_GOALS`);
    }

    // Verify goal exists in DB
    const savedGoal = await GoalModel.findOne({ userId: alexUser._id, targetAmount: 50000 }).sort({ createdAt: -1 });
    if (!savedGoal) {
      throw new Error(`Goal was not persisted in database`);
    }
  });

  // 7. PROMPT 7: "Open Transactions and show purchases above ₹5,000."
  await test('07', 'Prompt 7: "Open Transactions and show purchases above ₹5,000." filters transactions grid', async () => {
    const prompt = 'Open Transactions and show purchases above ₹5,000.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'TRANSACTION_FILTERING') {
      throw new Error(`Expected TRANSACTION_FILTERING, got ${classified.intent}`);
    }
    if (classified.actionDetails?.minAmount !== 5000) {
      throw new Error(`Expected minAmount 5000, got ${classified.actionDetails?.minAmount}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'transactions') {
      throw new Error(`Expected navTarget 'transactions', got ${res.toolAction?.navTarget}`);
    }
    const hasFilterTxStep = res.toolAction?.workflowSteps?.some((s: any) => s.type === 'FILTER_TRANSACTIONS');
    if (!hasFilterTxStep) {
      throw new Error(`Expected workflowSteps with FILTER_TRANSACTIONS`);
    }
  });

  // 8. PROMPT 8: "Show my upcoming bills."
  await test('08', 'Prompt 8: "Show my upcoming bills." navigates to Commitments & refreshes', async () => {
    const prompt = 'Show my upcoming bills.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'BILL_INQUIRY') {
      throw new Error(`Expected BILL_INQUIRY, got ${classified.intent}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'commitments') {
      throw new Error(`Expected navTarget 'commitments', got ${res.toolAction?.navTarget}`);
    }
    const hasBillStep = res.toolAction?.workflowSteps?.some((s: any) => s.type === 'REFRESH_BILLS');
    if (!hasBillStep) {
      throw new Error(`Expected workflowSteps with REFRESH_BILLS`);
    }
  });

  // 9. PROMPT 9: "Open Calendar and schedule a monthly savings review."
  await test('09', 'Prompt 9: "Open Calendar and schedule a monthly savings review." schedules task & handoff', async () => {
    const prompt = 'Open Calendar and schedule a monthly savings review.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'RECURRING_SCHEDULE') {
      throw new Error(`Expected RECURRING_SCHEDULE, got ${classified.intent}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'calendar') {
      throw new Error(`Expected navTarget 'calendar', got ${res.toolAction?.navTarget}`);
    }
    const hasCalStep = res.toolAction?.workflowSteps?.some((s: any) => s.type === 'REFRESH_CALENDAR');
    if (!hasCalStep) {
      throw new Error(`Expected workflowSteps with REFRESH_CALENDAR`);
    }

    // Verify task exists in DB
    const savedTask = await ScheduledTaskModel.findOne({ userId: alexUser._id, scheduleType: 'recurring' }).sort({ createdAt: -1 });
    if (!savedTask) {
      throw new Error(`Scheduled task was not persisted in database`);
    }
  });

  // 10. PROMPT 10: "Switch to dark mode."
  await test('10', 'Prompt 10: "Switch to dark mode." triggers theme change', async () => {
    const prompt = 'Switch to dark mode.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'APP_THEME_CHANGE') {
      throw new Error(`Expected APP_THEME_CHANGE, got ${classified.intent}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.type !== 'theme_changed') {
      throw new Error(`Expected toolAction type 'theme_changed', got ${res.toolAction?.type}`);
    }
    if (res.toolAction?.details?.theme !== 'dark') {
      throw new Error(`Expected theme 'dark', got ${res.toolAction?.details?.theme}`);
    }
  });

  // 11. EDGE CASE 1: Navigation-only: "Take me to Settings"
  await test('11', 'Edge Case 1: Pure navigation "Take me to Settings" has no spurious tool runs', async () => {
    const prompt = 'Take me to Settings';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'APP_NAVIGATION' || classified.navTarget !== 'settings') {
      throw new Error(`Expected APP_NAVIGATION to settings, got ${classified.intent} -> ${classified.navTarget}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'settings') {
      throw new Error(`Expected navTarget 'settings', got ${res.toolAction?.navTarget}`);
    }
  });

  // 12. EDGE CASE 2: Non-navigation conceptual question: "What is an emergency fund?"
  await test('12', 'Edge Case 2: Conceptual question "What is an emergency fund?" answers without navigation', async () => {
    const prompt = 'What is an emergency fund?';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'CONCEPT_EXPLANATION') {
      throw new Error(`Expected CONCEPT_EXPLANATION, got ${classified.intent}`);
    }
    if (classified.shouldNavigate !== false) {
      throw new Error(`Conceptual explanation should not navigate`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget) {
      throw new Error(`Conceptual explanation should have no navTarget, got ${res.toolAction?.navTarget}`);
    }
    if (!res.explanation.toLowerCase().includes('emergency fund')) {
      throw new Error(`Expected educational explanation of emergency fund`);
    }
  });

  // 13. EDGE CASE 3: Clarification on ambiguous query
  await test('13', 'Edge Case 3: Vague query "Can you help?" produces polite assistance without crashing', async () => {
    const prompt = 'Can you help?';
    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (!res.explanation || res.explanation.length < 10) {
      throw new Error(`Expected conversational response to ambiguous request`);
    }
  });

  // 14. EDGE CASE 4: Unauthorized merchant request by personal account
  await test('14', 'Edge Case 4: Personal account accessing Merchant Hub is securely rejected', async () => {
    const prompt = 'Take me to Merchant Hub';
    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(), // alexUser is PERSONAL, unverified merchant
      prompt,
      conversationHistory: [],
    });

    if (!res.explanation.toLowerCase().includes('merchant') && !res.explanation.toLowerCase().includes('business')) {
      throw new Error(`Expected explanation regarding merchant access requirement`);
    }
  });

  // 15. EDGE CASE 5: Idempotency
  await test('15', 'Edge Case 5: Repeated command executes idempotently and deterministically', async () => {
    const prompt = 'Take me to Commerce and search for ASUS Vivobook 14.';
    const res1 = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });
    const res2 = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res1.toolAction?.navTarget !== res2.toolAction?.navTarget) {
      throw new Error(`Idempotency violated: navTarget differs (${res1.toolAction?.navTarget} vs ${res2.toolAction?.navTarget})`);
    }
    if (res1.toolAction?.workflowSteps?.length !== res2.toolAction?.workflowSteps?.length) {
      throw new Error(`Idempotency violated: workflowSteps length differs`);
    }
  });

  // Cleanup
  server.close();
  await disconnectDatabase();

  console.log('\n========================================================================');
  console.log(`  VERIFICATION RESULTS: ${passed}/${total} TESTS PASSED               `);
  console.log('========================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runIntentExecutionVerificationSuite().catch((err) => {
    console.error('Fatal execution suite error:', err);
    process.exit(1);
  });
}
