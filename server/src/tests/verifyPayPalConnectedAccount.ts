import assert from 'assert';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { UserModel, AccountModel, IUser } from '../models';
import { paypalProfileService } from '../integrations/paypal/paypalProfileService';
import { paypalBalanceService } from '../integrations/paypal/paypalBalanceService';
import { paypalTransactionService } from '../integrations/paypal/paypalTransactionService';
import { paypalIdentityService } from '../integrations/paypal/identityService';
import { hashSecretArgon2id, signSessionToken } from '../middleware/security';

async function runConnectedAccountVerificationTests() {
  console.log('================================================================');
  console.log('AURA PAYPAL CONNECTED ACCOUNT READ-ONLY VERIFICATION SUITE');
  console.log('================================================================\n');

  await connectDatabase();

  const originalFetch = global.fetch;

  try {
    // Setup test user with connected PayPal identity
    const testPayerId = `TEST_PAYER_${Date.now()}`;
    const testSub = `https://www.paypal.com/webapps/auth/identity/user/${testPayerId}`;
    const testEmail = `connected-${Date.now()}@aura-test.finance`;

    const passwordHash = await hashSecretArgon2id('SecurePassword123!');
    const pinHash = await hashSecretArgon2id('4826');

    const testUser = await UserModel.create({
      name: 'Alex Sandbox Tester',
      email: testEmail,
      passwordHash,
      pinHash,
      role: 'user',
      currency: 'INR',
      monthlyIncome: 85000,
      familyGroupId: `test-fam-${Date.now()}`,
      paypalUserId: testSub,
      paypalPayerId: testPayerId,
      paypalEmail: testEmail,
      paypalAccountLinked: true,
      paypalIdentityVerified: true,
      authenticationProvider: 'paypal',
      paypalAccessToken: 'initial-mock-access-token',
      paypalRefreshToken: 'initial-mock-refresh-token',
      paypalTokenExpiresAt: Date.now() + 3600 * 1000, // Valid for 1 hour
      paypalGrantedScopes: 'openid profile email address https://uri.paypal.com/services/paypalattributes',
      paypalLastSyncAt: new Date(),
    });

    // --------------------------------------------------------------------------
    // Test 1: Profile Information Retrieval & Address Parsing
    // --------------------------------------------------------------------------
    console.log('--- Test 1: Profile Information Retrieval & Address Parsing ---');
    {
      const mockUserInfo = {
        sub: testSub,
        user_id: testSub,
        name: 'Alex Sandbox Tester',
        given_name: 'Alex',
        family_name: 'Sandbox Tester',
        email: testEmail,
        email_verified: true,
        payer_id: testPayerId,
        verified_account: true,
        account_type: 'PERSONAL',
        address: {
          street_address: '2211 North First Street',
          locality: 'San Jose',
          region: 'CA',
          postal_code: '95131',
          country: 'US',
        },
      };

      global.fetch = async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/userinfo')) {
          return new Response(JSON.stringify(mockUserInfo), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(input);
      };

      const profile = await paypalProfileService.getProfile(String(testUser._id));

      assert.strictEqual(profile.name, 'Alex Sandbox Tester', '1a. Name must match');
      assert.strictEqual(profile.firstName, 'Alex', '1b. First name must be extracted');
      assert.strictEqual(profile.lastName, 'Sandbox Tester', '1c. Last name must be extracted');
      assert.strictEqual(profile.email, testEmail, '1d. Email must match');
      assert.ok(profile.address, '1e. Address object must be present');
      assert.strictEqual(profile.address?.streetAddress, '2211 North First Street', '1f. Street address must match');
      assert.strictEqual(profile.address?.locality, 'San Jose', '1g. City/Locality must match');
      assert.strictEqual(profile.address?.region, 'CA', '1h. State/Region must match');
      assert.strictEqual(profile.address?.postalCode, '95131', '1i. Postal code must match');
      assert.strictEqual(profile.address?.country, 'US', '1j. Country must match');
      assert.ok(profile.address?.formatted?.includes('San Jose, CA, 95131, US'), '1k. Formatted address must contain components');
      assert.strictEqual(profile.paypalAccountId, testPayerId, '1l. Account ID must match payer_id');
      assert.strictEqual(profile.accountVerificationStatus.verified, true, '1m. Verification status must be true');
      assert.strictEqual(profile.accountVerificationStatus.statusText, 'Verified', '1n. Status text must be "Verified"');
      assert.strictEqual(profile.isCachedFallback, false, '1o. Must be marked live, not fallback');

      // Verify MongoDB persistence
      const updatedUser = await UserModel.findById(testUser._id);
      assert.ok(updatedUser?.paypalAddress, '1p. User document in MongoDB must store paypalAddress');
      assert.strictEqual(updatedUser?.paypalAddress?.postalCode, '95131', '1q. Stored postal code must match');
      console.log('[PASS] Test 1: Profile information, address, and account status successfully retrieved and persisted.\n');
    }

    // --------------------------------------------------------------------------
    // Test 2: Transient API Failure Safe Fallback
    // --------------------------------------------------------------------------
    console.log('--- Test 2: Transient API Failure Safe Fallback ---');
    {
      global.fetch = async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/userinfo')) {
          return new Response(JSON.stringify({ error: 'internal_error', message: 'PayPal service unavailable' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(input);
      };

      const fallback = await paypalProfileService.getProfile(String(testUser._id));
      assert.strictEqual(fallback.isCachedFallback, true, '2a. Must fall back cleanly to cached database profile');
      assert.strictEqual(fallback.name, 'Alex Sandbox Tester', '2b. Cached name must be preserved');
      assert.strictEqual(fallback.address?.postalCode, '95131', '2c. Previously saved address must not be wiped out');
      console.log('[PASS] Test 2: Safe fallback preserves previously saved profile and address during transient network outage.\n');
    }

    // --------------------------------------------------------------------------
    // Test 3: Automatic Token Refresh on Expiry
    // --------------------------------------------------------------------------
    console.log('--- Test 3: Automatic Token Refresh on Expiry ---');
    {
      // Set user token expiry to the past
      await UserModel.findByIdAndUpdate(testUser._id, {
        paypalTokenExpiresAt: Date.now() - 120000, // Expired 2 minutes ago
      });

      let refreshCalled = false;
      global.fetch = async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
          refreshCalled = true;
          return new Response(
            JSON.stringify({
              access_token: 'new-refreshed-access-token-12345',
              token_type: 'Bearer',
              expires_in: 28800,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input);
      };

      const freshUser = await UserModel.findById(testUser._id).select('+paypalAccessToken +paypalRefreshToken');
      const token = await paypalProfileService.getValidUserAccessToken(freshUser!);
      assert.strictEqual(refreshCalled, true, '3a. Token refresh endpoint must be invoked when token is expired');
      assert.strictEqual(token, 'new-refreshed-access-token-12345', '3b. Valid refreshed token must be returned');

      const reloaded = await UserModel.findById(testUser._id).select('+paypalAccessToken');
      assert.strictEqual(reloaded?.paypalAccessToken, 'new-refreshed-access-token-12345', '3c. Refreshed token must be saved to DB');
      console.log('[PASS] Test 3: Expired access token automatically refreshed and updated in database.\n');
    }

    // --------------------------------------------------------------------------
    // Test 4: PayPal Balance Retrieval Eligibility & Safe Handling
    // --------------------------------------------------------------------------
    console.log('--- Test 4: PayPal Balance Retrieval Eligibility & Safe Handling ---');
    {
      // 4A: Balance API rejected due to lack of reporting permissions (Standard OpenID Connect)
      global.fetch = async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/reporting/balances')) {
          return new Response(
            JSON.stringify({
              name: 'NOT_AUTHORIZED',
              message: 'Authorization failed: Reporting API scope not granted',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input);
      };

      const balanceUnavailable = await paypalBalanceService.getBalance(String(testUser._id));
      assert.strictEqual(balanceUnavailable.available, false, '4a. Balance must be marked unavailable');
      assert.strictEqual(balanceUnavailable.balance, null, '4b. Balance value must be null (no fabrication)');
      assert.strictEqual(balanceUnavailable.currency, null, '4c. Currency must be null');
      assert.strictEqual(
        balanceUnavailable.statusMessage,
        'PayPal balance access is not currently available.',
        '4d. Must display exact documented unavailable status message'
      );
      assert.ok(balanceUnavailable.details?.includes('reporting/balances/read'), '4e. Details must explain missing reporting permissions');

      // 4B: Balance API authorized (When user/application possesses Reporting access)
      global.fetch = async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/reporting/balances')) {
          return new Response(
            JSON.stringify({
              balances: [
                {
                  currency: 'USD',
                  primary: true,
                  total_balance: { currency_code: 'USD', value: '345.50' },
                  available_balance: { currency_code: 'USD', value: '345.50' },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input);
      };

      const balanceAuthorized = await paypalBalanceService.getBalance(String(testUser._id));
      assert.strictEqual(balanceAuthorized.available, true, '4f. Balance must be marked available when authorized');
      assert.strictEqual(balanceAuthorized.balance, 345.5, '4g. Balance amount must be accurately parsed');
      assert.strictEqual(balanceAuthorized.currency, 'USD', '4h. Currency must be USD');
      console.log('[PASS] Test 4: Balance eligibility, unauthorized notice, and authorized parsing confirmed.\n');
    }

    // --------------------------------------------------------------------------
    // Test 5: PayPal Transaction History Eligibility & Safe Handling
    // --------------------------------------------------------------------------
    console.log('--- Test 5: PayPal Transaction History Eligibility & Safe Handling ---');
    {
      // 5A: Transaction Search API rejected due to lack of reporting/search/read scope
      global.fetch = async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/reporting/transactions')) {
          return new Response(
            JSON.stringify({
              name: 'PERMISSION_DENIED',
              message: 'No permission to access transaction reporting',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input);
      };

      const txnsUnavailable = await paypalTransactionService.getTransactions(String(testUser._id));
      assert.strictEqual(txnsUnavailable.available, false, '5a. Transactions must be marked unavailable');
      assert.strictEqual(txnsUnavailable.transactions.length, 0, '5b. Transactions list must be empty (no fabrication)');
      assert.strictEqual(
        txnsUnavailable.statusMessage,
        'PayPal transaction-history access requires additional PayPal permissions or approval.',
        '5c. Must display exact documented unavailable message'
      );
      assert.ok(txnsUnavailable.details?.includes('reporting/search/read'), '5d. Details must name the required scope');

      // 5B: Transaction Search API authorized
      global.fetch = async (input: any) => {
        const urlStr = String(input);
        if (urlStr.includes('/reporting/transactions')) {
          return new Response(
            JSON.stringify({
              total_items: 1,
              total_pages: 1,
              transaction_details: [
                {
                  transaction_info: {
                    transaction_id: 'TXN-SANDBOX-7890',
                    transaction_initiation_date: '2026-11-06T12:00:00Z',
                    transaction_amount: { currency_code: 'USD', value: '45.00' },
                    transaction_status: 'S',
                    transaction_event_code: 'T0000',
                    transaction_note: 'Coffee Subscription',
                    fee_amount: { currency_code: 'USD', value: '1.20' },
                  },
                  payer_info: {
                    email_address: 'buyer@sandbox.paypal.com',
                    payer_name: { alternate_full_name: 'Jane Doe' },
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input);
      };

      const txnsAuthorized = await paypalTransactionService.getTransactions(String(testUser._id));
      assert.strictEqual(txnsAuthorized.available, true, '5e. Transactions must be marked available');
      assert.strictEqual(txnsAuthorized.transactions.length, 1, '5f. Exactly 1 transaction parsed');
      assert.strictEqual(txnsAuthorized.transactions[0].id, 'TXN-SANDBOX-7890', '5g. Transaction ID parsed');
      assert.strictEqual(txnsAuthorized.transactions[0].amount, 45.0, '5h. Transaction amount parsed');
      assert.strictEqual(txnsAuthorized.transactions[0].description, 'Coffee Subscription', '5i. Description parsed');
      assert.strictEqual(txnsAuthorized.transactions[0].senderOrRecipient, 'buyer@sandbox.paypal.com', '5j. Sender/recipient email parsed');
      assert.strictEqual(txnsAuthorized.transactions[0].fee, 1.2, '5k. Fee amount parsed');
      console.log('[PASS] Test 5: Transaction search eligibility, unauthorized notice, and authorized parsing confirmed.\n');
    }

    // --------------------------------------------------------------------------
    // Test 6: Security, Session Isolation, and Read-Only Verification
    // --------------------------------------------------------------------------
    console.log('--- Test 6: Security, Session Isolation, and Read-Only Verification ---');
    {
      // Attempting to query an unlinked user
      const unlinkedUser = await UserModel.create({
        name: 'Unlinked Tester',
        email: `unlinked-${Date.now()}@aura-test.finance`,
        passwordHash: 'dummy',
        pinHash: 'dummy',
        paypalAccountLinked: false,
      });

      await assert.rejects(
        async () => {
          await paypalProfileService.getProfile(String(unlinkedUser._id));
        },
        /No linked PayPal account found/i,
        '6a. Querying an unlinked user must be rejected'
      );

      const unlinkedBalance = await paypalBalanceService.getBalance(String(unlinkedUser._id));
      assert.strictEqual(unlinkedBalance.available, false, '6b. Unlinked balance must be unavailable');

      const unlinkedTxns = await paypalTransactionService.getTransactions(String(unlinkedUser._id));
      assert.strictEqual(unlinkedTxns.available, false, '6c. Unlinked transactions must be unavailable');

      // Verify tokens are hidden by default from user queries
      const standardUserQuery = await UserModel.findById(testUser._id);
      assert.strictEqual(
        (standardUserQuery as any).paypalAccessToken,
        undefined,
        '6d. paypalAccessToken must have select: false and not leak in standard queries'
      );
      assert.strictEqual(
        (standardUserQuery as any).paypalRefreshToken,
        undefined,
        '6e. paypalRefreshToken must have select: false and not leak in standard queries'
      );

      console.log('[PASS] Test 6: Session isolation, unlinked safety, and token protection confirmed.\n');
    }

    // Clean up test users
    await UserModel.deleteMany({ email: { $in: [testEmail, `unlinked-${Date.now()}@aura-test.finance`] } });

    console.log('================================================================');
    console.log('ALL 6 CONNECTED PAYPAL ACCOUNT READ-ONLY TESTS PASSED (100%)');
    console.log('================================================================\n');
  } finally {
    global.fetch = originalFetch;
    await disconnectDatabase();
  }
}

runConnectedAccountVerificationTests().catch((err) => {
  console.error('Connected Account Verification Failed:', err);
  process.exit(1);
});
