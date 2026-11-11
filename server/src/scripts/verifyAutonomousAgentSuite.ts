import http from 'http';
import { AddressInfo } from 'net';
import mongoose from 'mongoose';
import { app } from '../index';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  ensureDemoUserAlexSeeded,
  ensureDemoMerchantBruceSeeded,
} from '../seed/seedService';
import {
  UserModel,
  GoalModel,
  ScheduledTaskModel,
  CalendarEventModel,
  ConversationModel,
} from '../models';
import { applicationRouteRegistry } from '../services/navigation/applicationRouteRegistry';
import { validateOpenApiContract } from './validateOpenApiContract';
import { channel3Integration } from '../integrations/channel3';
import { gridSelectionService } from '../services/grid/gridSelectionService';

export async function runAutonomousAgentVerificationSuite() {
  console.log('========================================================================');
  console.log('  ASK AURA APPLICATION-WIDE AUTONOMOUS AGENT VERIFICATION SUITE       ');
  console.log('========================================================================\n');

  await connectDatabase();
  const alexUser = await ensureDemoUserAlexSeeded();
  const bruceUser = await ensureDemoMerchantBruceSeeded();

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
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  // 1. Authenticate Alex Sharma (Personal User) and Bruce Wayne (Merchant User)
  const alexAuth = await api('/api/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ persona: 'alex' }),
  });
  if (!alexAuth.data?.token) {
    throw new Error(`Alex login failed: ${JSON.stringify(alexAuth.data)}`);
  }
  const alexToken = alexAuth.data.token;
  const alexUserId = new mongoose.Types.ObjectId(alexAuth.data.user.id || alexAuth.data.user._id);

  const bruceAuth = await api('/api/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ persona: 'bruce' }),
  });
  if (!bruceAuth.data?.token) {
    throw new Error(`Bruce login failed: ${JSON.stringify(bruceAuth.data)}`);
  }
  const bruceToken = bruceAuth.data.token;

  // Create persistent conversation for Alex
  const convRes = await api('/api/conversations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${alexToken}` },
    body: JSON.stringify({ title: 'Autonomous Agent Master Session' }),
  });
  if (!convRes.data?.conversation?._id) {
    throw new Error(`Conversation creation failed: ${JSON.stringify(convRes.data)}`);
  }
  const conversationId = convRes.data.conversation._id;
  console.log(`[Test Harness] Active persistent conversation: ${conversationId}\n`);

  // Helper to send message in persistent session
  async function sendMessage(content: string) {
    return await api(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({ content }),
    });
  }

  // ---------------------------------------------------------------------------
  // TEST A: Autonomous Product Discovery & Shopping Workflows
  // ---------------------------------------------------------------------------
  await test('A', 'Autonomous Product Discovery & Channel3 Search ("I want to buy an ASUS Vivobook 14")', async () => {
    const res = await sendMessage('I want to buy an ASUS Vivobook 14');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction, commerceContext, assistantMessage } = res.data;
    if (!toolAction) {
      throw new Error('Expected toolAction to be returned for product discovery');
    }
    if (toolAction.navTarget !== 'smart-purchases' && toolAction.details?.targetTab !== 'smart-purchases') {
      throw new Error(`Expected navigation target 'smart-purchases', received '${toolAction.navTarget}'`);
    }
    if (!commerceContext?.products || commerceContext.products.length === 0) {
      throw new Error('Expected commerceContext.products to contain retrieved products');
    }
    const hasAsus = commerceContext.products.some((p: any) =>
      p.name.toLowerCase().includes('asus') || p.name.toLowerCase().includes('vivobook') || p.brand?.toLowerCase() === 'asus'
    );
    if (!hasAsus) {
      throw new Error('Expected retrieved products to include ASUS Vivobook');
    }
    const content = assistantMessage?.content || '';
    if (!content.includes('ASUS') && !content.includes('Vivobook')) {
      throw new Error('Assistant explanation did not mention the requested product');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST B: Autonomous Product Filtering
  // ---------------------------------------------------------------------------
  await test('B', 'Autonomous Natural Language Product Filtering ("Show me laptops under ₹70,000 with at least 16GB RAM")', async () => {
    const res = await sendMessage('Show me laptops under ₹70,000 with at least 16GB RAM');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction, commerceContext, assistantMessage } = res.data;
    if (!toolAction) {
      throw new Error('Expected toolAction for product filtering');
    }
    if (toolAction.type !== 'product_filtered') {
      throw new Error(`Expected toolAction.type 'product_filtered', got '${toolAction.type}'`);
    }
    if (toolAction.details?.maxPriceINR !== 70000 || toolAction.details?.minRamGB !== 16) {
      throw new Error(`Filter criteria not parsed correctly: ${JSON.stringify(toolAction.details)}`);
    }
    if (typeof toolAction.details?.matchingCount !== 'number') {
      throw new Error('Expected matchingCount to be reported in filter response');
    }
    const content = assistantMessage?.content || '';
    if (!content.includes('₹70,000') || !content.includes('16GB')) {
      throw new Error('Assistant explanation did not communicate applied filter constraints');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST C: Multi-Product Comparison (3-Way Comparison Table)
  // ---------------------------------------------------------------------------
  await test('C', 'Multi-Product Specification Comparison ("Compare the first three")', async () => {
    const res = await sendMessage('Compare the first three');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const content = res.data.assistantMessage?.content || '';
    // Must contain Markdown comparison table with specs
    if (!content.includes('Specification') || !content.includes('Processor') || !content.includes('RAM')) {
      throw new Error(`Expected side-by-side spec comparison table in assistant message: ${content.slice(0, 200)}`);
    }
    if (!content.includes('Battery') || !content.includes('Price (INR)')) {
      throw new Error('Comparison table missing required hardware dimensions (Battery, Price)');
    }
    if (!content.includes('Trade-Off') && !content.includes('Verdict') && !content.includes('Summary') && !content.includes('Trade-off')) {
      throw new Error('Comparison missing trade-off summary and clear verdict');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST D: Product Recommendation with Trade-Offs
  // ---------------------------------------------------------------------------
  await test('D', 'Product Recommendation & Technical Assessment ("Which would you recommend for programming?")', async () => {
    const res = await sendMessage('Which would you recommend for programming?');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const content = res.data.assistantMessage?.content || '';
    if (!content.includes('recommend') && !content.includes('Recommendation')) {
      throw new Error('Expected recommendation response');
    }
    if (!content.includes('programming') && !content.includes('code') && !content.includes('developer')) {
      throw new Error('Recommendation did not address the programming use-case');
    }
    if (!content.includes('RAM') && !content.includes('Processor')) {
      throw new Error('Recommendation did not evaluate hardware trade-offs for programming');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST E: Financial Affordability Intelligence
  // ---------------------------------------------------------------------------
  await test('E', 'Financial Affordability Evaluation ("Can I afford the second one?")', async () => {
    const res = await sendMessage('Can I afford the second one?');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction, assistantMessage } = res.data;
    if (!toolAction || toolAction.type !== 'affordability_analysed') {
      throw new Error(`Expected toolAction.type 'affordability_analysed', got '${toolAction?.type}'`);
    }
    if (typeof toolAction.details?.canAfford !== 'boolean') {
      throw new Error('Expected canAfford boolean decision in details');
    }
    if (typeof toolAction.details?.liquidCheckingSavingsBalance !== 'number') {
      throw new Error('Expected liquidCheckingSavingsBalance evaluation');
    }
    const content = assistantMessage?.content || '';
    if (!content.includes('Affordability') && !content.includes('afford')) {
      throw new Error('Assistant did not deliver clear affordability explanation');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST F: Checkout Preparation & Merchant Transparency
  // ---------------------------------------------------------------------------
  await test('F', 'Checkout Preparation with Price Revalidation & Merchant Transparency ("I\'ll buy this one")', async () => {
    const res = await sendMessage("I'll buy this one");
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction, assistantMessage } = res.data;
    if (!toolAction || toolAction.type !== 'order_prepared') {
      throw new Error(`Expected toolAction.type 'order_prepared', got '${toolAction?.type}'`);
    }
    if (toolAction.navTarget !== 'smart-purchases' && toolAction.details?.targetTab !== 'smart-purchases') {
      throw new Error('Expected navigation target to smart-purchases storefront checkout');
    }
    if (!toolAction.details?.revalidationPassed) {
      throw new Error('Expected live price/stock revalidation to pass');
    }
    // Must clearly disclose PayPal Sandbox merchant vs original retailer transparency
    const content = assistantMessage?.content || '';
    if (!content.includes('PayPal') || !content.includes('Merchant') || !content.includes('Retailer')) {
      throw new Error('Expected explicit merchant transparency disclosure in order preparation');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST G: Payment Approval Workflow (AI NEVER Moves Funds Autonomously)
  // ---------------------------------------------------------------------------
  await test('G', 'Payment Approval & Explicit User Authorization ("Proceed")', async () => {
    const res = await sendMessage('Proceed');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction, assistantMessage } = res.data;
    if (!toolAction || toolAction.type !== 'payment_prepared') {
      throw new Error(`Expected toolAction.type 'payment_prepared', got '${toolAction?.type}'`);
    }
    // Safety verification: requires explicit user payment approval
    if (toolAction.requiresUserPaymentApproval !== true) {
      throw new Error('CRITICAL SAFETY FAILURE: requiresUserPaymentApproval must be strictly TRUE');
    }
    if (toolAction.details?.approvalStatus !== 'requires_user_approval') {
      throw new Error('Approval status must require explicit user action');
    }
    const content = assistantMessage?.content || '';
    if (!content.includes('Order Summary') && !content.includes('Review') && !content.includes('Authorize')) {
      throw new Error('Complete order summary must be displayed prior to approval');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST H: Financial Goal Creation
  // ---------------------------------------------------------------------------
  await test('H', 'Financial Goal Creation with Monthly Contribution ("I want to save ₹50,000 in six months")', async () => {
    const res = await sendMessage('I want to save ₹50,000 in six months');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction } = res.data;
    if (!toolAction || toolAction.type !== 'goal_created') {
      throw new Error(`Expected toolAction.type 'goal_created', got '${toolAction?.type}'`);
    }
    if (toolAction.navTarget !== 'goals' && toolAction.details?.targetTab !== 'goals') {
      throw new Error('Expected navigation target to goals');
    }
    if (toolAction.details?.targetAmount !== 50000) {
      throw new Error(`Expected targetAmount 50000, got ${toolAction.details?.targetAmount}`);
    }
    // Expected monthly contribution: 50,000 / 6 = 8,333
    if (toolAction.details?.monthlyContribution !== 8333) {
      throw new Error(`Expected monthlyContribution 8333, got ${toolAction.details?.monthlyContribution}`);
    }

    // Verify persisted directly in GoalModel
    const dbGoal = await GoalModel.findOne({ userId: alexUserId, targetAmount: 50000 });
    if (!dbGoal) {
      throw new Error('Goal was not found in database GoalModel collection');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST I: Financial Goal Modification
  // ---------------------------------------------------------------------------
  await test('I', 'Goal Target Modification & Recalculation ("Change the target to ₹60,000")', async () => {
    const res = await sendMessage('Change the target to ₹60,000');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction } = res.data;
    if (!toolAction || toolAction.type !== 'goal_updated') {
      throw new Error(`Expected toolAction.type 'goal_updated', got '${toolAction?.type}'`);
    }
    if (toolAction.details?.targetAmount !== 60000) {
      throw new Error(`Expected updated targetAmount 60000, got ${toolAction.details?.targetAmount}`);
    }
    // Expected recalculated monthly contribution: 60,000 / 6 = 10,000
    if (toolAction.details?.monthlyContribution !== 10000) {
      throw new Error(`Expected recalculated monthlyContribution 10000, got ${toolAction.details?.monthlyContribution}`);
    }

    // Verify update in MongoDB
    const updatedGoal = await GoalModel.findOne({ userId: alexUserId, targetAmount: 60000 });
    if (!updatedGoal) {
      throw new Error('Updated goal target ₹60,000 not persisted in MongoDB');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST J: Calendar & Scheduling Integration
  // ---------------------------------------------------------------------------
  await test('J', 'Durable Calendar Scheduling ("Remind me to review my savings every month")', async () => {
    const res = await sendMessage('Remind me to review my savings every month');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction } = res.data;
    if (!toolAction || toolAction.type !== 'reminder_scheduled') {
      throw new Error(`Expected toolAction.type 'reminder_scheduled', got '${toolAction?.type}'`);
    }
    if (toolAction.navTarget !== 'calendar' && toolAction.details?.targetTab !== 'calendar') {
      throw new Error('Expected navigation target to calendar');
    }

    // Verify scheduled task created in ScheduledTaskModel
    const task = await ScheduledTaskModel.findOne({
      userId: alexUserId,
      title: /Savings Review/i,
    });
    if (!task) {
      throw new Error('Scheduled task not found in ScheduledTaskModel');
    }
    if (task.scheduleType !== 'recurring' || task.recurrenceRule !== 'monthly') {
      throw new Error(`Expected recurring monthly schedule, got: ${task.scheduleType} / ${task.recurrenceRule}`);
    }

    // Verify calendar event created in CalendarEventModel
    const calEvent = await CalendarEventModel.findOne({
      userId: alexUserId,
      name: /Savings Review/i,
    });
    if (!calEvent) {
      throw new Error('Linked calendar event not found in CalendarEventModel');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST K: Transaction Spending Analysis & AG Grid Control
  // ---------------------------------------------------------------------------
  await test('K', 'Transaction Spending Analysis & AG Grid Control ("Show my largest expenses this month")', async () => {
    const res = await sendMessage('Show my largest expenses this month');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction } = res.data;
    if (!toolAction) {
      throw new Error('Expected toolAction for transaction analysis');
    }
    if (toolAction.navTarget !== 'transactions' && toolAction.details?.targetTab !== 'transactions') {
      throw new Error('Expected navigation target to transactions');
    }
    const hasFieldAmount = toolAction.details?.field === 'amount' && toolAction.details?.direction === 'desc';
    const hasSortModel = Array.isArray(toolAction.details?.sortModel) && toolAction.details.sortModel.some((s: any) => s.colId === 'amount' && s.sort === 'desc');
    if (!hasFieldAmount && !hasSortModel) {
      throw new Error(`Expected AG Grid sort by amount desc, got: ${JSON.stringify(toolAction.details)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST L: Application Controls (Theme Switching)
  // ---------------------------------------------------------------------------
  await test('L', 'Application Controls ("Switch to dark mode")', async () => {
    const res = await sendMessage('Switch to dark mode');
    if (!res.ok || !res.data.success) {
      throw new Error(`Message failed: ${JSON.stringify(res.data)}`);
    }

    const { toolAction } = res.data;
    if (!toolAction || toolAction.type !== 'theme_changed') {
      throw new Error(`Expected toolAction.type 'theme_changed', got '${toolAction?.type}'`);
    }
    if (toolAction.details?.theme !== 'dark') {
      throw new Error(`Expected theme 'dark', got '${toolAction.details?.theme}'`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST M: Conversation Continuity across Navigation
  // ---------------------------------------------------------------------------
  await test('M', 'Conversation Continuity & Route Registry Integration', async () => {
    // 1. Check conversation history in database
    const conv = await ConversationModel.findById(conversationId);
    if (!conv) {
      throw new Error('Conversation document not found');
    }
    // Verify commerceContext persisted on conversation
    if (!conv.commerceContext || !Array.isArray(conv.commerceContext.products)) {
      throw new Error('commerceContext not persisted on conversation document');
    }

    // 2. Check route registry API endpoint
    const routesRes = await api('/api/navigation/routes', {
      headers: { Authorization: `Bearer ${alexToken}` },
    });
    if (!routesRes.ok || !routesRes.data?.routes || routesRes.data.routes.length < 10) {
      throw new Error(`Failed to retrieve route registry: ${JSON.stringify(routesRes.data)}`);
    }
    const routes = routesRes.data.routes;
    const requiredRoutes = ['overview', 'accounts', 'transactions', 'goals', 'commitments', 'financial-planning', 'calendar', 'smart-purchases', 'payments', 'settings', 'developer', 'family'];
    for (const rId of requiredRoutes) {
      const exists = routes.some((r: any) => r.id === rId || r.navTabId === rId);
      if (!exists) {
        throw new Error(`Missing expected application route: ${rId}`);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // TEST N: Security & Multi-User Isolation (Personal vs Merchant Access)
  // ---------------------------------------------------------------------------
  await test('N', 'Strict Multi-User Security & Merchant Hub Access Control', async () => {
    // 1. Personal user (Alex Sharma) MUST be rejected with HTTP 403 Forbidden
    const alexMerchantAttempt = await api('/api/ecommerce/merchant/overview', {
      headers: { Authorization: `Bearer ${alexToken}` },
    });
    if (alexMerchantAttempt.status !== 403) {
      throw new Error(`SECURITY BREACH: Personal user was not denied Merchant Hub with HTTP 403 (Status: ${alexMerchantAttempt.status})`);
    }
    if (alexMerchantAttempt.data?.code !== 'MERCHANT_VERIFICATION_REQUIRED') {
      throw new Error(`Expected error code MERCHANT_VERIFICATION_REQUIRED, got: ${alexMerchantAttempt.data?.code}`);
    }

    // 2. Verified PayPal Business user (Bruce Wayne) MUST be authorized with HTTP 200 OK
    const bruceMerchantAttempt = await api('/api/ecommerce/merchant/overview', {
      headers: { Authorization: `Bearer ${bruceToken}` },
    });
    if (bruceMerchantAttempt.status !== 200 || !bruceMerchantAttempt.data?.success) {
      throw new Error(`Verified business merchant was rejected from Merchant Hub (Status: ${bruceMerchantAttempt.status})`);
    }
    if (!bruceMerchantAttempt.data?.overview) {
      throw new Error('Merchant overview payload missing from authorized merchant response');
    }
  });

  // ---------------------------------------------------------------------------
  // TEST O: Regression Defense (Channel3, APIMatic, AG Grid, PayPal)
  // ---------------------------------------------------------------------------
  await test('O', 'Comprehensive Regression Defense across AURA Ecosystem', async () => {
    // 1. Channel3 client search functionality
    const channel3Search = await channel3Integration.searchProducts({ query: 'laptop', limit: 3 });
    if (!Array.isArray(channel3Search.products) || channel3Search.products.length === 0) {
      throw new Error('Channel3 client failed to return product results');
    }

    // 2. AG Grid selection service
    const sampleSelection = await gridSelectionService.getAuthorizedSelectionContext(String(alexUserId), {
      source: 'transactions',
      gridId: 'transactions-grid',
      selectedIds: [],
    });
    if (sampleSelection.source !== 'transactions') {
      throw new Error('AG Grid selection context resolution failed');
    }

    // 3. APIMatic OpenAPI contract validity
    const contractValidation = await validateOpenApiContract();
    if (!contractValidation.valid) {
      throw new Error(`OpenAPI Contract validation failed: ${contractValidation.errors.join(', ')}`);
    }
  });

  // ---------------------------------------------------------------------------
  // SUMMARY & CLEANUP
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`  VERIFICATION RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log('========================================================================\n');

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await disconnectDatabase();

  if (passed !== total) {
    console.error(`Autonomous Agent test suite completed with ${total - passed} failures.`);
    process.exit(1);
  } else {
    console.log('All 15 Autonomous Agent verification scenarios PASSED successfully.\n');
  }
}

// Execute standalone if called directly
if (require.main === module || process.argv[1]?.includes('verifyAutonomousAgentSuite')) {
  runAutonomousAgentVerificationSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
