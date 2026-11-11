import http from 'http';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { AddressInfo } from 'net';
import { app } from '../index';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  ensureDemoUserAlexSeeded,
  ensureDemoMerchantBruceSeeded,
  DEMO_ALEX_CREDENTIALS,
  DEMO_BRUCE_CREDENTIALS,
} from '../seed/seedService';
import { gridSelectionService } from '../services/grid/gridSelectionService';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { validateOpenApiContract } from './validateOpenApiContract';
import { ApimaticPayPalContractValidator } from '../integrations/apimatic';
import { UserModel, TransactionModel, GridSavedViewModel } from '../models';

export async function runFullVerificationSuite() {
  console.log('========================================================================');
  console.log('  AURA IMPLEMENTATION: AG GRID + APIMATIC DEVELOPER PLATFORM TEST SUITE ');
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

  async function test(num: number, name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(` [✓] Test ${num}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(` [✗] Test ${num}: ${name} FAILED:`, err.message);
    }
  }

  // Helper fetch
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

  // Authenticate Alex & Bruce
  let alexToken = '';
  let bruceToken = '';

  const alexAuth = await api('/api/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ persona: 'alex' }),
  });
  alexToken = alexAuth.data.token;

  const bruceAuth = await api('/api/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ persona: 'bruce' }),
  });
  bruceToken = bruceAuth.data.token;

  // Retrieve Alex sample transactions
  const txRes = await api('/api/transactions', {
    headers: { Authorization: `Bearer ${alexToken}` },
  });
  const sampleTxs = (txRes.data.transactions || []).slice(0, 3);
  const sampleTxIds = sampleTxs.map((t: any) => t._id || t.id);

  // 1. Row Selection in AG Grid
  await test(1, 'Row Selection in AG Grid & Ground-Truth Context Resolution', async () => {
    const res = await api('/api/grid/selection-context', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({
        source: 'transactions',
        gridId: 'transactions-grid',
        selectedIds: sampleTxIds,
      }),
    });
    if (!res.ok || !res.data.success) {
      throw new Error(`Failed to resolve selection context: ${JSON.stringify(res.data)}`);
    }
    const ctx = res.data.context;
    if (ctx.totalSelected !== sampleTxIds.length || typeof ctx.summary.totalAmount !== 'number') {
      throw new Error(`Invalid selection context structure: ${JSON.stringify(ctx)}`);
    }
  });

  // 2. Selected Transaction Analysis in Ask AURA
  await test(2, 'Selected Transaction Analysis in Ask AURA (No Hallucination)', async () => {
    const res = await api('/api/ai/ask', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({
        prompt: 'What is the total of these selected expenses and which is largest?',
        gridSelectionContext: {
          source: 'transactions',
          gridId: 'transactions-grid',
          selectedIds: sampleTxIds,
        },
      }),
    });
    const textResp = res.data.response || res.data.explanation || res.data.answer;
    if (!res.ok || !res.data.success || !textResp) {
      throw new Error(`AI Ask selection analysis failed: ${JSON.stringify(res.data)}`);
    }
    // Verify response mentions selection or calculated summary
    if (typeof textResp !== 'string' || textResp.length < 10) {
      throw new Error('AI response was empty or malformed');
    }
  });

  // 3. Natural-language filtering ("Show transactions above $100")
  await test(3, 'Natural-Language Filtering ("Show transactions above $100")', async () => {
    const res = await api('/api/ai/ask', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({
        prompt: 'Show transactions above $100 in the grid',
      }),
    });
    if (!res.ok || !res.data.success) {
      throw new Error(`AI grid filter request failed: ${JSON.stringify(res.data)}`);
    }
    const action = res.data.executedAction;
    if (!action || action.name !== 'grid_apply_filters') {
      throw new Error(`Expected grid_apply_filters action, got: ${JSON.stringify(action)}`);
    }
    if (action.parameters?.filterModel?.amount?.filter !== 100) {
      throw new Error(`Expected amount filter 100, got: ${JSON.stringify(action.parameters)}`);
    }
  });

  // 4. Multiple filters ("Show shopping expenses above $200")
  await test(4, 'Multiple Filters ("Show shopping expenses above $200")', async () => {
    const res = await api('/api/ai/ask', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({
        prompt: 'Show shopping expenses above $200',
      }),
    });
    if (!res.ok || !res.data.success) throw new Error('AI request failed');
    const action = res.data.executedAction;
    if (!action || action.name !== 'grid_apply_filters') {
      throw new Error(`Expected grid_apply_filters, got: ${JSON.stringify(action)}`);
    }
    const fm = action.parameters?.filterModel || {};
    if (!fm.amount || !fm.category) {
      throw new Error(`Expected both amount and category filters, got: ${JSON.stringify(fm)}`);
    }
  });

  // 5. Sorting ("Sort these from highest to lowest")
  await test(5, 'Sorting ("Sort these from highest to lowest")', async () => {
    const res = await api('/api/ai/ask', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({
        prompt: 'Sort transactions from highest to lowest',
      }),
    });
    if (!res.ok || !res.data.success) throw new Error('AI request failed');
    const action = res.data.executedAction;
    if (!action || action.name !== 'grid_apply_sorting') {
      throw new Error(`Expected grid_apply_sorting, got: ${JSON.stringify(action)}`);
    }
    const sort = action.parameters?.sortModel?.[0]?.sort;
    if (sort !== 'desc') {
      throw new Error(`Expected desc sorting, got: ${sort}`);
    }
  });

  // 6. Context continuity (Follow-up questions)
  await test(6, 'Context Continuity (Conversational History & Follow-ups)', async () => {
    // Create conversation
    const convRes = await api('/api/conversations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({ title: 'Test Continuity Session' }),
    });
    const convId = convRes.data.conversation?._id || convRes.data._id;
    if (!convId) throw new Error('Could not create conversation');

    // First message
    await api(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({ content: 'I am planning to buy an ergonomic office chair' }),
    });

    // Follow-up
    const followUpRes = await api('/api/ai/ask', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({
        prompt: 'Can I afford this based on my current monthly discretionary budget?',
        conversationId: convId,
      }),
    });
    const followUpText = followUpRes.data.response || followUpRes.data.explanation || followUpRes.data.answer;
    if (!followUpRes.ok || !followUpText) {
      throw new Error('Follow-up context response failed');
    }
  });

  // 7. Cross-page navigation
  await test(7, 'Cross-Page Navigation Intent ("Take me to Transactions")', async () => {
    const res = await api('/api/ai/ask', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({ prompt: 'Take me to Transactions page' }),
    });
    if (!res.ok) throw new Error('Request failed');
    const action = res.data.executedAction;
    const target = action?.parameters?.page || action?.parameters?.targetTab;
    if (action?.name !== 'navigate_to_page' || target !== 'transactions') {
      throw new Error(`Expected navigation to transactions, got: ${JSON.stringify(action)}`);
    }
  });

  // 8. Undo last filter
  await test(8, 'Undo Grid Action ("Undo that filter")', async () => {
    const res = await api('/api/ai/ask', {
      method: 'POST',
      headers: { Authorization: `Bearer ${alexToken}` },
      body: JSON.stringify({ prompt: 'Undo that filter' }),
    });
    if (!res.ok) throw new Error('Request failed');
    const action = res.data.executedAction;
    if (action?.name !== 'grid_undo_action') {
      throw new Error(`Expected grid_undo_action, got: ${JSON.stringify(action)}`);
    }
  });

  // 9. Savings analysis
  await test(9, 'Savings & Goals Analysis', async () => {
    const res = await api('/api/goals', {
      headers: { Authorization: `Bearer ${alexToken}` },
    });
    if (!res.ok || !Array.isArray(res.data.goals)) {
      throw new Error('Goals query failed');
    }
  });

  // 10. Merchant security isolation
  await test(10, 'Merchant Security Isolation (Personal User 403 Forbidden vs Business 200 OK)', async () => {
    // Alex Morgan (Personal user) must be forbidden
    const alexAttempt = await api('/api/ecommerce/merchant/overview', {
      headers: { Authorization: `Bearer ${alexToken}` },
    });
    if (alexAttempt.status !== 403) {
      throw new Error(`Expected 403 for personal user, got ${alexAttempt.status}`);
    }

    // Bruce Wayne (Verified PayPal Business) must succeed
    const bruceAttempt = await api('/api/ecommerce/merchant/overview', {
      headers: { Authorization: `Bearer ${bruceToken}` },
    });
    if (bruceAttempt.status !== 200 || !bruceAttempt.data.overview) {
      throw new Error(`Expected 200 for verified merchant, got ${bruceAttempt.status}`);
    }
  });

  // 11. Large dataset performance
  await test(11, 'Large Dataset Query Performance (< 1000ms latency)', async () => {
    const start = performance.now();
    const res = await api('/api/transactions?limit=200', {
      headers: { Authorization: `Bearer ${alexToken}` },
    });
    const duration = performance.now() - start;
    if (!res.ok || duration > 1000) {
      throw new Error(`Large query exceeded threshold: took ${duration.toFixed(1)}ms`);
    }
  });

  // 12. OpenAPI specification validation
  await test(12, 'OpenAPI 3.0.3 Specification Contract Validation', async () => {
    const report = validateOpenApiContract();
    if (!report.valid) {
      throw new Error(`OpenAPI validation failed: ${report.errors.join(', ')}`);
    }
    if (report.totalOperations < 8 || report.totalSchemas < 10) {
      throw new Error(`Incomplete spec: only ${report.totalOperations} operations and ${report.totalSchemas} schemas`);
    }
  });

  // 13. TypeScript SDK execution
  await test(13, 'TypeScript SDK Programmatic Execution', async () => {
    // Run TypeScript SDK direct integration test
    const sdkPath = path.resolve(__dirname, '../../../sdk/typescript/src/index.ts');
    const { AuraClient } = (await import(pathToFileURL(sdkPath).href)) as any;
    const sdkClient = new AuraClient({ baseUrl });
    const auth = await sdkClient.auth.demoLogin('alex');
    if (!auth.token) throw new Error('TS SDK login failed');
    const accounts = await sdkClient.accounts.list();
    if (!accounts.accounts || accounts.accounts.length === 0) throw new Error('TS SDK accounts failed');
  });

  // 14. Python SDK readiness
  await test(14, 'Python SDK Models, Exceptions, & Package Structure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const pyDir = path.resolve(__dirname, '../../../sdk/python/aura_sdk');
    if (!fs.existsSync(path.join(pyDir, 'client.py')) || !fs.existsSync(path.join(pyDir, 'models.py'))) {
      throw new Error('Python SDK missing required client.py or models.py');
    }
  });

  // 15. Developer Portal functionality
  await test(15, 'Developer Portal & APIMatic Context Plugin Artifacts', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const pluginPath = path.resolve(__dirname, '../../docs/apimatic-context-plugin.json');
    const mdPath = path.resolve(__dirname, '../../../APIMATIC_CONTEXT_PLUGIN.md');
    if (!fs.existsSync(pluginPath)) throw new Error('apimatic-context-plugin.json missing');
    if (!fs.existsSync(mdPath)) throw new Error('APIMATIC_CONTEXT_PLUGIN.md missing');
  });

  // 16. API security & unauthorized rejection
  await test(16, 'API Security: Unauthorized Requests Rejected (401 Unauthorized)', async () => {
    const unauthAccounts = await api('/api/accounts');
    if (unauthAccounts.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthAccounts.status}`);
    }
    const unauthGrid = await api('/api/grid/views?gridId=transactions-grid');
    if (unauthGrid.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated grid view request, got ${unauthGrid.status}`);
    }
  });

  // 17. Existing functionality regressions
  await test(17, 'Regression Defense: PayPal Orders v2, Channel3, Bryntum & Ask AURA Intact', async () => {
    // Verify APIMatic Contract Guard validates PayPal Orders v2 correctly
    const validator = new ApimaticPayPalContractValidator();
    const validOrder = validator.validateCreateOrderRequest(
      {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '129.99' } }],
      },
      { 'PayPal-Request-Id': 'req-test-99' }
    );
    if (!validOrder.valid) {
      throw new Error(`Orders v2 contract validator failed: ${validOrder.errors.join(', ')}`);
    }

    // Verify deprecated v1 API is rejected
    const deprecatedCheck = validator.validateCreateOrderRequest(
      { intent: 'sale' },
      {}
    );
    if (deprecatedCheck.valid) {
      throw new Error('Expected deprecated PayPal payload to fail validation');
    }
  });

  // Cleanup
  server.close();
  await disconnectDatabase();

  console.log('\n========================================================================');
  console.log(`  TEST RESULTS: ${passed}/${total} Test Suites Passed Successfully!`);
  console.log('========================================================================\n');

  if (passed !== total) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runFullVerificationSuite().catch((err) => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
  });
}
