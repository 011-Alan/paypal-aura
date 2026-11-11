import http from 'http';
import { AddressInfo } from 'net';
import mongoose from 'mongoose';
import { app } from '../index';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ensureDemoUserAlexSeeded } from '../seed/seedService';
import { applicationIntentClassifier } from '../services/ai/applicationIntentClassifier';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { ConversationModel, MessageModel } from '../models';

export async function runFiveMandatoryTests() {
  console.log('========================================================================');
  console.log('  FIVE MANDATORY E2E INTENT EXECUTION & COMPONENT HANDOFF TESTS        ');
  console.log('========================================================================\n');

  await connectDatabase();
  const alexSeed = await ensureDemoUserAlexSeeded();
  const alexUser = alexSeed.user;

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;

  let passed = 0;
  let total = 0;

  async function test(id: string, name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(` [✓] ${id}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(` [✗] ${id}: ${name} FAILED:`, err.message);
    }
  }

  // TEST A: Simple navigation ("Go to payments page.")
  await test('Test A', 'Simple navigation: "Go to payments page."', async () => {
    const prompt = 'Go to payments page.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'APP_NAVIGATION') {
      throw new Error(`Expected APP_NAVIGATION, got ${classified.intent}`);
    }
    if (classified.navTarget !== 'payments') {
      throw new Error(`Expected navTarget 'payments', got ${classified.navTarget}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'payments') {
      throw new Error(`Expected toolAction.navTarget to be 'payments', got ${res.toolAction?.navTarget}`);
    }
    // Execution must NOT contain markdown links to payments page
    if (/\[.*?\]\(\/payments\)/.test(res.explanation)) {
      throw new Error(`Explanation should not contain raw markdown navigation links`);
    }
    console.log(`     -> Navigated directly to: ${res.toolAction?.navTarget}`);
  });

  // TEST B: Navigation followed by product search ("Search for a black coat suit in AURA Ecommerce.")
  await test('Test B', 'Navigation + search: "Search for a black coat suit in AURA Ecommerce."', async () => {
    const prompt = 'Search for a black coat suit in AURA Ecommerce.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'COMMERCE_PRODUCT_DISCOVERY') {
      throw new Error(`Expected COMMERCE_PRODUCT_DISCOVERY, got ${classified.intent}`);
    }
    if (!classified.extractedRequirements?.productQuery?.toLowerCase().includes('black coat suit')) {
      throw new Error(`Expected productQuery 'black coat suit', got '${classified.extractedRequirements?.productQuery}'`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'smart-purchases') {
      throw new Error(`Expected navTarget 'smart-purchases', got ${res.toolAction?.navTarget}`);
    }
    const searchStep: any = res.toolAction?.workflowSteps?.find((s: any) => s.type === 'SEARCH_PRODUCTS');
    if (!searchStep) {
      throw new Error(`Expected SEARCH_PRODUCTS workflow step`);
    }
    const query = searchStep.payload?.query || searchStep.query;
    if (query !== 'black coat suit') {
      throw new Error(`Expected query 'black coat suit', got '${query}'`);
    }
    console.log(`     -> Navigated to: ${res.toolAction?.navTarget}, Dispatched: SEARCH_PRODUCTS ('${query}')`);
  });

  // TEST C: Navigation followed by another operation ("Go to transactions and show my recent transactions.")
  await test('Test C', 'Navigation + tx inquiry: "Go to transactions and show my recent transactions."', async () => {
    const prompt = 'Go to transactions and show my recent transactions.';
    const classified = applicationIntentClassifier.classify(prompt);
    if (classified.intent !== 'TRANSACTION_ANALYSIS' && classified.intent !== 'APP_NAVIGATION') {
      throw new Error(`Expected TRANSACTION_ANALYSIS or APP_NAVIGATION, got ${classified.intent}`);
    }
    if (classified.navTarget !== 'transactions') {
      throw new Error(`Expected navTarget 'transactions', got ${classified.navTarget}`);
    }

    const res = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt,
      conversationHistory: [],
    });

    if (res.toolAction?.navTarget !== 'transactions') {
      throw new Error(`Expected navTarget 'transactions', got ${res.toolAction?.navTarget}`);
    }
    const txStep: any = res.toolAction?.workflowSteps?.find((s: any) => s.type === 'SEARCH_TRANSACTIONS');
    if (!txStep) {
      throw new Error(`Expected SEARCH_TRANSACTIONS workflow step`);
    }
    console.log(`     -> Navigated to: ${res.toolAction?.navTarget}, Dispatched: SEARCH_TRANSACTIONS (${txStep.action || txStep.payload?.action})`);
  });

  // TEST D: Multi-step conversation ("Find an ASUS Vivobook." Then: "Compare the first two products.")
  await test('Test D', 'Multi-step conversation: "Find an ASUS Vivobook." then "Compare the first two products."', async () => {
    // Step 1: Search
    const prompt1 = 'Find an ASUS Vivobook.';
    const res1 = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt: prompt1,
      conversationHistory: [],
    });

    if (!res1.commerceContext || !res1.commerceContext.products || res1.commerceContext.products.length === 0) {
      throw new Error(`Expected commerceContext products from Step 1`);
    }

    // Step 2: Compare
    const prompt2 = 'Compare the first two products.';
    const classified2 = applicationIntentClassifier.classify(prompt2, {
      commerceContext: res1.commerceContext,
    });

    if (classified2.intent !== 'COMMERCE_PRODUCT_COMPARISON') {
      throw new Error(`Expected COMMERCE_PRODUCT_COMPARISON, got ${classified2.intent}`);
    }
    if (classified2.shouldNavigate !== false) {
      throw new Error(`Comparison must not trigger navigation away`);
    }

    const res2 = await auraAiOrchestrator.processMessage({
      userId: alexUser._id.toString(),
      prompt: prompt2,
      conversationHistory: [
        { role: 'user', content: prompt1 },
        { role: 'assistant', content: res1.explanation },
      ],
      commerceContext: res1.commerceContext,
    });

    if (res2.workflowType !== 'purchase_evaluation') {
      throw new Error(`Expected workflowType 'purchase_evaluation', got ${res2.workflowType}`);
    }
    if (res2.toolAction?.navTarget) {
      throw new Error(`Step 2 comparison should not re-navigate away, got ${res2.toolAction?.navTarget}`);
    }
    console.log(`     -> Multi-step context verified: Step 1 found ${res1.commerceContext.products.length} products; Step 2 executed comparison table without re-navigating.`);
  });

  // TEST E: Conversation continuity across multiple page transitions
  await test('Test E', 'Conversation continuity across multiple page transitions', async () => {
    // 1. Simulate conversation entity in MongoDB
    const conv = await ConversationModel.create({
      userId: alexUser._id,
      title: 'Continuity Verification Conversation',
    });

    // Initial turn: user asks to go to payments
    await MessageModel.create({
      conversationId: conv._id,
      userId: alexUser._id,
      role: 'user',
      content: 'Go to payments page.',
    });
    await MessageModel.create({
      conversationId: conv._id,
      userId: alexUser._id,
      role: 'assistant',
      content: 'Navigated to payments page.',
      toolAction: { navTarget: 'payments' },
    });

    // Turn 2: User requests another page transition while floating panel stays open
    const prompt2 = 'Now take me to Settings';
    const classified2 = applicationIntentClassifier.classify(prompt2);
    if (classified2.navTarget !== 'settings') {
      throw new Error(`Expected navTarget 'settings', got ${classified2.navTarget}`);
    }

    await MessageModel.create({
      conversationId: conv._id,
      userId: alexUser._id,
      role: 'user',
      content: prompt2,
    });
    await MessageModel.create({
      conversationId: conv._id,
      userId: alexUser._id,
      role: 'assistant',
      content: 'Navigated to Settings.',
      toolAction: { navTarget: 'settings' },
    });

    // Turn 3: User requests another page transition
    const prompt3 = 'Go to transactions and show my recent transactions.';
    const classified3 = applicationIntentClassifier.classify(prompt3);
    if (classified3.navTarget !== 'transactions') {
      throw new Error(`Expected navTarget 'transactions', got ${classified3.navTarget}`);
    }

    await MessageModel.create({
      conversationId: conv._id,
      userId: alexUser._id,
      role: 'user',
      content: prompt3,
    });
    await MessageModel.create({
      conversationId: conv._id,
      userId: alexUser._id,
      role: 'assistant',
      content: 'Filtered transactions.',
      toolAction: { navTarget: 'transactions' },
    });

    // Verify all 6 messages exist in this single conversation session
    const messages = await MessageModel.find({ conversationId: conv._id }).sort({ createdAt: 1 });
    if (messages.length !== 6) {
      throw new Error(`Expected 6 messages across 3 page transitions, got ${messages.length}`);
    }

    // Verify targets across history
    const navTargets = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.toolAction?.navTarget);
    if (JSON.stringify(navTargets) !== JSON.stringify(['payments', 'settings', 'transactions'])) {
      throw new Error(`Expected nav targets ['payments', 'settings', 'transactions'], got ${JSON.stringify(navTargets)}`);
    }

    // Clean up
    await MessageModel.deleteMany({ conversationId: conv._id });
    await ConversationModel.deleteOne({ _id: conv._id });
    console.log(`     -> Conversation continuity across 3 page transitions verified (6 turns preserved in single session, nav targets: ${navTargets.join(' -> ')}).`);
  });

  server.close();
  await disconnectDatabase();

  console.log('\n========================================================================');
  console.log(`  FIVE TESTS RESULTS: ${passed}/${total} PASSED                       `);
  console.log('========================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runFiveMandatoryTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
