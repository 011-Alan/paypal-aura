import { AuraClient } from './src';
import { AuraAuthorizationError } from './src/errors';

async function runTestSuite() {
  console.log('========================================================');
  console.log('    AURA TYPESCRIPT SDK VERIFICATION TEST SUITE         ');
  console.log('========================================================');

  const client = new AuraClient({ baseUrl: 'http://localhost:5000' });
  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(` [✓] Test ${total}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(` [✗] Test ${total}: ${name} FAILED -> ${err.message}`);
    }
  }

  // 1. Demo Login
  let alexToken = '';
  await test('Authenticate as Consumer Persona (Alex Morgan)', async () => {
    const res = await client.auth.demoLogin('alex');
    if (!res.token || res.user.email !== 'alex@example.com') {
      throw new Error(`Unexpected user response: ${JSON.stringify(res.user)}`);
    }
    alexToken = res.token;
  });

  // 2. Fetch Accounts
  await test('Retrieve Linked Accounts and Balances', async () => {
    const res = await client.accounts.list();
    if (!Array.isArray(res.accounts) || res.accounts.length === 0) {
      throw new Error('No accounts returned');
    }
  });

  // 3. Fetch Transactions
  let sampleTxIds: string[] = [];
  await test('Fetch Transactions with AG Grid Row Format', async () => {
    const res = await client.transactions.list({ limit: 10 });
    const rows = res.agGrid?.rows || res.transactions || [];
    if (rows.length === 0) {
      throw new Error('No transactions returned');
    }
    sampleTxIds = rows.slice(0, 3).map((r: any) => r.id);
  });

  // 4. Save AG Grid View
  let savedViewName = `SDK_View_${Date.now()}`;
  await test('Save AG Grid View (filterModel, sortModel, columnVisibility)', async () => {
    const res = await client.grid.saveView({
      gridId: 'transactions-grid',
      name: savedViewName,
      filterModel: { amount: { filterType: 'number', type: 'greaterThan', filter: 50 } },
      sortModel: [{ colId: 'amount', sort: 'desc' }],
      columnVisibility: { date: true, merchant: true, amount: true },
    });
    if (!res.success || !res.view) {
      throw new Error('Failed to save view');
    }
  });

  // 5. Retrieve AG Grid Views
  await test('Retrieve User Saved AG Grid Views for transactions-grid', async () => {
    const res = await client.grid.getViews('transactions-grid');
    if (!res.success || !res.views.some((v) => v.name === savedViewName)) {
      throw new Error(`Saved view ${savedViewName} not found in user views list`);
    }
  });

  // 6. Ground-Truth Grid Selection Context
  await test('Resolve Authoritative Ground-Truth Grid Selection Context', async () => {
    if (sampleTxIds.length === 0) throw new Error('No sample IDs to test');
    const res = await client.grid.resolveSelectionContext('transactions', 'transactions-grid', sampleTxIds);
    if (!res.success || !res.context || res.context.totalSelected !== sampleTxIds.length) {
      throw new Error(`Selection resolution failed: ${JSON.stringify(res)}`);
    }
    if (typeof res.context.summary.totalAmount !== 'number') {
      throw new Error('Selection context summary missing totalAmount');
    }
  });

  // 7. Ask AURA with attached Selection Context
  await test('Ask AURA Natural-Language Analysis on Selected Grid Rows', async () => {
    const res = await client.ai.analyseSelection(
      'transactions',
      'transactions-grid',
      sampleTxIds,
      'What is the combined cost of these selected items?'
    );
    if (!res.success || !res.response) {
      throw new Error('Ask AURA did not return a valid response');
    }
  });

  // 8. Security Isolation Test: Personal User Denied Merchant Hub Access
  await test('Security: Personal User Forbidden from Merchant Operations (HTTP 403)', async () => {
    try {
      await client.merchant.getOverview();
      throw new Error('Expected 403 Forbidden but call succeeded!');
    } catch (err: any) {
      if (err instanceof AuraAuthorizationError || err.statusCode === 403) {
        // Expected behavior!
        return;
      }
      throw err;
    }
  });

  // 9. Merchant Access: Bruce Wayne (Verified Merchant) Allowed Access
  await test('Merchant Hub: Bruce Wayne (PayPal Business) Authorized Access', async () => {
    const merchantClient = new AuraClient({ baseUrl: 'http://localhost:5000' });
    await merchantClient.auth.demoLogin('bruce');
    const res = await merchantClient.merchant.getOverview();
    if (!res.success || !res.overview) {
      throw new Error(`Merchant overview failed for Bruce: ${JSON.stringify(res)}`);
    }
  });

  console.log('--------------------------------------------------------');
  console.log(`TypeScript SDK Suite Results: ${passed}/${total} Tests Passed`);
  console.log('========================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite().catch((err) => {
    console.error('Fatal suite runner error:', err);
    process.exit(1);
  });
}
