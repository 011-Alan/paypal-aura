import assert from 'assert';
import { app } from '../index';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ensureDemoUserAlexSeeded, DEMO_ALEX_CREDENTIALS } from '../seed/seedService';

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

async function runSuite() {
  console.log('================================================================================');
  console.log('PROJECT AURA — End-to-End Integration, Security & 10-Sponsor Workflow Test Suite');
  console.log('================================================================================');

  await connectDatabase();
  await ensureDemoUserAlexSeeded(true);

  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4055;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  let authToken = '';
  let paymentRequestId = '';
  let approvalToken = '';
  let paypalOrderId = '';
  let calendarEventId = '';
  let goalId = '';

  const results: TestResult[] = [];

  async function runTest(name: string, fn: () => Promise<void>) {
    const start = Date.now();
    try {
      await fn();
      const durationMs = Date.now() - start;
      results.push({ name, passed: true, durationMs });
      console.log(`  [PASS] ${name} (${durationMs}ms)`);
    } catch (err: any) {
      const durationMs = Date.now() - start;
      results.push({ name, passed: false, durationMs, error: err?.message });
      console.error(`  [FAIL] ${name}: ${err?.message}`);
    }
  }

  async function api(path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };
    if (authToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const resp = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const body: any = await resp.json().catch(() => ({}));
    return { status: resp.status, body };
  }

  // 1. Health & Database Check
  await runTest('1. Health Check & MongoDB Connectivity (/api/health)', async () => {
    const { status, body } = await api('/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'healthy');
    assert.strictEqual(body.database.status, 'healthy');
  });

  // 2. Authentication & Security Gate
  await runTest('2. Reject Unauthenticated Access with 401 (/api/auth/me)', async () => {
    const resp = await fetch(`${baseUrl}/auth/me`);
    assert.strictEqual(resp.status, 401);
  });

  await runTest('3. Authenticate Demo User Alex Sharma with Argon2id Password (/api/auth/login)', async () => {
    const { status, body } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: DEMO_ALEX_CREDENTIALS.email,
        password: DEMO_ALEX_CREDENTIALS.password,
      }),
    });
    assert.strictEqual(status, 200);
    assert.ok(body.token, 'JWT token must be returned');
    assert.strictEqual(body.user.passwordHash, undefined, 'passwordHash must never be leaked');
    assert.strictEqual(body.user.pinHash, undefined, 'pinHash must never be leaked');
    authToken = body.token;
  });

  // 3. Accounts & Privacy Check
  await runTest('4. Retrieve Alex Financial Accounts & Verify Family Privacy Isolation (/api/accounts)', async () => {
    const { status, body } = await api('/accounts');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.accounts.length, 3);
    const leakedPriya = body.accounts.some((a: any) => a.name.includes('Priya'));
    assert.strictEqual(leakedPriya, false, 'Priya private account must never be exposed to Alex');
  });

  // 4. AG Grid Analytics & Natural Language Query
  await runTest('5. Sponsor 1 (AG Grid): Natural-Language Dining Expenditure Over Last 3 Months', async () => {
    const { status, body } = await api('/transactions/ag-grid-query', {
      method: 'POST',
      body: JSON.stringify({
        query: 'Show my dining expenditure over the last three months.',
      }),
    });
    assert.strictEqual(status, 200);
    assert.ok(body.agGrid.rowCount >= 4, 'Should return Alex multi-month dining transactions');
    assert.ok(body.agGrid.summaryRow.totalExpense > 0, 'Total dining expense must be calculated from backend');
    assert.ok(body.agGrid.appliedFilterModel.categoryFilter.includes('Dining'));
  });

  // 5. CSV Import & Render Post-Import Background Pipeline
  await runTest('6. CSV Statement Import & Render Post-Import Analysis Pipeline (/api/transactions/import-csv)', async () => {
    const csvContent = `date,merchant,description,category,type,amount,paymentMethod,isRecurring\n2026-11-01,Organic Harvest Store,Monthly Organic Groceries,Groceries,expense,1950,upi,false`;
    const { status, body } = await api('/transactions/import-csv', {
      method: 'POST',
      body: JSON.stringify({ csvContent }),
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.importedCount, 1);
    assert.strictEqual(body.backgroundWorkerPipeline.status, 'completed');
  });

  // 6. Recurring Mandates & Confirmation
  await runTest('7. Recurring Mandate Detection & Confirmation (/api/mandates)', async () => {
    const { status, body } = await api('/mandates');
    assert.strictEqual(status, 200);
    assert.ok(body.mandates.length >= 6);
    const rentMandate = body.mandates.find((m: any) => m.category === 'Rent');
    assert.ok(rentMandate, 'Rent mandate of ₹8,000 due on 1st must be present');
    assert.strictEqual(rentMandate.amount, 8000);
    assert.strictEqual(rentMandate.dueDayOfMonth, 1);

    const inferred = body.mandates.find((m: any) => m.status === 'inferred');
    if (inferred) {
      const conf = await api(`/mandates/${inferred._id}/confirm`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'confirmed' }),
      });
      assert.strictEqual(conf.status, 200);
      assert.strictEqual(conf.body.mandate.status, 'confirmed');
    }
  });

  // 7. Sponsor 4 (Bryntum Financial Life Calendar) & Bidirectional Mandate Rescheduling
  await runTest('8. Sponsor 4 (Bryntum): Financial Life Calendar & Bidirectional Mandate Sync (/api/calendar)', async () => {
    const { status, body } = await api('/calendar');
    assert.strictEqual(status, 200);
    assert.ok(body.supportedViews.includes('month'));
    assert.ok(body.supportedViews.includes('week'));
    assert.ok(body.supportedViews.includes('day'));
    assert.ok(body.supportedViews.includes('agenda'));
    assert.ok(body.events.length >= 6);

    const linkedEv = body.events.find((e: any) => e.linkedMandateId);
    assert.ok(linkedEv, 'Should have calendar event linked to a recurring mandate');
    calendarEventId = linkedEv.id;

    const resched = await api(`/calendar/events/${calendarEventId}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ newStartDate: '2026-11-06' }),
    });
    assert.strictEqual(resched.status, 200);
    assert.strictEqual(resched.body.updatedMandate.dueDayOfMonth, 6);
  });

  // 8. Sponsor 6 (Elastic Financial Memory & MongoDB Truth Validation)
  await runTest('9. Sponsor 6 (Elastic): Natural-Language Holiday Travel Search & MongoDB Validation (/api/elastic/search)', async () => {
    const { status, body } = await api('/elastic/search', {
      method: 'POST',
      body: JSON.stringify({
        query: 'How much did I spend on travel during my last holiday?',
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.validatedAgainstMongoDB, true);
    assert.strictEqual(body.summary.matchedTransactionCount, 3);
    assert.strictEqual(body.summary.verifiedTotalExpense, 31400); // 11400 + 16800 + 3200
    const leakedPriya = body.transactions.some((t: any) => t.description.includes('Priya'));
    assert.strictEqual(leakedPriya, false, 'Elastic search must strictly enforce user ownership & family privacy');
  });

  // 9. Workflow A: Sponsor 5 (Channel3 Smart Purchase Companion) + Sponsor 3 (Astropods)
  await runTest('10. Workflow A & Sponsor 5 (Channel3): Can I Afford a Laptop for ₹55,000? (/api/ai/ask & /api/purchase/evaluate)', async () => {
    const { status, body } = await api('/ai/ask', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Can I afford a laptop for ₹55,000?',
        includeKernelResearch: true,
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.workflowType, 'purchase_evaluation');
    assert.strictEqual(body.astropodsOrchestration.primaryAgent, 'purchase-intelligence');
    assert.ok(body.purchaseCompanion.evaluatedProducts.length > 0);
    assert.ok(body.explanation.includes('18,000'));
  });

  // 10. Workflow B & F: Monthly Financial Plan & Recovery via Python Analytics Engine
  await runTest('11. Workflow B & F (Python Pandas/Scikit-Learn + Financial Planner & Recovery Agent)', async () => {
    const { status, body } = await api('/plans/generate', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.plan.totalIncome, 95000);
    assert.ok(body.plan.allocations.length >= 6);
  });

  // 11. Goals & Zapier Milestone Automation
  await runTest('12. Financial Goals Contribution & Zapier Milestone Trigger (/api/goals)', async () => {
    const listRes = await api('/goals');
    assert.strictEqual(listRes.status, 200);
    const emergencyGoal =
      listRes.body.goals.find((g: any) => g.title.includes('Emergency Resilience Fund')) ||
      listRes.body.goals[0];
    goalId = emergencyGoal._id;

    const contribRes = await api(`/goals/${goalId}/contribute`, {
      method: 'PATCH',
      body: JSON.stringify({ amount: 15000 }),
    });
    assert.strictEqual(contribRes.status, 200);
    assert.strictEqual(contribRes.body.newlyReachedMilestone, 75);
  });

  // 12. Family Finance Privacy Boundary Verification
  await runTest('13. Family Finance Overview & Strict Privacy Boundary Enforcement (/api/family)', async () => {
    const { status, body } = await api('/family');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.privacyBoundaryPolicy.enforced, true);
    const leakedPrivateTx = body.sharedTransactions.some((t: any) => !t.isSharedFamilyTransaction);
    assert.strictEqual(leakedPrivateTx, false, 'Non-shared transactions must never appear in family view');
  });

  // 13. Sponsor 7 (KERNEL Controlled Browser Automation & Security Policy)
  await runTest('14. Sponsor 7 (KERNEL): Assisted Research & Block Credential/MFA Bypass Attempts (/api/kernel/research)', async () => {
    const allowedRes = await api('/kernel/research', {
      method: 'POST',
      body: JSON.stringify({ topic: 'ASUS VivoBook 16 warranty and power specs' }),
    });
    assert.strictEqual(allowedRes.status, 200);
    assert.ok(allowedRes.body.research.structuredFindings.length > 0);

    const blockedRes = await api('/kernel/research', {
      method: 'POST',
      body: JSON.stringify({ topic: 'enter bank password and bypass captcha for auto-pay checkout' }),
    });
    assert.strictEqual(blockedRes.status, 400, 'Must block password/CAPTCHA/auto-pay requests');
  });

  // 14. Workflow E: Controlled PayPal Sandbox Execution + Financial Guardian + Argon2id PIN + APIMatic + Webhook
  await runTest('15. Workflow E Step 1: Prepare Payment & Financial Guardian Check (/api/payments/prepare)', async () => {
    const { status, body } = await api('/payments/prepare', {
      method: 'POST',
      body: JSON.stringify({
        recipientName: 'Greenwood Residency Landlords',
        merchantCategory: 'Rent',
        description: 'Prepare a payment of ₹5,000',
        amountInr: 5000,
      }),
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.paymentRequest.status, 'guardian_approved');
    assert.strictEqual(body.paymentRequest.guardianEvaluation.passed, true);
    paymentRequestId = body.paymentRequest._id;
  });

  await runTest('16. Workflow E Step 2a: Block Order Creation Without PIN Approval Token', async () => {
    const { status } = await api(`/payments/${paymentRequestId}/paypal-order`, {
      method: 'POST',
      body: JSON.stringify({ approvalToken: 'forged-invalid-token' }),
    });
    assert.strictEqual(status, 400);
  });

  await runTest('17. Workflow E Step 2b: Reject Incorrect Argon2id PIN with 401', async () => {
    const { status } = await api(`/payments/${paymentRequestId}/verify-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin: '9999' }),
    });
    assert.strictEqual(status, 401);
  });

  await runTest('18. Workflow E Step 2c: Verify Valid Argon2id PIN & Issue Short-Lived Approval Token', async () => {
    const { status, body } = await api(`/payments/${paymentRequestId}/verify-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin: DEMO_ALEX_CREDENTIALS.pin }),
    });
    assert.strictEqual(status, 200);
    assert.ok(body.approvalToken);
    approvalToken = body.approvalToken;
  });

  await runTest('19. Workflow E Step 3: Create PayPal Sandbox Order v2 (Validated by APIMatic Contract)', async () => {
    const { status, body } = await api(`/payments/${paymentRequestId}/paypal-order`, {
      method: 'POST',
      body: JSON.stringify({ approvalToken }),
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(body.paypalOrder.apimaticValidation.valid, true);
    assert.ok(body.paypalOrder.orderId);
    paypalOrderId = body.paypalOrder.orderId;
  });

  await runTest('20. Workflow E Step 4: Capture Approved PayPal Order & Sync MongoDB, Elastic, Bryntum & Zapier', async () => {
    const { status, body } = await api(`/payments/${paymentRequestId}/paypal-capture`, {
      method: 'POST',
      body: JSON.stringify({ paypalOrderId }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.paymentRequest.status, 'captured');
    assert.strictEqual(body.transaction.amount, 5000);
    assert.strictEqual(body.transaction.paymentMethod, 'paypal');

    // Verify idempotency on second capture call
    const secondCall = await api(`/payments/${paymentRequestId}/paypal-capture`, {
      method: 'POST',
      body: JSON.stringify({ paypalOrderId }),
    });
    assert.strictEqual(secondCall.status, 200);
    assert.strictEqual(secondCall.body.alreadyCaptured, true);
  });

  await runTest('21. Workflow E Step 5: Verify PayPal Webhook Signature (/api/webhooks/paypal)', async () => {
    const { status, body } = await api('/webhooks/paypal', {
      method: 'POST',
      body: JSON.stringify({
        id: 'WH-SBX-TEST-001',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        paymentRequestId,
        paypalOrderId,
        resource: {
          id: 'CAP-SBX-001',
          status: 'COMPLETED',
          supplementary_data: {
            related_ids: { order_id: paypalOrderId },
          },
        },
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.verified, true);
    assert.strictEqual(body.paymentRequestStatus, 'webhook_verified');
  });

  // 15. Sponsor 9 & 10: Render Background Workflows & Zapier Automations + All 10 Integrations Status
  await runTest('22. Sponsor 9 & 10: Render Daily Worker, Zapier Automations & 10-Sponsor Status Matrix', async () => {
    const workerRes = await api('/workers/run-daily', { method: 'POST' });
    assert.strictEqual(workerRes.status, 200);
    assert.strictEqual(workerRes.body.workerRun.status, 'completed');

    const statusRes = await api('/integrations/status');
    assert.strictEqual(statusRes.status, 200);
    const ints = statusRes.body.integrations;
    assert.ok(ints.agGrid && ints.apimatic && ints.astropods && ints.bryntum && ints.channel3);
    assert.ok(ints.elastic && ints.kernel && ints.paypal && ints.render && ints.zapier);
  });

  server.close();
  await disconnectDatabase();

  const passedCount = results.filter((r) => r.passed).length;
  console.log('================================================================================');
  console.log(`Test Summary: ${passedCount}/${results.length} Passed`);
  console.log('================================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
