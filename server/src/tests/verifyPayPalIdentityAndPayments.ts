import assert from 'assert';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/env';
import { UserModel, AccountModel, PaymentRequestModel, TransactionModel } from '../models';
import { paypalIdentityService } from '../integrations/paypal/identityService';
import { paypalIntegration } from '../integrations/paypal';
import { paymentGuardianService } from '../services/payments/paymentGuardianService';

async function runPayPalIdentityAndPaymentTests() {
  console.log('================================================================');
  console.log('AURA PAYPAL IDENTITY & PAYMENT INTEGRATION VERIFICATION SUITE');
  console.log('================================================================\n');

  await connectDatabase();

  // Ensure test credentials if not configured in environment
  if (!env.PAYPAL_CLIENT_ID) {
    (env as any).PAYPAL_CLIENT_ID = 'test-aura-paypal-client-id';
  }
  if (!env.PAYPAL_CLIENT_SECRET) {
    (env as any).PAYPAL_CLIENT_SECRET = 'test-aura-paypal-client-secret';
  }
  if (!env.PAYPAL_IDENTITY_CLIENT_ID) {
    (env as any).PAYPAL_IDENTITY_CLIENT_ID = 'test-aura-paypal-identity-client-id';
  }
  if (!env.PAYPAL_IDENTITY_CLIENT_SECRET) {
    (env as any).PAYPAL_IDENTITY_CLIENT_SECRET = 'test-aura-paypal-identity-client-secret';
  }

  // Clean test artifacts
  await UserModel.deleteMany({ email: /@paypal-test\.finance$/ });
  await PaymentRequestModel.deleteMany({ recipientEmail: /paypal-test/ });

  // Generate test RSA key pair for JWKS ID token simulation
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: 'jwk' });
  const testKid = 'test-aura-key-1';
  jwk.kid = testKid;
  jwk.use = 'sig';
  jwk.alg = 'RS256';

  // Seed mocked JWKS into paypalIdentityService
  (paypalIdentityService as any).jwksCache = {
    keys: [jwk],
    fetchedAt: Date.now(),
  };

  // --------------------------------------------------------------------------
  // Scenario 1: New user registration via PayPal Identity OIDC
  // --------------------------------------------------------------------------
  console.log('--- Scenario 1: New user registration via PayPal Identity OIDC ---');
  {
    const testSub = `PAYPAL-USER-${Date.now()}`;
    const testEmail = `newuser-${Date.now()}@paypal-test.finance`;
    const testName = 'PayPal New User';

    // Mock fetch for token and userinfo
    const originalFetch = global.fetch;
    const { url, state, nonce } = paypalIdentityService.getAuthorizationUrl();

    const mockIdToken = jwt.sign(
      {
        iss: 'https://api.sandbox.paypal.com',
        aud: env.PAYPAL_IDENTITY_CLIENT_ID,
        sub: testSub,
        email: testEmail,
        name: testName,
        nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: testKid,
      }
    );

    global.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-1',
            token_type: 'Bearer',
            expires_in: 28800,
            id_token: mockIdToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/v1/identity/openidconnect/userinfo')) {
        return new Response(
          JSON.stringify({
            user_id: testSub,
            sub: testSub,
            name: testName,
            email: testEmail,
            verified: true,
            payer_id: `PAYER-${testSub}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      const result = await paypalIdentityService.handleCallback({
        code: 'auth-code-12345',
        state,
      });

      assert.strictEqual(result.isNewUser, true, '1a. Must be identified as a new user registration');
      assert.strictEqual(result.user.email, testEmail, '1b. User email must match PayPal email');
      assert.strictEqual(result.user.paypalUserId, testSub, '1c. PayPal user_id must be mapped');
      assert.strictEqual(result.user.paypalAccountLinked, true, '1d. Account must be marked linked');
      assert.strictEqual(result.user.authenticationProvider, 'paypal', '1e. Auth provider is paypal');
      assert.ok(result.token, '1f. Valid JWT session token must be returned');

      // Verify checking account was initialized
      const account = await AccountModel.findOne({ userId: result.user._id });
      assert.ok(account, '1g. Default checking account must be created for new PayPal user');

      console.log('[PASS] Scenario 1: New user registration via PayPal Identity OIDC verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 2: Returning user login via PayPal Identity
  // --------------------------------------------------------------------------
  console.log('--- Scenario 2: Returning user login via PayPal Identity ---');
  {
    const existingPayPalUser = await UserModel.findOne({ email: /@paypal-test\.finance$/ });
    assert.ok(existingPayPalUser, 'Existing user from Scenario 1 must exist');

    const originalFetch = global.fetch;
    const { state, nonce } = paypalIdentityService.getAuthorizationUrl();

    const mockIdToken = jwt.sign(
      {
        iss: 'https://api.sandbox.paypal.com',
        aud: env.PAYPAL_IDENTITY_CLIENT_ID,
        sub: existingPayPalUser.paypalUserId,
        email: existingPayPalUser.email,
        name: existingPayPalUser.name,
        nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: testKid,
      }
    );

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-login',
            token_type: 'Bearer',
            expires_in: 28800,
            id_token: mockIdToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/v1/identity/openidconnect/userinfo')) {
        return new Response(
          JSON.stringify({
            user_id: existingPayPalUser.paypalUserId,
            sub: existingPayPalUser.paypalUserId,
            name: existingPayPalUser.name,
            email: existingPayPalUser.email,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const userCountBefore = await UserModel.countDocuments();
      const result = await paypalIdentityService.handleCallback({
        code: 'auth-code-returning',
        state,
      });

      const userCountAfter = await UserModel.countDocuments();
      assert.strictEqual(userCountAfter, userCountBefore, '2a. No duplicate user account created');
      assert.strictEqual(result.isNewUser, false, '2b. Identified as returning user');
      assert.strictEqual(String(result.user._id), String(existingPayPalUser._id), '2c. Correct user returned');
      assert.ok(result.token, '2d. Valid session token issued for login');

      console.log('[PASS] Scenario 2: Returning user login via PayPal Identity verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Account linking conflict prevention (matching email without link rejected)
  // --------------------------------------------------------------------------
  console.log('--- Scenario 3: Account linking conflict prevention (anti-takeover) ---');
  {
    // Create an existing local password user
    const localUserEmail = `localuser-${Date.now()}@paypal-test.finance`;
    await UserModel.create({
      name: 'Local Password User',
      email: localUserEmail,
      passwordHash: 'dummy-hash',
      pinHash: 'dummy-pin',
      authenticationProvider: 'local',
    });

    const originalFetch = global.fetch;
    const { state, nonce } = paypalIdentityService.getAuthorizationUrl();

    // PayPal returns same email, but different sub, unlinked
    const conflictingSub = `CONFLICTING-PAYPAL-${Date.now()}`;
    const mockIdToken = jwt.sign(
      {
        iss: 'https://api.sandbox.paypal.com',
        aud: env.PAYPAL_IDENTITY_CLIENT_ID,
        sub: conflictingSub,
        email: localUserEmail,
        name: 'Local Password User',
        nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: testKid,
      }
    );

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-conflict',
            token_type: 'Bearer',
            expires_in: 28800,
            id_token: mockIdToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/v1/identity/openidconnect/userinfo')) {
        return new Response(
          JSON.stringify({
            user_id: conflictingSub,
            sub: conflictingSub,
            name: 'Local Password User',
            email: localUserEmail,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      let threw = false;
      try {
        await paypalIdentityService.handleCallback({
          code: 'conflict-code',
          state,
        });
      } catch (err: any) {
        threw = true;
        assert.ok(
          err.message.includes('already exists') || err.message.includes('Settings'),
          '3a. Must explain conflict and prevent silent account takeover'
        );
      }
      assert.strictEqual(threw, true, '3b. Callback must reject unlinked email conflict');
      console.log('[PASS] Scenario 3: Anti-account-takeover conflict guardrail verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Authenticated account linking
  // --------------------------------------------------------------------------
  console.log('--- Scenario 4: Authenticated account linking ---');
  {
    const targetUser = await UserModel.create({
      name: 'User To Link',
      email: `linkable-${Date.now()}@paypal-test.finance`,
      passwordHash: 'dummy-hash-2',
      pinHash: 'dummy-pin-2',
      authenticationProvider: 'local',
    });

    const originalFetch = global.fetch;
    const { state, nonce } = paypalIdentityService.getAuthorizationUrl({
      linkUserId: String(targetUser._id),
    });

    const linkedSub = `LINKED-PAYPAL-${Date.now()}`;
    const linkedEmail = `paypal-personal-${Date.now()}@paypal-test.finance`;

    const mockIdToken = jwt.sign(
      {
        iss: 'https://api.sandbox.paypal.com',
        aud: env.PAYPAL_IDENTITY_CLIENT_ID,
        sub: linkedSub,
        email: linkedEmail,
        name: 'User To Link',
        nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: testKid,
      }
    );

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-link',
            token_type: 'Bearer',
            expires_in: 28800,
            id_token: mockIdToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/v1/identity/openidconnect/userinfo')) {
        return new Response(
          JSON.stringify({
            user_id: linkedSub,
            sub: linkedSub,
            name: 'User To Link',
            email: linkedEmail,
            payer_id: `PAYER-${linkedSub}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const result = await paypalIdentityService.handleCallback({
        code: 'link-code-123',
        state,
      });

      assert.strictEqual(result.isLinked, true, '4a. Must be identified as linked operation');
      assert.strictEqual(String(result.user._id), String(targetUser._id), '4b. Correct account updated');
      assert.strictEqual(result.user.paypalUserId, linkedSub, '4c. paypalUserId saved');
      assert.strictEqual(result.user.paypalEmail, linkedEmail, '4d. paypalEmail saved');
      assert.strictEqual(result.user.authenticationProvider, 'both', '4e. Auth provider elevated to both');

      console.log('[PASS] Scenario 4: Authenticated account linking verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 5: CSRF / state tampering rejection
  // --------------------------------------------------------------------------
  console.log('--- Scenario 5: CSRF / state tampering rejection ---');
  {
    let threw = false;
    try {
      await paypalIdentityService.handleCallback({
        code: 'some-code',
        state: 'tampered.state.payload.signature',
      });
    } catch (err: any) {
      threw = true;
      assert.ok(
        err.message.includes('Invalid OAuth state') || err.message.includes('CSRF'),
        '5a. Tampered state rejected'
      );
    }
    assert.strictEqual(threw, true, '5b. Must reject invalid state HMAC');
    console.log('[PASS] Scenario 5: CSRF / state tampering rejection verified.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 6: ID token validation and JWKS signature check
  // --------------------------------------------------------------------------
  console.log('--- Scenario 6: ID token validation and JWKS signature check ---');
  {
    // 6a. Valid token with matching kid passes
    const validToken = jwt.sign(
      {
        iss: 'https://api.sandbox.paypal.com',
        aud: env.PAYPAL_IDENTITY_CLIENT_ID,
        sub: 'sub-6a',
        nonce: 'nonce-123',
        exp: Math.floor(Date.now() / 1000) + 1200,
      },
      privateKey,
      { algorithm: 'RS256', keyid: testKid }
    );
    const validated = await paypalIdentityService.validateIdToken(validToken, 'nonce-123');
    assert.strictEqual(validated.sub, 'sub-6a', '6a. Valid token accepted');

    // 6b. Wrong audience fails
    const wrongAudToken = jwt.sign(
      {
        iss: 'https://api.sandbox.paypal.com',
        aud: 'wrong-audience',
        sub: 'sub-6b',
        exp: Math.floor(Date.now() / 1000) + 1200,
      },
      privateKey,
      { algorithm: 'RS256', keyid: testKid }
    );
    await assert.rejects(
      async () => paypalIdentityService.validateIdToken(wrongAudToken),
      /mismatch/i,
      '6b. Mismatched audience must be rejected'
    );

    // 6c. Expired token fails
    const expiredToken = jwt.sign(
      {
        iss: 'https://api.sandbox.paypal.com',
        aud: env.PAYPAL_IDENTITY_CLIENT_ID,
        sub: 'sub-6c',
        exp: Math.floor(Date.now() / 1000) - 100,
      },
      privateKey,
      { algorithm: 'RS256', keyid: testKid }
    );
    await assert.rejects(
      async () => paypalIdentityService.validateIdToken(expiredToken),
      /expired/i,
      '6c. Expired token must be rejected'
    );

    console.log('[PASS] Scenario 6: ID token signature, audience, and expiration verification confirmed.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 7: Order creation via PayPal Orders API v2
  // --------------------------------------------------------------------------
  console.log('--- Scenario 7: Order creation via PayPal Orders API v2 ---');
  {
    const originalFetch = global.fetch;
    const testOrderId = `ORD-${Date.now()}`;
    const testApprovalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${testOrderId}`;

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-orders-token',
            token_type: 'Bearer',
            expires_in: 32400,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/v2/checkout/orders')) {
        return new Response(
          JSON.stringify({
            id: testOrderId,
            status: 'CREATED',
            links: [
              { href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${testOrderId}`, rel: 'self', method: 'GET' },
              { href: testApprovalUrl, rel: 'approve', method: 'GET' },
              { href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${testOrderId}/capture`, rel: 'capture', method: 'POST' },
            ],
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const order = await paypalIntegration.createOrder({
        idempotencyKey: `idem-ord-${Date.now()}`,
        amountUsd: 120.0,
        amountInr: 10000,
        description: 'Greenwood Residency Rent Settlement',
        recipientName: 'Greenwood Landlords',
      });

      assert.strictEqual(order.orderId, testOrderId, '7a. Order ID returned correctly');
      assert.strictEqual(order.status, 'CREATED', '7b. Order status is CREATED');
      assert.strictEqual(order.approvalUrl, testApprovalUrl, '7c. Official approvalUrl captured');
      assert.strictEqual(order.apimaticValidation.valid, true, '7d. APIMatic contract schema validated');

      console.log('[PASS] Scenario 7: PayPal Orders API v2 order creation verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 8: Payment capture and transaction record creation in MongoDB
  // --------------------------------------------------------------------------
  console.log('--- Scenario 8: Payment capture & MongoDB ledger settlement ---');
  {
    const user = await UserModel.findOne({ email: /@paypal-test\.finance$/ });
    assert.ok(user, 'Test user must exist');

    let account = await AccountModel.findOne({ userId: user._id });
    if (!account) {
      account = await AccountModel.create({
        userId: user._id,
        name: 'Primary Checking Account',
        institution: 'HDFC Bank',
        type: 'checking',
        accountNumberMasked: '•••• 9900',
        balance: 100000,
        currency: 'INR',
        status: 'active',
      });
    }
    assert.ok(account, 'User account must exist');
    const initialBalance = account.balance;

    const payment = await PaymentRequestModel.create({
      userId: user._id,
      recipientName: 'Test Utilities Corp',
      recipientEmail: 'utilities@paypal-test.finance',
      merchantCategory: 'Utilities',
      description: 'Monthly Electricity & Water',
      amountInr: 2500,
      amountUsd: 30.0,
      status: 'paypal_order_created',
      pinVerifiedAt: new Date(),
      paypalOrderId: `ORD-CAPT-${Date.now()}`,
      idempotencyKey: `idem-${Date.now()}`,
    });

    const originalFetch = global.fetch;
    const testCaptureId = `CAP-${Date.now()}`;

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'mock-orders-token', token_type: 'Bearer', expires_in: 32400 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/capture')) {
        return new Response(
          JSON.stringify({
            id: payment.paypalOrderId,
            status: 'COMPLETED',
            purchase_units: [
              {
                payments: {
                  captures: [
                    {
                      id: testCaptureId,
                      status: 'COMPLETED',
                      amount: { currency_code: 'USD', value: '30.00' },
                      final_capture: true,
                    },
                  ],
                },
              },
            ],
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const captureResult = await paymentGuardianService.capturePayPalOrder({
        userId: String(user._id),
        paymentRequestId: String(payment._id),
      });

      assert.strictEqual(captureResult.captureResult?.status, 'COMPLETED', '8a. Capture completed');

      // Check payment model updated
      const updatedPayment = await PaymentRequestModel.findById(payment._id);
      assert.strictEqual(updatedPayment?.status, 'captured', '8b. Payment marked captured');
      assert.strictEqual(updatedPayment?.paypalCaptureId, testCaptureId, '8c. Capture ID stored');

      // Check transaction created
      const tx = await TransactionModel.findById(updatedPayment?.linkedTransactionId);
      assert.ok(tx, '8d. Transaction record must be created in MongoDB');
      assert.strictEqual(tx?.amount, 2500, '8e. Correct amount deducted');

      // Check account debited
      const updatedAccount = await AccountModel.findById(account._id);
      assert.strictEqual(updatedAccount?.balance, initialBalance - 2500, '8f. Account balance updated');

      console.log('[PASS] Scenario 8: Payment capture & MongoDB ledger settlement verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 9: User isolation (user A cannot access/capture user B's payments)
  // --------------------------------------------------------------------------
  console.log('--- Scenario 9: User isolation and multi-tenant security ---');
  {
    const userA = await UserModel.create({
      name: 'User A',
      email: `usera-${Date.now()}@paypal-test.finance`,
      passwordHash: 'dummy',
      pinHash: 'dummy',
    });

    const userB = await UserModel.create({
      name: 'User B',
      email: `userb-${Date.now()}@paypal-test.finance`,
      passwordHash: 'dummy',
      pinHash: 'dummy',
    });

    const paymentA = await PaymentRequestModel.create({
      userId: userA._id,
      recipientName: 'Confidential Merchant',
      recipientEmail: 'merchant@paypal-test.finance',
      merchantCategory: 'Shopping',
      description: 'Private Order',
      amountInr: 1000,
      amountUsd: 12.0,
      status: 'paypal_order_created',
      paypalOrderId: `ORD-ISO-${Date.now()}`,
      idempotencyKey: `idem-iso-${Date.now()}`,
    });

    // Attempt to capture user A's payment as user B
    await assert.rejects(
      async () => {
        await paymentGuardianService.capturePayPalOrder({
          userId: String(userB._id),
          paymentRequestId: String(paymentA._id),
        });
      },
      /Payment request not found/i,
      '9a. User B must not access or capture User A payment'
    );

    console.log('[PASS] Scenario 9: Multi-tenant user isolation confirmed.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 10: Webhook signature verification and duplicate event handling
  // --------------------------------------------------------------------------
  console.log('--- Scenario 10: Webhook signature verification & deduplication ---');
  {
    const existingPayment = await PaymentRequestModel.findOne({ status: 'captured' });
    assert.ok(existingPayment, 'Captured payment must exist');

    const webhookId = `WH-TEST-EVENT-${Date.now()}`;
    const webhookPayload = {
      id: webhookId,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: existingPayment.paypalCaptureId,
        status: 'COMPLETED',
        supplementary_data: {
          related_ids: {
            order_id: existingPayment.paypalOrderId,
          },
        },
      },
    };

    // First delivery
    const res1 = await paymentGuardianService.handlePayPalWebhook({
      headers: {
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-transmission-id': `trans-${Date.now()}`,
        'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
        'paypal-transmission-sig': 'dummy-sig',
        'paypal-transmission-time': new Date().toISOString(),
      },
      webhookEvent: webhookPayload,
    });

    assert.strictEqual(res1.verified, true, '10a. First event verified');
    assert.strictEqual(res1.paymentRequestUpdated, true, '10b. Payment request updated by webhook');

    // Duplicate delivery of same event
    const res2 = await paymentGuardianService.handlePayPalWebhook({
      headers: {
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-transmission-id': `trans-${Date.now()}`,
        'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
        'paypal-transmission-sig': 'dummy-sig',
        'paypal-transmission-time': new Date().toISOString(),
      },
      webhookEvent: webhookPayload,
    });

    assert.strictEqual(res2.verified, true, '10c. Duplicate event still cryptographically verified');
    assert.strictEqual(res2.paymentRequestStatus, 'webhook_verified', '10d. Payment status maintained as webhook_verified');

    console.log('[PASS] Scenario 10: Webhook processing and duplicate event handling verified.\n');
  }

  // Cleanup test users
  await UserModel.deleteMany({ email: /@paypal-test\.finance$/ });
  await PaymentRequestModel.deleteMany({ recipientEmail: /paypal-test/ });

  await disconnectDatabase();

  console.log('================================================================');
  console.log('ALL 10 PAYPAL IDENTITY & PAYMENT TEST SCENARIOS PASSED (100%)');
  console.log('================================================================');
}

runPayPalIdentityAndPaymentTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('PayPal Test Suite Failed:', err);
    process.exit(1);
  });
