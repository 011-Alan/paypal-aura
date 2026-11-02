import assert from 'assert';
import http from 'http';
import { app } from '../index';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ensureDemoUserAlexSeeded, DEMO_ALEX_CREDENTIALS } from '../seed/seedService';
import { astropodsIntegration, AuraAgentId } from '../integrations/astropods';

function createMockAstropodsPod(port: number, agentId: AuraAgentId): Promise<http.Server> {
  const pendingStreams = new Map<string, http.ServerResponse>();
  const completedOutputs = new Map<string, string>();

  const srv = http.createServer((req, res) => {
    const rawUrl = req.url || '';
    const cleanUrl = rawUrl.split('?')[0];

    if (req.method === 'GET' && cleanUrl === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', reachable: true }));
      return;
    }

    if (req.method === 'POST' && cleanUrl === '/api/conversations') {
      const convId = `conv-${agentId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation_id: convId, id: convId }));
      return;
    }

    const streamMatch = cleanUrl.match(/^\/api\/conversations\/([^/]+)\/stream$/);
    if (req.method === 'GET' && streamMatch) {
      const convId = streamMatch[1];
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
      res.write(': connected\n\n');

      const existingOutput = completedOutputs.get(convId);
      if (existingOutput) {
        res.write(
          `data: ${JSON.stringify({
            type: 'chunk',
            chunk_type: 'delta',
            content: existingOutput,
          })}\n\n`
        );
        res.write(
          `data: ${JSON.stringify({
            type: 'chunk',
            chunk_type: 'finish',
            content: '',
          })}\n\n`
        );
        res.end();
        completedOutputs.delete(convId);
      } else {
        pendingStreams.set(convId, res);
      }
      return;
    }

    const msgMatch = cleanUrl.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (req.method === 'POST' && msgMatch) {
      const convId = msgMatch[1];
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          let payload = parsed;
          if (typeof parsed.content === 'string') {
            try {
              payload = JSON.parse(parsed.content);
            } catch {
              payload = parsed;
            }
          }
          const input = payload.input || {};
          const output = (astropodsIntegration as any).computeVerifiedDeterministicFallback(agentId, input);
          const outputStr = JSON.stringify(output);

          const streamRes = pendingStreams.get(convId);
          if (streamRes) {
            streamRes.write(
              `data: ${JSON.stringify({
                type: 'chunk',
                chunk_type: 'delta',
                content: outputStr,
              })}\n\n`
            );
            streamRes.write(
              `data: ${JSON.stringify({
                type: 'chunk',
                chunk_type: 'finish',
                content: '',
              })}\n\n`
            );
            streamRes.end();
            pendingStreams.delete(convId);
          } else {
            completedOutputs.set(convId, outputStr);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'sent' }));
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e?.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise<http.Server>((resolve) => {
    srv.listen(port, '127.0.0.1', () => resolve(srv));
    srv.on('error', () => {
      resolve(srv);
    });
  });
}

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

  // Spin up mock web adapters for the 6 Astropods blueprints on ports 3110..3115
  const podServers: http.Server[] = [];
  const podConfigs: Array<{ port: number; agentId: AuraAgentId }> = [
    { port: 3110, agentId: 'financial-planner' },
    { port: 3111, agentId: 'transaction-intelligence' },
    { port: 3112, agentId: 'mandate-intelligence' },
    { port: 3113, agentId: 'financial-recovery' },
    { port: 3114, agentId: 'purchase-intelligence' },
    { port: 3115, agentId: 'financial-guardian' },
  ];

  for (const cfg of podConfigs) {
    try {
      const s = await createMockAstropodsPod(cfg.port, cfg.agentId);
      podServers.push(s);
    } catch {
      // Ignore if cannot bind
    }
  }

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

  // 16. Astropods 6-Agent Architecture, Remote Execution & Edge Cases (Tests 23-32)
  await runTest('23. Astropods 6-Agent Blueprint Registry & Live Pod Availability (/api/ai/agents/availability)', async () => {
    const agentsRes = await api('/ai/agents');
    assert.strictEqual(agentsRes.status, 200);
    assert.strictEqual(agentsRes.body.agents.length, 6);
    for (const a of agentsRes.body.agents) {
      assert.strictEqual(a.canExecutePayments, false, `Agent ${a.id} must never have payment execution authority`);
      assert.ok(a.blueprintName.startsWith('aura-'));
    }

    const availRes = await api('/ai/agents/availability');
    assert.strictEqual(availRes.status, 200);
    assert.strictEqual(availRes.body.agentHealthChecks['financial-planner'].reachable, true);
    assert.strictEqual(availRes.body.agentHealthChecks['transaction-intelligence'].reachable, true);
    assert.strictEqual(availRes.body.agentHealthChecks['mandate-intelligence'].reachable, true);
    assert.strictEqual(availRes.body.agentHealthChecks['financial-recovery'].reachable, true);
    assert.strictEqual(availRes.body.agentHealthChecks['purchase-intelligence'].reachable, true);
    assert.strictEqual(availRes.body.agentHealthChecks['financial-guardian'].reachable, true);
  });

  await runTest('24. Astropods Workflow A: Remote Execution of Agent 1 (aura-financial-planner)', async () => {
    const { status, body } = await api('/ai/agents/financial-planner/invoke', {
      method: 'POST',
      body: JSON.stringify({
        task: 'Generate realistic monthly financial plan for Alex Sharma',
        input: {
          monthlyIncome: 85000,
          totalCommitments: 31398,
          upcomingCommitments: [{ title: 'Rent', amount: 8000 }, { title: 'Insurance & Bills', amount: 23398 }],
          financialGoals: [{ title: 'Emergency Fund', monthlyContribution: 15000 }],
        },
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.invocation.blueprintName, 'aura-financial-planner');
    assert.strictEqual(body.invocation.remoteExecuted, true);
    assert.strictEqual(body.invocation.transport, 'astropods_web_adapter');
    assert.strictEqual(body.invocation.validationPassed, true);
    assert.ok(body.invocation.output.financialPlan);
    assert.ok(Array.isArray(body.invocation.output.recommendedAllocations));
    assert.ok(Array.isArray(body.invocation.output.suggestedNextActions));
  });

  await runTest('25. Astropods Workflow B: Remote Execution of Agent 2 (aura-transaction-intelligence)', async () => {
    const { status, body } = await api('/ai/agents/transaction-intelligence/invoke', {
      method: 'POST',
      body: JSON.stringify({
        task: 'Analyse transactions and detect anomalies',
        input: {
          monthlyIncome: 85000,
          transactions: [
            { merchant: 'Greenwood Residency', category: 'Rent', amount: 8000, type: 'expense' },
            { merchant: 'Luxury Electronics MegaStore', category: 'Shopping', amount: 18500, type: 'expense', isUnusual: true },
          ],
        },
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.invocation.blueprintName, 'aura-transaction-intelligence');
    assert.strictEqual(body.invocation.remoteExecuted, true);
    assert.strictEqual(body.invocation.transport, 'astropods_web_adapter');
    assert.strictEqual(body.invocation.validationPassed, true);
    assert.ok(Array.isArray(body.invocation.output.transactionClassifications));
    assert.ok(Array.isArray(body.invocation.output.anomalyObservations));
    assert.ok(body.invocation.output.anomalyObservations.length >= 1);
  });

  await runTest('26. Astropods Workflow C: Remote Execution of Agent 3 (aura-mandate-intelligence)', async () => {
    const { status, body } = await api('/ai/agents/mandate-intelligence/invoke', {
      method: 'POST',
      body: JSON.stringify({
        task: 'Evaluate recurring commitments and subscriptions',
        input: {
          mandates: [
            { title: 'Greenwood Rent', merchant: 'Greenwood', category: 'Rent', amount: 8000, dueDayOfMonth: 1, status: 'confirmed' },
            { title: 'ACT Fibernet', merchant: 'ACT', category: 'Internet', amount: 1199, dueDayOfMonth: 10, status: 'confirmed' },
          ],
        },
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.invocation.blueprintName, 'aura-mandate-intelligence');
    assert.strictEqual(body.invocation.remoteExecuted, true);
    assert.strictEqual(body.invocation.transport, 'astropods_web_adapter');
    assert.strictEqual(body.invocation.validationPassed, true);
    assert.ok(Array.isArray(body.invocation.output.recurringCommitments));
    assert.strictEqual(body.invocation.output.recurringCommitments.length, 2);
  });

  await runTest('27. Astropods Workflow D: Remote Execution of Agent 4 (aura-financial-recovery)', async () => {
    const { status, body } = await api('/ai/agents/financial-recovery/invoke', {
      method: 'POST',
      body: JSON.stringify({
        task: 'Suggest empathetic recovery plan after dining overrun',
        input: {
          monthlyIncome: 85000,
          totalCommitments: 31398,
          allocations: [{ category: 'Dining', allocatedAmount: 6000, spentAmount: 9500 }],
          goals: [{ title: 'Emergency Fund', targetAmount: 100000, currentAmount: 60000, monthlyContribution: 10000 }],
        },
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.invocation.blueprintName, 'aura-financial-recovery');
    assert.strictEqual(body.invocation.remoteExecuted, true);
    assert.strictEqual(body.invocation.transport, 'astropods_web_adapter');
    assert.strictEqual(body.invocation.validationPassed, true);
    assert.ok(body.invocation.output.recoveryPlan);
    assert.ok(Array.isArray(body.invocation.output.suggestedAdjustments));
  });

  await runTest('28. Astropods Workflow E: Remote Execution of Agent 5 (aura-purchase-intelligence)', async () => {
    const { status, body } = await api('/ai/agents/purchase-intelligence/invoke', {
      method: 'POST',
      body: JSON.stringify({
        task: 'Evaluate affordability of ₹54,990 laptop',
        input: {
          query: 'ASUS VivoBook 16 laptop',
          monthlyIncomeInr: 85000,
          availableDiscretionaryBudgetInr: 18000,
          upcomingCommitmentsInr: 31398,
          products: [{ id: 'ch3-1', name: 'ASUS VivoBook 16', priceInr: 54990 }],
        },
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.invocation.blueprintName, 'aura-purchase-intelligence');
    assert.strictEqual(body.invocation.remoteExecuted, true);
    assert.strictEqual(body.invocation.transport, 'astropods_web_adapter');
    assert.strictEqual(body.invocation.validationPassed, true);
    assert.strictEqual(body.invocation.output.affordabilityAssessment.canInitiatePurchase, false);
    assert.ok(Array.isArray(body.invocation.output.productComparisons));
  });

  await runTest('29. Astropods Workflow F: Remote Execution of Agent 6 (aura-financial-guardian)', async () => {
    const { status, body } = await api('/ai/agents/financial-guardian/invoke', {
      method: 'POST',
      body: JSON.stringify({
        task: 'Review proposed payment of ₹35,000 exceeding ₹25,000 single transaction limit',
        input: {
          actionType: 'payment_preparation',
          amountInr: 35000,
          recipientName: 'High Value Merchant',
          merchantCategory: 'Shopping',
          accountBalanceInr: 85000,
          spentTodayInr: 0,
          policy: {
            singleTransactionLimit: 25000,
            dailySpendingLimit: 50000,
            blockedCategories: ['Gambling'],
          },
        },
      }),
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.invocation.blueprintName, 'aura-financial-guardian');
    assert.strictEqual(body.invocation.remoteExecuted, true);
    assert.strictEqual(body.invocation.transport, 'astropods_web_adapter');
    assert.strictEqual(body.invocation.validationPassed, true);
    assert.strictEqual(body.invocation.output.riskAssessment.riskLevel, 'critical');
    assert.ok(body.invocation.output.reasonsForRejection.length >= 1);
  });

  await runTest('30. Edge Cases 1-4: Invalid Input, Missing Financial Info, Untrusted Output & Over-Budget Rejection', async () => {
    // Missing monthlyIncome for Financial Planner must return 400
    const missingRes = await api('/ai/agents/financial-planner/invoke', {
      method: 'POST',
      body: JSON.stringify({ task: 'Plan without income', input: {} }),
    });
    assert.strictEqual(missingRes.status, 400);

    // Invalid negative amountInr for Financial Guardian must return 400
    const negRes = await api('/ai/agents/financial-guardian/invoke', {
      method: 'POST',
      body: JSON.stringify({ task: 'Negative payment', input: { amountInr: -500 } }),
    });
    assert.strictEqual(negRes.status, 400);

    // Over-budget recommendation from untrusted agent output must be rejected by validator
    const overBudgetCheck = astropodsIntegration.parseAndValidateAgentOutput(
      'financial-planner',
      JSON.stringify({
        financialPlan: {},
        recommendedAllocations: [{ category: 'Luxury', recommendedAmount: 250000 }],
        risks: [],
        explanations: 'Over budget',
        suggestedNextActions: [],
      }),
      { monthlyIncome: 85000 }
    );
    assert.strictEqual(overBudgetCheck.valid, false);
    assert.ok(overBudgetCheck.errors.some((e) => e.includes('Over-budget recommendation rejected')));
  });

  await runTest('31. Edge Cases 5-7: Credential/PIN Stripping, Duplicate Idempotency & Concurrent Coalescing', async () => {
    // Verify sensitive fields (password, pin, token, rawAccountNumber) are stripped before reaching agent
    const { sanitized, strippedKeys } = astropodsIntegration.validateAndSanitizeAgentInput(
      'financial-planner',
      {
        monthlyIncome: 85000,
        passwordHash: 'secret-argon2-hash',
        pin: '4826',
        accessToken: 'jwt-secret-token',
        accountNumber: '123456789012',
      }
    );
    assert.strictEqual(sanitized.passwordHash, undefined);
    assert.strictEqual(sanitized.pin, undefined);
    assert.strictEqual(sanitized.accessToken, undefined);
    assert.strictEqual(sanitized.accountNumber, undefined);
    assert.strictEqual(strippedKeys.length, 4);

    // Verify concurrent and duplicate requests with same idempotencyKey
    const [r1, r2] = await Promise.all([
      api('/ai/agents/financial-planner/invoke', {
        method: 'POST',
        body: JSON.stringify({
          task: 'Concurrent plan check',
          idempotencyKey: 'idem-plan-test-001',
          input: { monthlyIncome: 85000, totalCommitments: 31398 },
        }),
      }),
      api('/ai/agents/financial-planner/invoke', {
        method: 'POST',
        body: JSON.stringify({
          task: 'Concurrent plan check',
          idempotencyKey: 'idem-plan-test-001',
          input: { monthlyIncome: 85000, totalCommitments: 31398 },
        }),
      }),
    ]);
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r1.body.invocation.validationPassed, true);
    assert.strictEqual(r2.body.invocation.validationPassed, true);
  });

  await runTest('32. Edge Cases 8-10: Unauthorized Payment Execution Attempts Blocked & Essential Bill Protection', async () => {
    // Attempting to instruct an agent to execute a payment or bypass PIN must be blocked immediately
    const unauthorizedInputRes = await api('/ai/agents/financial-guardian/invoke', {
      method: 'POST',
      body: JSON.stringify({
        task: 'Force payment execution',
        input: { amountInr: 5000, executePaymentNow: true, bypassPinVerification: true },
      }),
    });
    assert.strictEqual(unauthorizedInputRes.status, 400);

    // Agent output attempting to claim payment execution authority must be rejected by validator
    const rogueAgentOutputCheck = astropodsIntegration.parseAndValidateAgentOutput(
      'financial-guardian',
      JSON.stringify({
        riskAssessment: {},
        validationObservations: [],
        approvalRecommendation: { canAuthorizeOrExecutePayment: true },
        reasonsForRejection: [],
      }),
      { amountInr: 5000 }
    );
    assert.strictEqual(rogueAgentOutputCheck.valid, false);
    assert.ok(rogueAgentOutputCheck.errors.some((e) => e.includes('CRITICAL SECURITY VIOLATION')));

    // Recovery agent output attempting to cut Rent must be rejected by validator
    const unsafeRecoveryCheck = astropodsIntegration.parseAndValidateAgentOutput(
      'financial-recovery',
      JSON.stringify({
        recoveryPlan: {},
        suggestedAdjustments: [{ category: 'Rent', recommendedReduction: 4000 }],
        revisedGoalProjections: [],
        explanations: 'Cut rent',
      }),
      { monthlyIncome: 85000 }
    );
    assert.strictEqual(unsafeRecoveryCheck.valid, false);
    assert.ok(unsafeRecoveryCheck.errors.some((e) => e.includes('Unsafe recovery adjustment rejected')));
  });

  // 17. Persistent Conversations System & Context Retention
  await runTest('33. Persistent Conversations Lifecycle & Context Retention (/api/conversations)', async () => {
    // Create new conversation
    const createRes = await api('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: 'Retirement & Long Term Planning' }),
    });
    assert.strictEqual(createRes.status, 201);
    const convId = createRes.body.conversation._id;
    assert.ok(convId);

    // Send first turn
    const msg1Res = await api(`/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'I want to save ₹30,000 for emergency resilience.' }),
    });
    assert.strictEqual(msg1Res.status, 200);
    assert.strictEqual(msg1Res.body.userMessage.content, 'I want to save ₹30,000 for emergency resilience.');
    assert.ok(msg1Res.body.assistantMessage.content.length > 10);

    // Send follow-up turn (testing context retention)
    const msg2Res = await api(`/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Can you explain it more simply?' }),
    });
    assert.strictEqual(msg2Res.status, 200);
    assert.ok(msg2Res.body.assistantMessage.content.length > 10);

    // Retrieve conversation with message history
    const getRes = await api(`/conversations/${convId}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.messages.length, 4); // 2 user + 2 assistant

    // Search conversations
    const searchRes = await api('/conversations?q=Retirement');
    assert.strictEqual(searchRes.status, 200);
    assert.ok(searchRes.body.conversations.some((c: any) => c._id === convId));

    // Rename conversation
    const renameRes = await api(`/conversations/${convId}`, {
      method: 'PUT',
      body: JSON.stringify({ title: 'Resilience Strategy' }),
    });
    assert.strictEqual(renameRes.status, 200);
    assert.strictEqual(renameRes.body.conversation.title, 'Resilience Strategy');

    // Delete conversation
    const delRes = await api(`/conversations/${convId}`, { method: 'DELETE' });
    assert.strictEqual(delRes.status, 200);
  });

  // 18. Financial Profile Management
  await runTest('34. Financial Profile Management & Source Distinction (/api/user/financial-profile)', async () => {
    // Get financial profile
    const getProfile = await api('/user/financial-profile');
    assert.strictEqual(getProfile.status, 200);
    assert.ok(getProfile.body.profile);

    // Update financial profile with income, source level, and frequency
    const updateProfile = await api('/user/financial-profile', {
      method: 'PUT',
      body: JSON.stringify({
        monthlyIncome: 105000,
        incomeType: 'freelance',
        incomeFrequency: 'monthly',
        expectedIncomeDate: 5,
        additionalIncome: 12000,
        incomeStatus: 'user_estimate',
        preferredCurrency: 'INR',
      }),
    });
    assert.strictEqual(updateProfile.status, 200);
    assert.strictEqual(updateProfile.body.profile.monthlyIncome, 105000);
    assert.strictEqual(updateProfile.body.profile.incomeType, 'freelance');
    assert.strictEqual(updateProfile.body.profile.incomeStatus, 'user_estimate');
  });

  server.close();
  for (const s of podServers) {
    try {
      s.close();
    } catch {}
  }
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
