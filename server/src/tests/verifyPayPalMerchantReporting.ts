import assert from 'assert';
import { env } from '../config/env';
import {
  paypalReportingService,
  PayPalReportingService,
  MerchantBalanceResponse,
  MerchantTransactionsResponse,
} from '../integrations/paypal/paypalReportingService';

async function runMerchantReportingTests() {
  console.log('================================================================');
  console.log('PAYPAL SANDBOX BUSINESS ACCOUNT REPORTING VERIFICATION SUITE');
  console.log('================================================================\n');

  const originalFetch = global.fetch;
  const originalClientId = env.PAYPAL_CLIENT_ID;
  const originalClientSecret = env.PAYPAL_CLIENT_SECRET;

  try {
    // --------------------------------------------------------------------------
    // Test 1: Client Credentials Token Acquisition & Caching
    // --------------------------------------------------------------------------
    console.log('--- Test 1: Client Credentials Token Acquisition & Caching ---');
    {
      paypalReportingService.clearTokenCache();
      (env as any).PAYPAL_CLIENT_ID = 'test-sandbox-client-id-12345';
      (env as any).PAYPAL_CLIENT_SECRET = 'test-sandbox-client-secret-67890';

      let tokenCalls = 0;
      let capturedAuthHeader = '';
      let capturedBody = '';

      global.fetch = (async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/v1/oauth2/token')) {
          tokenCalls++;
          capturedAuthHeader = init?.headers?.Authorization || '';
          capturedBody = init?.body || '';
          return new Response(
            JSON.stringify({
              scope:
                'https://uri.paypal.com/services/invoicing https://uri.paypal.com/services/reporting/search/read https://uri.paypal.com/services/reporting/balances/read',
              access_token: 'A21AA-test-app-access-token-live-sandbox',
              token_type: 'Bearer',
              app_id: 'APP-80W284485P519543T',
              expires_in: 32400,
              nonce: '2026-11-06T12:00:00Z',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      const tokenResult1 = await paypalReportingService.getAppAccessToken();
      assert.strictEqual(tokenResult1.accessToken, 'A21AA-test-app-access-token-live-sandbox');
      assert.strictEqual(tokenCalls, 1);
      assert.ok(tokenResult1.scopes.includes(PayPalReportingService.SCOPE_BALANCES));
      assert.ok(tokenResult1.scopes.includes(PayPalReportingService.SCOPE_SEARCH));

      const expectedBasic = Buffer.from('test-sandbox-client-id-12345:test-sandbox-client-secret-67890').toString('base64');
      assert.strictEqual(capturedAuthHeader, `Basic ${expectedBasic}`);
      assert.strictEqual(capturedBody, 'grant_type=client_credentials');

      // Subsequent call should hit cache without issuing another network request
      const tokenResult2 = await paypalReportingService.getAppAccessToken();
      assert.strictEqual(tokenResult2.accessToken, tokenResult1.accessToken);
      assert.strictEqual(tokenCalls, 1, 'Token must be cached until expiration');

      console.log('✓ PASS: Client Credentials OAuth exchange properly formats Basic Auth and caches valid tokens.');
    }

    // --------------------------------------------------------------------------
    // Test 2: Balance Retrieval with Multi-Currency & Withheld Balances
    // --------------------------------------------------------------------------
    console.log('\n--- Test 2: Sandbox Business Balance Retrieval & Multi-Currency ---');
    {
      global.fetch = (async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/v1/reporting/balances')) {
          assert.strictEqual(init?.headers?.Authorization, 'Bearer A21AA-test-app-access-token-live-sandbox');
          return new Response(
            JSON.stringify({
              as_of_time: '2026-11-06T15:30:00Z',
              balances: [
                {
                  currency: 'USD',
                  primary: true,
                  total_balance: { currency_code: 'USD', value: '4500.50' },
                  available_balance: { currency_code: 'USD', value: '4200.00' },
                  withheld_balance: { currency_code: 'USD', value: '300.50' },
                  last_refresh_time: '2026-11-06T15:28:00Z',
                },
                {
                  currency: 'EUR',
                  primary: false,
                  total_balance: { currency_code: 'EUR', value: '1250.00' },
                  available_balance: { currency_code: 'EUR', value: '1250.00' },
                  withheld_balance: { currency_code: 'EUR', value: '0.00' },
                  last_refresh_time: '2026-11-06T15:28:00Z',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      const balanceRes: MerchantBalanceResponse = await paypalReportingService.getMerchantBalances();
      assert.strictEqual(balanceRes.available, true);
      assert.strictEqual(balanceRes.accountType, 'PayPal Sandbox Business Account');
      assert.strictEqual(balanceRes.primaryBalance, 4200.00);
      assert.strictEqual(balanceRes.primaryCurrency, 'USD');
      assert.strictEqual(balanceRes.balances.length, 2);

      const usd = balanceRes.balances.find((b) => b.currency === 'USD')!;
      assert.strictEqual(usd.availableBalance, 4200.00);
      assert.strictEqual(usd.totalBalance, 4500.50);
      assert.strictEqual(usd.withheldBalance, 300.50);
      assert.strictEqual(usd.primary, true);

      const eur = balanceRes.balances.find((b) => b.currency === 'EUR')!;
      assert.strictEqual(eur.availableBalance, 1250.00);
      assert.strictEqual(eur.withheldBalance, 0);

      console.log('✓ PASS: Balances correctly parsed with available, withheld, total, and multi-currency support.');
    }

    // --------------------------------------------------------------------------
    // Test 3: Transaction Search with Fees, Payer Details & Sorting
    // --------------------------------------------------------------------------
    console.log('\n--- Test 3: Sandbox Business Transaction Search & Formatting ---');
    {
      let capturedQuery = '';
      global.fetch = (async (url: any, init: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/v1/reporting/transactions')) {
          capturedQuery = urlStr;
          return new Response(
            JSON.stringify({
              total_items: 2,
              total_pages: 1,
              page: 1,
              transaction_details: [
                {
                  transaction_info: {
                    transaction_id: 'TXN-EARLIER-001',
                    transaction_initiation_date: '2026-11-05T10:00:00Z',
                    transaction_amount: { currency_code: 'USD', value: '150.00' },
                    fee_amount: { currency_code: 'USD', value: '-4.65' },
                    net_amount: { currency_code: 'USD', value: '145.35' },
                    transaction_status: 'S',
                    transaction_subject: 'Invoice payment for freelance consulting',
                    transaction_event_code: 'T0006',
                  },
                  payer_info: {
                    account_id: 'PAYER-ACCT-999',
                    email_address: 'client@example.com',
                    payer_name: { given_name: 'Jordan', surname: 'Lee' },
                  },
                  shipping_info: { name: 'Jordan Lee' },
                },
                {
                  transaction_info: {
                    transaction_id: 'TXN-LATER-002',
                    transaction_initiation_date: '2026-11-06T14:30:00Z',
                    transaction_amount: { currency_code: 'USD', value: '350.00' },
                    fee_amount: { currency_code: 'USD', value: '-10.45' },
                    net_amount: { currency_code: 'USD', value: '339.55' },
                    transaction_status: 'S',
                    transaction_subject: 'AURA Plan Subscription',
                    transaction_event_code: 'T0000',
                  },
                  payer_info: {
                    account_id: 'PAYER-ACCT-888',
                    email_address: 'sam@aura-user.io',
                    payer_name: { alternate_full_name: 'Sam Rivera' },
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      const txnsRes: MerchantTransactionsResponse = await paypalReportingService.getMerchantTransactions({
        page: 1,
        pageSize: 10,
      });

      assert.strictEqual(txnsRes.available, true);
      assert.strictEqual(txnsRes.accountType, 'PayPal Sandbox Business Account');
      assert.strictEqual(txnsRes.totalItems, 2);
      assert.strictEqual(txnsRes.transactions.length, 2);
      assert.ok(capturedQuery.includes('fields=all'));
      assert.ok(capturedQuery.includes('page_size=10'));

      // Check sorting descending by date: later transaction TXN-LATER-002 must be first
      assert.strictEqual(txnsRes.transactions[0].id, 'TXN-LATER-002');
      assert.strictEqual(txnsRes.transactions[0].grossAmount, 350.00);
      assert.strictEqual(txnsRes.transactions[0].fee, -10.45);
      assert.strictEqual(txnsRes.transactions[0].netAmount, 339.55);
      assert.strictEqual(txnsRes.transactions[0].payerName, 'Sam Rivera');
      assert.strictEqual(txnsRes.transactions[0].payerEmail, 'sam@aura-user.io');
      assert.strictEqual(txnsRes.transactions[0].status, 'Success / Completed');

      assert.strictEqual(txnsRes.transactions[1].id, 'TXN-EARLIER-001');
      assert.strictEqual(txnsRes.transactions[1].payerName, 'Jordan Lee');

      // Check 3-hour reporting delay disclosure
      assert.ok(txnsRes.reportingDelayNotice.includes('3 hours'));

      console.log('✓ PASS: Transactions parsed with gross, fee, net amounts, payer information, and chronological sorting.');
    }

    // --------------------------------------------------------------------------
    // Test 4: Scope / Permission Error Handling (HTTP 403 Forbidden)
    // --------------------------------------------------------------------------
    console.log('\n--- Test 4: HTTP 403 Insufficient Scope Handling (No Mock Substitution) ---');
    {
      global.fetch = (async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/v1/reporting/balances')) {
          return new Response(
            JSON.stringify({
              name: 'NOT_AUTHORIZED',
              message: 'Authorization failed: missing required scope https://uri.paypal.com/services/reporting/balances/read',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/v1/reporting/transactions')) {
          return new Response(
            JSON.stringify({
              name: 'NOT_AUTHORIZED',
              message: 'Authorization failed: missing required scope https://uri.paypal.com/services/reporting/search/read',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('Not found', { status: 404 });
      }) as any;

      const balanceErr = await paypalReportingService.getMerchantBalances();
      assert.strictEqual(balanceErr.available, false);
      assert.strictEqual(balanceErr.primaryBalance, null);
      assert.strictEqual(balanceErr.missingScope, PayPalReportingService.SCOPE_BALANCES);
      assert.strictEqual(balanceErr.httpStatus, 403);
      assert.ok(balanceErr.details?.includes('https://uri.paypal.com/services/reporting/balances/read'));

      const txnErr = await paypalReportingService.getMerchantTransactions();
      assert.strictEqual(txnErr.available, false);
      assert.strictEqual(txnErr.transactions.length, 0);
      assert.strictEqual(txnErr.missingScope, PayPalReportingService.SCOPE_SEARCH);
      assert.strictEqual(txnErr.httpStatus, 403);
      assert.ok(txnErr.details?.includes('https://uri.paypal.com/services/reporting/search/read'));

      console.log('✓ PASS: Strict 403 permission verification communicates exact missing scopes without substituting mock data.');
    }

    // --------------------------------------------------------------------------
    // Test 5: Missing Environment Credentials Handling
    // --------------------------------------------------------------------------
    console.log('\n--- Test 5: Missing Credentials Safe Failure ---');
    {
      paypalReportingService.clearTokenCache();
      (env as any).PAYPAL_CLIENT_ID = '';
      (env as any).PAYPAL_CLIENT_SECRET = '';

      const balanceUnconfigured = await paypalReportingService.getMerchantBalances();
      assert.strictEqual(balanceUnconfigured.available, false);
      assert.ok(balanceUnconfigured.details?.includes('PAYPAL_CLIENT_ID'));

      const txnUnconfigured = await paypalReportingService.getMerchantTransactions();
      assert.strictEqual(txnUnconfigured.available, false);
      assert.ok(txnUnconfigured.details?.includes('PAYPAL_CLIENT_ID'));

      console.log('✓ PASS: Gracefully handles unconfigured environment variables.');
    }

    console.log('\n================================================================');
    console.log('ALL 5 PAYPAL MERCHANT REPORTING VERIFICATION TESTS PASSED');
    console.log('================================================================\n');
  } finally {
    global.fetch = originalFetch;
    (env as any).PAYPAL_CLIENT_ID = originalClientId;
    (env as any).PAYPAL_CLIENT_SECRET = originalClientSecret;
  }
}

runMerchantReportingTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Merchant Reporting Verification Failed:', err);
    process.exit(1);
  });
