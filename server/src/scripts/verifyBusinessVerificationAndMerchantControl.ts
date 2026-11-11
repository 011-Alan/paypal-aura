import assert from 'assert';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import {
  UserModel,
  AccountModel,
  EcommerceOrderModel,
  TransactionModel,
  GoalModel,
} from '../models';
import { hashSecretArgon2id, signSessionToken } from '../middleware/security';
import { merchantVerificationService } from '../services/auth/merchantVerificationService';
import { startServer } from '../index';

let BASE_URL = `http://localhost:${env.PORT}/api`;

async function fetchJson(url: string, options: any = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('========================================================================');
  console.log('  AURA SECURITY VERIFICATION SUITE: BUSINESS ACCOUNTS & MERCHANT HUB');
  console.log('========================================================================\n');

  await connectDatabase();
  const server = await startServer();

  await new Promise<void>((resolve) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : env.PORT;
  BASE_URL = `http://localhost:${port}/api`;
  console.log(`[TEST HARNESS] Connected to backend on ${BASE_URL}\n`);

  let passedTests = 0;
  const totalTests = 12;

  try {
    const passwordHash = await hashSecretArgon2id('AuraPassword#2026');
    const pinHash = await hashSecretArgon2id('1234');

    // -------------------------------------------------------------------------
    // TEST 1: New Personal Sandbox Account Registers => No Merchant Hub
    // -------------------------------------------------------------------------
    console.log('[TEST 1] New Personal Sandbox account registers...');
    const personalEmail = `personal_user_${Date.now()}@personal.example.com`;
    const personalUser = await UserModel.create({
      name: 'John Personal',
      email: personalEmail,
      passwordHash,
      pinHash,
      role: 'family_admin',
      currency: 'USD',
      monthlyIncome: 65000,
      paypalUserId: `paypal-sub-personal-${Date.now()}`,
      paypalPayerId: `PAYER-PERSONAL-${Date.now()}`,
      paypalEmail: personalEmail,
      paypalAccountLinked: true,
      paypalIdentityVerified: true,
      onboardingCompleted: true,
    });

    const personalEval = await merchantVerificationService.verifyBusinessEligibility(String(personalUser._id));
    assert.strictEqual(personalEval.merchantAccessEnabled, false, '1a. Merchant access must be disabled for Personal account');
    assert.strictEqual(personalEval.auraAccountType, 'PERSONAL', '1b. auraAccountType must be PERSONAL');
    assert.strictEqual(personalEval.paypalAccountType, 'PERSONAL', '1c. paypalAccountType must be PERSONAL');
    assert.strictEqual(personalEval.merchantVerificationStatus, 'REJECTED', '1d. Verification status must be REJECTED (Not eligible)');
    console.log('  ✓ Personal Sandbox account correctly classified with merchantAccessEnabled: false\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 2: Business Sandbox Account Registers & Passes Trusted Verification
    // -------------------------------------------------------------------------
    console.log('[TEST 2] Business Sandbox account registers and passes trusted verification...');
    const businessEmail = `merchant_alpha_${Date.now()}@business.example.com`;
    const merchantAUser = await UserModel.create({
      name: 'Alpha Electronics Inc.',
      email: businessEmail,
      passwordHash,
      pinHash,
      role: 'family_admin',
      currency: 'USD',
      monthlyIncome: 250000,
      paypalUserId: `paypal-sub-biz-${Date.now()}`,
      paypalPayerId: `PAYER-BIZ-${Date.now()}`,
      paypalEmail: businessEmail,
      paypalAccountLinked: true,
      paypalIdentityVerified: true,
      onboardingCompleted: true,
    });

    const businessEval = await merchantVerificationService.verifyBusinessEligibility(String(merchantAUser._id));
    assert.strictEqual(businessEval.merchantAccessEnabled, true, '2a. Merchant access must be enabled for Business account');
    assert.strictEqual(businessEval.auraAccountType, 'BUSINESS', '2b. auraAccountType must be BUSINESS');
    assert.strictEqual(businessEval.paypalAccountType, 'BUSINESS', '2c. paypalAccountType must be BUSINESS');
    assert.strictEqual(businessEval.merchantVerificationStatus, 'VERIFIED', '2d. Verification status must be VERIFIED');
    assert.ok(businessEval.paypalMerchantId, '2e. paypalMerchantId must be populated');
    console.log('  ✓ Business Sandbox account successfully verified with merchantAccessEnabled: true\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 3: Personal User Manually Enters Merchant Hub URL => HTTP 403 Forbidden
    // -------------------------------------------------------------------------
    console.log('[TEST 3] Personal user manually accesses Merchant Hub endpoints...');
    const personalToken = signSessionToken(personalUser);
    const mHubRes = await fetchJson(`${BASE_URL}/ecommerce/merchant/overview`, {
      headers: { Authorization: `Bearer ${personalToken}` },
    });
    assert.strictEqual(mHubRes.status, 403, '3a. Merchant Hub overview must return HTTP 403 for personal user');
    assert.strictEqual(mHubRes.data.code, 'MERCHANT_VERIFICATION_REQUIRED', '3b. Must return MERCHANT_VERIFICATION_REQUIRED code');
    console.log('  ✓ Server-side guard blocked personal account with HTTP 403 Forbidden\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 4: Personal User Modifies Frontend State / Submits accountType: 'business'
    // -------------------------------------------------------------------------
    console.log('[TEST 4] Personal user attempts to self-declare business accountType via API...');
    const selfDeclareRes = await fetchJson(`${BASE_URL}/auth/account-type`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${personalToken}` },
      body: { accountType: 'business' },
    });
    assert.strictEqual(selfDeclareRes.status, 403, '4a. Self-declaration must be rejected with HTTP 403');
    const reloadedPersonal = await UserModel.findById(personalUser._id);
    assert.strictEqual(reloadedPersonal?.merchantAccessEnabled, false, '4b. Database merchantAccessEnabled must remain false');
    console.log('  ✓ Self-declared business status rejected with HTTP 403; database entitlement untouched\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 5: User Modifies Merchant API Request to Access Another Merchant's Order
    // -------------------------------------------------------------------------
    console.log('[TEST 5] Merchant A attempts to access/modify Merchant B order data...');
    const merchantBEmail = `merchant_beta_${Date.now()}@business.example.com`;
    const merchantBUser = await UserModel.create({
      name: 'Beta Hardware LLC',
      email: merchantBEmail,
      passwordHash,
      pinHash,
      role: 'merchant',
      accountType: 'business',
      auraAccountType: 'BUSINESS',
      paypalAccountType: 'BUSINESS',
      merchantVerificationStatus: 'VERIFIED',
      merchantAccessEnabled: true,
      paypalAccountLinked: true,
      paypalUserId: `paypal-sub-beta-${Date.now()}`,
      paypalPayerId: `PAYER-BETA-${Date.now()}`,
      paypalEmail: merchantBEmail,
      paypalMerchantId: `MERCHANT-BETA-${Date.now()}`,
      onboardingCompleted: true,
    });

    const orderOfB = await EcommerceOrderModel.create({
      orderNumber: `ORD-B-${Date.now()}`,
      userId: personalUser._id,
      merchantId: merchantBUser._id,
      merchantEmail: merchantBEmail,
      customerName: 'Customer Test',
      customerEmail: personalUser.email,
      items: [
        {
          productId: 'prod-b',
          name: 'Mechanical Keyboard B',
          brand: 'Keychron',
          category: 'Hardware',
          imageUrl: 'https://example.com/b.jpg',
          retailerName: 'Beta Hardware',
          purchaseUrl: 'https://example.com',
          originalPrice: 120,
          demoPrice: 120,
          selectedVariant: 'Brown Switch',
          quantity: 1,
          totalPrice: 120,
        },
      ],
      totalAmount: 120,
      subtotal: 120,
      shippingFee: 0,
      tax: 0,
      shippingAddress: {
        fullName: 'Customer Test',
        streetAddress: '100 Silicon Way',
        locality: 'San Jose',
        region: 'CA',
        postalCode: '95131',
        country: 'US',
      },
      currency: 'USD',
      fulfillmentStatus: 'order_confirmed',
      paymentInfo: {
        paymentStatus: 'completed',
        paypalOrderId: `PP-ORD-B-${Date.now()}`,
        amountPaid: 120,
        paidAt: new Date(),
      },
    });

    const tokenA = signSessionToken(merchantAUser);
    const crossAccessRes = await fetchJson(`${BASE_URL}/ecommerce/merchant/orders/${orderOfB._id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    if (crossAccessRes.status !== 404) {
      console.error('Test 5 unexpected status:', crossAccessRes.status, 'data:', crossAccessRes.data);
    }
    assert.strictEqual(crossAccessRes.status, 404, '5a. Merchant A must receive 404/denied when querying Merchant B order');
    console.log('  ✓ Cross-merchant access strictly denied by server-side order boundary\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 6: Unverified Account Calls Merchant APIs Directly
    // -------------------------------------------------------------------------
    console.log('[TEST 6] Unverified account calls merchant reporting and orders endpoints...');
    const unverifiedUser = await UserModel.create({
      name: 'Unverified Visitor',
      email: `unverified_${Date.now()}@test.finance`,
      passwordHash,
      pinHash,
      role: 'user',
      accountType: 'personal',
      auraAccountType: 'UNVERIFIED',
      paypalAccountType: 'UNKNOWN',
      merchantVerificationStatus: 'UNVERIFIED',
      merchantAccessEnabled: false,
    });
    const unverifiedToken = signSessionToken(unverifiedUser);

    const endpoints = [
      '/ecommerce/merchant/orders',
      '/ecommerce/merchant/received-payments',
      '/paypal/merchant-reporting/balances',
      '/paypal/merchant-reporting/transactions',
    ];
    for (const ep of endpoints) {
      const res = await fetchJson(`${BASE_URL}${ep}`, {
        headers: { Authorization: `Bearer ${unverifiedToken}` },
      });
      assert.strictEqual(res.status, 403, `6. Endpoint ${ep} must return HTTP 403 for unverified user`);
    }
    console.log('  ✓ All 4 merchant APIs rejected unverified user with HTTP 403 Forbidden\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 7: Business User Disconnects PayPal => Access Immediately Revoked
    // -------------------------------------------------------------------------
    console.log('[TEST 7] Verified Business user disconnects PayPal...');
    const disconnectRes = await fetchJson(`${BASE_URL}/paypal/disconnect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(disconnectRes.status, 200, '7a. Disconnect endpoint must return 200 OK');
    assert.strictEqual(disconnectRes.data.eligibility.merchantAccessEnabled, false, '7b. merchantAccessEnabled must become false');

    const revokedAttemptRes = await fetchJson(`${BASE_URL}/ecommerce/merchant/overview`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(revokedAttemptRes.status, 403, '7c. Calling merchant endpoint after disconnect must return 403');
    console.log('  ✓ Disconnect immediately revoked merchant entitlement and blocked Merchant Hub\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 8: Business User Reconnects Verified Account => Eligibility Re-Evaluated
    // -------------------------------------------------------------------------
    console.log('[TEST 8] Business user reconnects verified account & checks eligibility...');
    // Simulate re-linking valid sandbox business
    await UserModel.updateOne(
      { _id: merchantAUser._id },
      {
        $set: {
          paypalAccountLinked: true,
          paypalUserId: `reconnected-sub-${Date.now()}`,
          paypalEmail: businessEmail,
        },
      }
    );

    const checkRes = await fetchJson(`${BASE_URL}/merchant/check-eligibility`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(checkRes.status, 200, '8a. Check eligibility must return 200 OK');
    assert.strictEqual(checkRes.data.eligibility.merchantAccessEnabled, true, '8b. Eligibility re-enabled for verified account');
    assert.strictEqual(checkRes.data.eligibility.merchantVerificationStatus, 'VERIFIED', '8c. Status restored to VERIFIED');
    console.log('  ✓ Eligibility check re-evaluated account and restored Merchant Hub access\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 9: Multi-Merchant Isolation Between Two Verified Merchants
    // -------------------------------------------------------------------------
    console.log('[TEST 9] Two verified merchants query their orders...');
    const tokenB = signSessionToken(merchantBUser);

    // Create an order for Merchant A
    await EcommerceOrderModel.create({
      orderNumber: `ORD-A-${Date.now()}`,
      userId: personalUser._id,
      merchantId: merchantAUser._id,
      merchantEmail: merchantAUser.email,
      customerName: 'Customer Test A',
      customerEmail: personalUser.email,
      items: [
        {
          productId: 'prod-a',
          name: 'Gaming Laptop A',
          brand: 'ASUS',
          category: 'Hardware',
          imageUrl: 'https://example.com/a.jpg',
          retailerName: 'Alpha Electronics',
          purchaseUrl: 'https://example.com',
          originalPrice: 1200,
          demoPrice: 1200,
          selectedVariant: '16GB RAM',
          quantity: 1,
          totalPrice: 1200,
        },
      ],
      totalAmount: 1200,
      subtotal: 1200,
      shippingFee: 0,
      tax: 0,
      shippingAddress: {
        fullName: 'Customer Test A',
        streetAddress: '100 Silicon Way',
        locality: 'San Jose',
        region: 'CA',
        postalCode: '95131',
        country: 'US',
      },
      currency: 'USD',
      fulfillmentStatus: 'order_confirmed',
      paymentInfo: {
        paymentStatus: 'completed',
        paypalOrderId: `PP-ORD-A-${Date.now()}`,
        amountPaid: 1200,
        paidAt: new Date(),
      },
    });

    const ordersARes = await fetchJson(`${BASE_URL}/ecommerce/merchant/orders`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const ordersBRes = await fetchJson(`${BASE_URL}/ecommerce/merchant/orders`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });

    assert.strictEqual(ordersARes.status, 200, '9a. Merchant A orders must return 200');
    assert.strictEqual(ordersBRes.status, 200, '9b. Merchant B orders must return 200');

    const ordersA = ordersARes.data.orders;
    const ordersB = ordersBRes.data.orders;

    assert.ok(ordersA.every((o: any) => o.merchantId === String(merchantAUser._id)), '9c. Merchant A only sees orders for Merchant A');
    assert.ok(ordersB.every((o: any) => o.merchantId === String(merchantBUser._id)), '9d. Merchant B only sees orders for Merchant B');
    console.log(`  ✓ Merchant A orders: ${ordersA.length} | Merchant B orders: ${ordersB.length}. Perfect isolation.\n`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 10: Existing Customer Accounts are Migrated Without Data Loss
    // -------------------------------------------------------------------------
    console.log('[TEST 10] Running legacy account migration...');
    // Create account, goal and transaction for personal user
    const personalAccount = await AccountModel.create({
      userId: personalUser._id,
      name: 'Primary Checking',
      accountNumberMasked: '•••• 4242',
      type: 'checking',
      balance: 15000,
      currency: 'USD',
      institution: 'Chase',
    });
    await GoalModel.create({
      userId: personalUser._id,
      title: 'Emergency Savings Goal',
      targetAmount: 50000,
      currentAmount: 12000,
      deadline: new Date(Date.now() + 90 * 86400000),
      category: 'Savings',
    });
    await TransactionModel.create({
      userId: personalUser._id,
      accountId: personalAccount._id,
      accountName: personalAccount.name,
      amount: 150,
      description: 'Groceries at Whole Foods',
      merchant: 'Whole Foods',
      category: 'Groceries',
      type: 'expense',
      date: new Date(),
    });

    const migrationRes = await merchantVerificationService.migrateLegacyAccounts();
    assert.ok(migrationRes.totalUsers >= 3, '10a. Migration must process existing users');

    const personalAfter = await UserModel.findById(personalUser._id);
    const personalGoals = await GoalModel.find({ userId: personalUser._id });
    const personalTxns = await TransactionModel.find({ userId: personalUser._id });

    assert.strictEqual(personalGoals.length, 1, '10b. Personal goals must be intact');
    assert.strictEqual(personalTxns.length, 1, '10c. Personal transactions must be intact');
    assert.strictEqual(personalAfter?.merchantAccessEnabled, false, '10d. Personal user has merchantAccessEnabled: false');
    console.log('  ✓ Migration completed safely: personal goals, transactions, and purchases preserved.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 11: Live PayPal Account Has No Reliable Account-Type Information => UNKNOWN
    // -------------------------------------------------------------------------
    console.log('[TEST 11] Evaluating Live PayPal account with no verifiable business claims...');
    const liveEval = merchantVerificationService.evaluateAccountEligibility(
      {
        paypalAccountLinked: true,
        paypalUserId: 'live-sub-user-999',
        paypalEmail: 'unknown_seller@randomcompany.com',
        merchantVerificationStatus: 'UNVERIFIED',
      } as any,
      {
        modeOverride: 'live',
        userInfo: {
          email: 'unknown_seller@randomcompany.com',
          // No account_type claim present
        },
      }
    );
    assert.strictEqual(liveEval.paypalAccountType, 'UNKNOWN', '11a. Must evaluate to UNKNOWN in live mode');
    assert.strictEqual(liveEval.auraAccountType, 'UNVERIFIED', '11b. auraAccountType must be UNVERIFIED');
    assert.strictEqual(liveEval.merchantAccessEnabled, false, '11c. Merchant access must be disabled');
    assert.strictEqual(liveEval.merchantVerificationStatus, 'UNVERIFIED', '11d. Status must be UNVERIFIED');
    console.log('  ✓ Live PayPal account without verified seller claims safely kept UNKNOWN with Merchant Hub disabled.\n');
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST 12: User Signs In on Another Device => Correct Access from Backend DB
    // -------------------------------------------------------------------------
    console.log('[TEST 12] User refreshes browser / signs in on another device...');
    const meRes = await fetchJson(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(meRes.status, 200, '12a. /auth/me must return 200');
    assert.strictEqual(meRes.data.user.merchantAccessEnabled, true, '12b. merchantAccessEnabled loaded from DB');
    assert.strictEqual(meRes.data.user.auraAccountType, 'BUSINESS', '12c. auraAccountType loaded from DB');
    assert.strictEqual(meRes.data.user.merchantVerificationStatus, 'VERIFIED', '12d. Status verified from DB');

    const statusRes = await fetchJson(`${BASE_URL}/merchant/status`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(statusRes.status, 200, '12e. /merchant/status must return 200');
    assert.strictEqual(statusRes.data.merchantAccessEnabled, true, '12f. Merchant status confirmed');
    console.log('  ✓ Authoritative database record returned to new session/device.\n');
    passedTests++;

    console.log('========================================================================');
    console.log(`  ALL ${passedTests}/${totalTests} SECURITY VERIFICATION SCENARIOS PASSED SUCCESSFULLY!`);
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n[TEST FAILURE ERROR]:', err);
    throw err;
  } finally {
    if (server) server.close();
    await disconnectDatabase();
    process.exit(passedTests === totalTests ? 0 : 1);
  }
}

run().catch((err) => {
  console.error('Security verification suite failed:', err);
  process.exit(1);
});
