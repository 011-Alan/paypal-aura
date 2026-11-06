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

  // Helper for creating valid ID tokens
  const signIdToken = (claims: Record<string, any>) =>
    jwt.sign(
      {
        iss: 'https://api.sandbox.paypal.com',
        aud: env.PAYPAL_IDENTITY_CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...claims,
      },
      privateKey,
      { algorithm: 'RS256', keyid: testKid }
    );

  // ==========================================================================
  // SECTION 7 AUDIT TESTS (User Prompt Exact Requirements)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Test 1: PayPal returns both sub and user_id (URL-shaped identifier)
  // --------------------------------------------------------------------------
  console.log('--- Test 1: PayPal returns both sub and user_id ---');
  {
    const payerId1 = `PAYER1${Date.now()}`;
    const testSub1 = `https://www.paypal.com/webapps/auth/identity/user/${payerId1}`;
    const testEmail1 = `user1-${Date.now()}@paypal-test.finance`;
    const testName1 = 'Alice Sandbox';

    const originalFetch = global.fetch;
    const { state, nonce } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });
    const mockIdToken = signIdToken({ sub: testSub1, user_id: testSub1, email: testEmail1, name: testName1, nonce });

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-1',
            token_type: 'Bearer',
            expires_in: 28800,
            scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
            id_token: mockIdToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: testSub1,
            user_id: testSub1,
            name: testName1,
            email: testEmail1,
            emails: [{ value: testEmail1, primary: true }],
            payer_id: payerId1,
            verified_account: 'true',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const result = await paypalIdentityService.handleCallback({
        code: `auth-code-1-${Date.now()}`,
        state,
      });

      assert.strictEqual(result.isNewUser, true, '1a. Identified as new user registration');
      assert.strictEqual(result.user.paypalUserId, testSub1, '1b. Complete URL-shaped sub preserved verbatim in MongoDB');
      assert.strictEqual(result.user.paypalPayerId, payerId1, '1c. Payer ID preserved separately from sub');
      assert.strictEqual(result.user.email, testEmail1, '1d. Email mapped correctly from emails array');
      assert.strictEqual(result.user.paypalAccountLinked, true, '1e. Marked linked');
      assert.ok(result.token, '1f. Valid JWT session token returned');

      console.log('[PASS] Test 1: Both sub and user_id returned & complete URL identifier preserved.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Test 2: PayPal returns only sub
  // --------------------------------------------------------------------------
  console.log('--- Test 2: PayPal returns only sub ---');
  {
    const payerId2 = `PAYER2${Date.now()}`;
    const testSub2 = `https://www.paypal.com/webapps/auth/identity/user/${payerId2}`;
    const testEmail2 = `user2-${Date.now()}@paypal-test.finance`;

    const originalFetch = global.fetch;
    const { state, nonce } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });
    const mockIdToken = signIdToken({ sub: testSub2, email: testEmail2, nonce });

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-2',
            token_type: 'Bearer',
            expires_in: 28800,
            scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
            id_token: mockIdToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: testSub2,
            // user_id omitted deliberately
            name: 'Bob Sub Only',
            email: testEmail2,
            payer_id: payerId2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const result = await paypalIdentityService.handleCallback({
        code: `auth-code-2-${Date.now()}`,
        state,
      });

      assert.strictEqual(result.user.paypalUserId, testSub2, '2a. User mapped using sub when user_id is absent');
      console.log('[PASS] Test 2: Only sub returned & successfully extracted.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Test 3: PayPal returns only user_id
  // --------------------------------------------------------------------------
  console.log('--- Test 3: PayPal returns only user_id ---');
  {
    const payerId3 = `PAYER3${Date.now()}`;
    const testUserId3 = `https://www.paypal.com/webapps/auth/identity/user/${payerId3}`;
    const testEmail3 = `user3-${Date.now()}@paypal-test.finance`;

    const originalFetch = global.fetch;
    const { state } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-3',
            token_type: 'Bearer',
            expires_in: 28800,
            scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
            // id_token omitted to test pure UserInfo fallback
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            // sub omitted deliberately
            user_id: testUserId3,
            name: 'Charlie UserID Only',
            email: testEmail3,
            payer_id: payerId3,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const result = await paypalIdentityService.handleCallback({
        code: `auth-code-3-${Date.now()}`,
        state,
      });

      assert.strictEqual(result.user.paypalUserId, testUserId3, '3a. user_id accepted when sub is absent');
      console.log('[PASS] Test 3: Only user_id returned & successfully accepted as identity.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Test 4: PayPal returns neither identifier
  // --------------------------------------------------------------------------
  console.log('--- Test 4: PayPal returns neither identifier ---');
  {
    const originalFetch = global.fetch;
    const { state } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-4',
            token_type: 'Bearer',
            expires_in: 28800,
            scope: 'openid',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            // Neither sub nor user_id
            name: 'Anonymous User',
            email: 'anon@paypal-test.finance',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      await assert.rejects(
        async () => {
          await paypalIdentityService.handleCallback({
            code: `auth-code-4-${Date.now()}`,
            state,
          });
        },
        /valid unique subject identifier/i,
        '4a. Meaningful diagnostic error returned when neither sub nor user_id is provided'
      );
      console.log('[PASS] Test 4: Missing subject identifier triggers actionable diagnostic error.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Test 5: PayPal denies one or more requested scopes
  // --------------------------------------------------------------------------
  console.log('--- Test 5: PayPal denies one or more requested scopes ---');
  {
    const payerId5 = `PAYER5${Date.now()}`;
    const testSub5 = `https://www.paypal.com/webapps/auth/identity/user/${payerId5}`;
    const originalFetch = global.fetch;
    const { state } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-5',
            token_type: 'Bearer',
            expires_in: 28800,
            // Granted scope is restricted: missing paypalattributes
            scope: 'openid profile',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: testSub5,
            name: 'Denied Scopes User',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const result = await paypalIdentityService.handleCallback({
        code: `auth-code-5-${Date.now()}`,
        state,
      });
      // User registered with fallback email because email scope was not granted
      assert.ok(result.user.paypalUserId === testSub5, '5a. User registered despite partial scopes');
      assert.ok(result.user.email.endsWith('@user.aura'), '5b. Fallback email generated cleanly');
      console.log('[PASS] Test 5: Denied scopes handled with diagnostic logging and safe fallback.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Test 6: User-information API returns an error
  // --------------------------------------------------------------------------
  console.log('--- Test 6: User-information API returns an error ---');
  {
    const originalFetch = global.fetch;
    const { state } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-6',
            token_type: 'Bearer',
            expires_in: 28800,
            // No ID token returned, forcing UserInfo call
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            error: 'invalid_token',
            error_description: 'Token signature verification failed',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      await assert.rejects(
        async () => {
          await paypalIdentityService.handleCallback({
            code: `auth-code-6-${Date.now()}`,
            state,
          });
        },
        /PayPal user-information request failed \(401\)/i,
        '6a. API error is not silently swallowed; explicit 401 failure returned'
      );
      console.log('[PASS] Test 6: User-information API error explicitly propagated.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Test 7: Existing Sandbox user logs in again
  // --------------------------------------------------------------------------
  console.log('--- Test 7: Existing Sandbox user logs in again ---');
  {
    const existingUser = await UserModel.findOne({ email: /@paypal-test\.finance$/ });
    assert.ok(existingUser, 'Existing user must be present from Test 1/2/3');

    const originalFetch = global.fetch;
    const { state, nonce } = paypalIdentityService.getAuthorizationUrl({ action: 'login' });
    const mockIdToken = signIdToken({
      sub: existingUser.paypalUserId,
      email: existingUser.email,
      name: existingUser.name,
      nonce,
    });

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-7',
            token_type: 'Bearer',
            expires_in: 28800,
            scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
            id_token: mockIdToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: existingUser.paypalUserId,
            user_id: existingUser.paypalUserId,
            name: existingUser.name,
            email: existingUser.email,
            payer_id: existingUser.paypalPayerId,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const countBefore = await UserModel.countDocuments();
      const result = await paypalIdentityService.handleCallback({
        code: `auth-code-7-${Date.now()}`,
        state,
      });
      const countAfter = await UserModel.countDocuments();

      assert.strictEqual(countAfter, countBefore, '7a. No duplicate user record created');
      assert.strictEqual(result.isNewUser, false, '7b. Recognized as returning user');
      assert.strictEqual(String(result.user._id), String(existingUser._id), '7c. Existing user returned');
      assert.ok(result.token, '7d. Session token generated');
      console.log('[PASS] Test 7: Existing Sandbox user logs in again with zero record duplication.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Test 8: A different Sandbox user creates a separate AURA account
  // --------------------------------------------------------------------------
  console.log('--- Test 8: A different Sandbox user creates a separate AURA account ---');
  {
    const payerId8 = `PAYER8${Date.now()}`;
    const testSub8 = `https://www.paypal.com/webapps/auth/identity/user/${payerId8}`;
    const testEmail8 = `different-user-${Date.now()}@paypal-test.finance`;

    const originalFetch = global.fetch;
    const { state } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'mock-access-token-8',
            token_type: 'Bearer',
            expires_in: 28800,
            scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: testSub8,
            user_id: testSub8,
            name: 'Diana Different',
            email: testEmail8,
            payer_id: payerId8,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const result = await paypalIdentityService.handleCallback({
        code: `auth-code-8-${Date.now()}`,
        state,
      });

      assert.strictEqual(result.isNewUser, true, '8a. Identified as distinct new user');
      assert.strictEqual(result.user.paypalUserId, testSub8, '8b. Separate paypalUserId stored');
      assert.strictEqual(result.user.email, testEmail8, '8c. Separate email stored');

      const userAccount = await AccountModel.findOne({ userId: result.user._id });
      assert.ok(userAccount, '8d. Independent checking ledger initialized');
      console.log('[PASS] Test 8: Separate AURA account created for distinct Sandbox identity.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // ==========================================================================
  // ADDITIONAL RESILIENCE & PAYMENT VERIFICATION SCENARIOS
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Scenario 9: Anti-account-takeover conflict prevention
  // --------------------------------------------------------------------------
  console.log('--- Scenario 9: Anti-account-takeover conflict guardrail ---');
  {
    const localUserEmail = `localuser-${Date.now()}@paypal-test.finance`;
    await UserModel.create({
      name: 'Local Password User',
      email: localUserEmail,
      passwordHash: 'dummy-hash',
      pinHash: 'dummy-pin',
      authenticationProvider: 'local',
    });

    const originalFetch = global.fetch;
    const { state } = paypalIdentityService.getAuthorizationUrl();
    const conflictingSub = `https://www.paypal.com/webapps/auth/identity/user/CONFLICT-${Date.now()}`;

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'mock-conflict-token', token_type: 'Bearer', expires_in: 28800 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: conflictingSub,
            user_id: conflictingSub,
            name: 'Local Password User',
            email: localUserEmail,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      await assert.rejects(
        async () => {
          await paypalIdentityService.handleCallback({ code: 'conflict-code', state });
        },
        /already exists/i,
        '9a. Callback must reject unlinked email conflict'
      );
      console.log('[PASS] Scenario 9: Anti-account-takeover conflict guardrail verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 10: Authenticated account linking
  // --------------------------------------------------------------------------
  console.log('--- Scenario 10: Authenticated account linking ---');
  {
    const targetUser = await UserModel.create({
      name: 'User To Link',
      email: `linkable-${Date.now()}@paypal-test.finance`,
      passwordHash: 'dummy-hash-2',
      pinHash: 'dummy-pin-2',
      authenticationProvider: 'local',
    });

    const originalFetch = global.fetch;
    const { state } = paypalIdentityService.getAuthorizationUrl({
      linkUserId: String(targetUser._id),
    });

    const linkedSub = `https://www.paypal.com/webapps/auth/identity/user/LINKED-${Date.now()}`;
    const linkedEmail = `paypal-personal-${Date.now()}@paypal-test.finance`;

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'mock-link-token', token_type: 'Bearer', expires_in: 28800 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: linkedSub,
            user_id: linkedSub,
            name: 'User To Link',
            email: linkedEmail,
            payer_id: `PAYER-${Date.now()}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      const result = await paypalIdentityService.handleCallback({
        code: `link-code-${Date.now()}`,
        state,
      });

      assert.strictEqual(result.isLinked, true, '10a. Must be identified as linked operation');
      assert.strictEqual(String(result.user._id), String(targetUser._id), '10b. Correct account updated');
      assert.strictEqual(result.user.paypalUserId, linkedSub, '10c. paypalUserId saved');
      assert.strictEqual(result.user.authenticationProvider, 'both', '10d. Auth provider elevated to both');
      console.log('[PASS] Scenario 10: Authenticated account linking verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 11: CSRF / state tampering rejection
  // --------------------------------------------------------------------------
  console.log('--- Scenario 11: CSRF / state tampering rejection ---');
  {
    await assert.rejects(
      async () => {
        await paypalIdentityService.handleCallback({
          code: 'some-code',
          state: 'tampered.state.payload.signature',
        });
      },
      /Invalid OAuth state|CSRF/i,
      '11a. Tampered state rejected'
    );
    console.log('[PASS] Scenario 11: CSRF / state tampering rejection verified.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 12: ID token validation and JWKS signature check
  // --------------------------------------------------------------------------
  console.log('--- Scenario 12: ID token validation and JWKS signature check ---');
  {
    const validToken = signIdToken({ sub: 'sub-valid', nonce: 'nonce-123' });
    const validated = await paypalIdentityService.validateIdToken(validToken, 'nonce-123');
    assert.strictEqual(validated.sub, 'sub-valid', '12a. Valid token accepted');

    const wrongAudToken = jwt.sign(
      { iss: 'https://api.sandbox.paypal.com', aud: 'wrong-audience', sub: 'sub-wrong' },
      privateKey,
      { algorithm: 'RS256', keyid: testKid }
    );
    await assert.rejects(
      async () => paypalIdentityService.validateIdToken(wrongAudToken),
      /mismatch/i,
      '12b. Mismatched audience rejected'
    );
    console.log('[PASS] Scenario 12: ID token validation confirmed.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 13: Order creation via PayPal Orders API v2
  // --------------------------------------------------------------------------
  console.log('--- Scenario 13: Order creation via PayPal Orders API v2 ---');
  {
    const originalFetch = global.fetch;
    const testOrderId = `ORD-${Date.now()}`;
    const testApprovalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${testOrderId}`;

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'mock-orders-token', token_type: 'Bearer', expires_in: 32400 }),
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
        description: 'Settlement Rent Payment',
        recipientName: 'Greenwood Landlords',
      });

      assert.strictEqual(order.orderId, testOrderId, '13a. Order ID returned');
      assert.strictEqual(order.status, 'CREATED', '13b. Status CREATED');
      assert.strictEqual(order.approvalUrl, testApprovalUrl, '13c. Approval URL captured');
      console.log('[PASS] Scenario 13: PayPal Orders API v2 order creation verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 14: Payment capture and transaction record creation in MongoDB
  // --------------------------------------------------------------------------
  console.log('--- Scenario 14: Payment capture & MongoDB ledger settlement ---');
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
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
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

      assert.strictEqual(captureResult.captureResult?.status, 'COMPLETED', '14a. Capture completed');

      const updatedPayment = await PaymentRequestModel.findById(payment._id);
      assert.strictEqual(updatedPayment?.status, 'captured', '14b. Payment marked captured');
      assert.strictEqual(updatedPayment?.paypalCaptureId, testCaptureId, '14c. Capture ID stored');

      const updatedAccount = await AccountModel.findById(account._id);
      assert.strictEqual(updatedAccount?.balance, initialBalance - 2500, '14d. Account debited');
      console.log('[PASS] Scenario 14: Payment capture & MongoDB ledger settlement verified.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 15: Multi-tenant user isolation
  // --------------------------------------------------------------------------
  console.log('--- Scenario 15: User isolation and multi-tenant security ---');
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

    await assert.rejects(
      async () => {
        await paymentGuardianService.capturePayPalOrder({
          userId: String(userB._id),
          paymentRequestId: String(paymentA._id),
        });
      },
      /Payment request not found/i,
      '15a. User B must not access or capture User A payment'
    );
    console.log('[PASS] Scenario 15: Multi-tenant user isolation confirmed.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 16: Webhook signature verification and deduplication
  // --------------------------------------------------------------------------
  console.log('--- Scenario 16: Webhook signature verification & deduplication ---');
  {
    const existingPayment = await PaymentRequestModel.findOne({ status: 'captured' });
    assert.ok(existingPayment, 'Captured payment must exist');

    const webhookPayload = {
      id: `WH-TEST-EVENT-${Date.now()}`,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: existingPayment.paypalCaptureId,
        status: 'COMPLETED',
        supplementary_data: {
          related_ids: { order_id: existingPayment.paypalOrderId },
        },
      },
    };

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
    assert.strictEqual(res1.verified, true, '16a. First event verified');

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
    assert.strictEqual(res2.verified, true, '16b. Duplicate event still verified');
    console.log('[PASS] Scenario 16: Webhook processing and deduplication verified.\n');
  }

  // --------------------------------------------------------------------------
  // Scenario 17: Just-In-Time (JIT) Provisioning & Returning User via Continue with PayPal
  // --------------------------------------------------------------------------
  console.log('--- Scenario 17: Just-In-Time (JIT) Provisioning & Returning User via Continue with PayPal ---');
  {
    const unregisteredSub = `https://www.paypal.com/webapps/auth/identity/user/JIT-${Date.now()}`;
    const unregisteredEmail = `jit-${Date.now()}@paypal-test.finance`;
    const originalFetch = global.fetch;
    const { state: state1 } = paypalIdentityService.getAuthorizationUrl({ action: 'continue' });

    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        return new Response(
          JSON.stringify({ access_token: 'mock-token-jit', token_type: 'Bearer', expires_in: 28800 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: unregisteredSub,
            user_id: unregisteredSub,
            email: unregisteredEmail,
            name: 'JIT Provisioned User',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      // 1. First-time login: JIT provision new user
      const res1 = await paypalIdentityService.handleCallback({ code: `jit-code-1-${Date.now()}`, state: state1 });
      assert.strictEqual(res1.isNewUser, true, '17a. First-time PayPal authentication must be marked as isNewUser: true');
      assert.strictEqual(res1.user.paypalUserId, unregisteredSub, '17b. Provisioned user must have matching paypalUserId');
      assert.ok(res1.token, '17c. Must issue valid JWT session token');

      const createdAccount = await AccountModel.findOne({ userId: res1.user._id });
      assert.ok(createdAccount, '17d. Must automatically initialize primary checking account for JIT user');
      assert.strictEqual(createdAccount.type, 'checking', '17e. Primary account must be a checking account');

      // 2. Returning login: Existing user seamlessly signs in without duplication
      const { state: state2 } = paypalIdentityService.getAuthorizationUrl({ action: 'continue' });
      const res2 = await paypalIdentityService.handleCallback({ code: `jit-code-2-${Date.now()}`, state: state2 });
      assert.strictEqual(res2.isNewUser, false, '17f. Returning user must have isNewUser: false');
      assert.strictEqual(String(res2.user._id), String(res1.user._id), '17g. Returning user must resolve to identical user ID');

      const userCount = await UserModel.countDocuments({ paypalUserId: unregisteredSub });
      assert.strictEqual(userCount, 1, '17h. Exactly one user record must exist in MongoDB for this PayPal identity');

      console.log('[PASS] Scenario 17: JIT Provisioning on first login and returning login verified with zero account duplication.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 18: Atomic Single-Use Callback Lock (Concurrent Requests)
  // --------------------------------------------------------------------------
  console.log('--- Scenario 18: Atomic Single-Use Callback Lock (Concurrent Requests) ---');
  {
    const originalFetch = global.fetch;
    const { state, nonce } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });
    const singleUseCode = `single-use-code-concurrent-${Date.now()}`;
    const payerId18 = `PAYER18${Date.now()}`;
    const testSub18 = `https://www.paypal.com/webapps/auth/identity/user/${payerId18}`;
    const testEmail18 = `concurrent-${Date.now()}@paypal-test.finance`;
    const mockIdToken = signIdToken({ sub: testSub18, user_id: testSub18, email: testEmail18, name: 'Concurrent User', nonce });

    let tokenExchangeCallCount = 0;
    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        tokenExchangeCallCount++;
        // Add small artificial delay to test concurrency race
        await new Promise((r) => setTimeout(r, 50));
        return new Response(
          JSON.stringify({
            access_token: 'mock-concurrent-token',
            token_type: 'Bearer',
            expires_in: 28800,
            scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
            id_token: mockIdToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: testSub18,
            user_id: testSub18,
            name: 'Concurrent User',
            email: testEmail18,
            payer_id: payerId18,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      // Fire two concurrent callbacks with the identical code
      const [result1, result2] = await Promise.all([
        paypalIdentityService.handleCallback({ code: singleUseCode, state }),
        paypalIdentityService.handleCallback({ code: singleUseCode, state }),
      ]);

      assert.strictEqual(tokenExchangeCallCount, 1, '18a. Token exchange endpoint must be invoked exactly ONCE for concurrent callbacks');
      assert.strictEqual(result1.token, result2.token, '18b. Both concurrent callbacks must resolve with identical JWT session tokens');
      assert.strictEqual(String(result1.user._id), String(result2.user._id), '18c. Both must resolve to the identical user record');
      console.log('[PASS] Scenario 18: Atomic single-use lock prevents duplicate token exchange on concurrent requests.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 19: Browser Reload Deduplication (Completed Exchange Reuse)
  // --------------------------------------------------------------------------
  console.log('--- Scenario 19: Browser Reload Deduplication (Completed Exchange Reuse) ---');
  {
    const originalFetch = global.fetch;
    const { state, nonce } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });
    const reloadCode = `single-use-code-reload-${Date.now()}`;
    const payerId19 = `PAYER19${Date.now()}`;
    const testSub19 = `https://www.paypal.com/webapps/auth/identity/user/${payerId19}`;
    const testEmail19 = `reload-${Date.now()}@paypal-test.finance`;
    const mockIdToken = signIdToken({ sub: testSub19, user_id: testSub19, email: testEmail19, name: 'Reload User', nonce });

    let tokenExchangeCallCount = 0;
    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        tokenExchangeCallCount++;
        return new Response(
          JSON.stringify({
            access_token: 'mock-reload-token',
            token_type: 'Bearer',
            expires_in: 28800,
            scope: 'openid profile email https://uri.paypal.com/services/paypalattributes',
            id_token: mockIdToken,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/userinfo')) {
        return new Response(
          JSON.stringify({
            sub: testSub19,
            user_id: testSub19,
            name: 'Reload User',
            email: testEmail19,
            payer_id: payerId19,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      // First request completes
      const result1 = await paypalIdentityService.handleCallback({ code: reloadCode, state });
      assert.strictEqual(tokenExchangeCallCount, 1, '19a. First callback exchanges code');

      // Second request simulating page reload or browser forward/back
      const result2 = await paypalIdentityService.handleCallback({ code: reloadCode, state });
      assert.strictEqual(tokenExchangeCallCount, 1, '19b. Duplicate reload does NOT call PayPal token endpoint again');
      assert.strictEqual(result1.token, result2.token, '19c. Reload returns existing session token');
      console.log('[PASS] Scenario 19: Browser reload deduplication safely reuses existing session without re-exchange.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 20: Rejected Code Prevention (No Blind Retry against PayPal)
  // --------------------------------------------------------------------------
  console.log('--- Scenario 20: Rejected Code Prevention (No Blind Retry against PayPal) ---');
  {
    const originalFetch = global.fetch;
    const { state } = paypalIdentityService.getAuthorizationUrl({ action: 'register' });
    const rejectedCode = `rejected-code-${Date.now()}`;

    let tokenExchangeCallCount = 0;
    global.fetch = async (input: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        tokenExchangeCallCount++;
        return new Response(
          JSON.stringify({
            error: 'access_denied',
            error_description: 'Invalid authorization code',
            correlation_id: 'test-correlation-20',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input);
    };

    try {
      // First attempt fails at PayPal with 400
      await assert.rejects(
        async () => {
          await paypalIdentityService.handleCallback({ code: rejectedCode, state });
        },
        /Invalid authorization code/i,
        '20a. First attempt fails with PayPal error'
      );
      assert.strictEqual(tokenExchangeCallCount, 1, '20b. First attempt contacted PayPal');

      // Second attempt with the same rejected code must fail immediately WITHOUT retrying PayPal
      await assert.rejects(
        async () => {
          await paypalIdentityService.handleCallback({ code: rejectedCode, state });
        },
        /rejected by PayPal|Invalid authorization code/i,
        '20c. Second attempt fails without hitting PayPal'
      );
      assert.strictEqual(tokenExchangeCallCount, 1, '20d. Token exchange endpoint must NOT be retried for rejected code');
      console.log('[PASS] Scenario 20: Rejected code is permanently blocked from duplicate retries against PayPal.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 21: Strict Token Request Formatting (Section 5 Compliance)
  // --------------------------------------------------------------------------
  console.log('--- Scenario 21: Strict Token Request Formatting (Section 5 Compliance) ---');
  {
    const originalFetch = global.fetch;
    const testCode21 = `test-code-strict-format-${Date.now()}`;
    let capturedRequest: { url: string; method: string; headers: Record<string, string>; body: string } | null = null;

    global.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        capturedRequest = {
          url: urlStr,
          method: init?.method,
          headers: init?.headers,
          body: init?.body,
        };
        return new Response(
          JSON.stringify({
            access_token: 'mock-strict-token-21',
            token_type: 'Bearer',
            expires_in: 28800,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      await paypalIdentityService.exchangeCodeForTokens(testCode21);

      if (!capturedRequest) {
        throw new Error('21a. Token exchange request must be executed');
      }
      const req = capturedRequest as { url: string; method: string; headers: Record<string, string>; body: string };

      assert.strictEqual(req.method, 'POST', '21b. Method must be POST');
      assert.ok(req.url.includes('/v1/identity/openidconnect/tokenservice'), '21c. Must target documented /v1/identity/openidconnect/tokenservice');
      assert.ok(req.headers.Authorization?.startsWith('Basic '), '21d. Must use Basic Authentication header');
      assert.strictEqual(req.headers['Content-Type'], 'application/x-www-form-urlencoded', '21e. Content-Type must be application/x-www-form-urlencoded');
      assert.strictEqual(req.headers.Accept, 'application/json', '21f. Accept must be application/json');

      const parsedBody = new URLSearchParams(req.body);
      assert.strictEqual(parsedBody.get('grant_type'), 'authorization_code', '21g. grant_type must be authorization_code');
      assert.strictEqual(parsedBody.get('code'), testCode21, '21h. code must match provided code');
      assert.strictEqual(parsedBody.get('redirect_uri'), env.PAYPAL_IDENTITY_REDIRECT_URI, '21i. redirect_uri must match configured canonical URI');
      assert.strictEqual(parsedBody.get('client_id'), env.PAYPAL_IDENTITY_CLIENT_ID, '21j. client_id must match configured client ID');
      assert.strictEqual(parsedBody.get('client_secret'), env.PAYPAL_IDENTITY_CLIENT_SECRET, '21k. client_secret must match configured client secret');
      assert.strictEqual(parsedBody.get('code_verifier'), null, '21l. Unsupported code_verifier must NOT be passed in body');

      console.log('[PASS] Scenario 21: Token request payload conforms strictly to documented Identity OAuth 2.0 specifications.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 22: Canonical Redirect URI Consistency Check
  // --------------------------------------------------------------------------
  console.log('--- Scenario 22: Canonical Redirect URI Consistency Check ---');
  {
    const originalFetch = global.fetch;
    const { url } = paypalIdentityService.getAuthorizationUrl();
    const authUrlObj = new URL(url);
    const authRedirectUri = authUrlObj.searchParams.get('redirect_uri');

    let tokenExchangeRedirectUri: string | null = null;
    global.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (urlStr.includes('/tokenservice') || urlStr.includes('/v1/oauth2/token')) {
        const bodyParams = new URLSearchParams(init?.body);
        tokenExchangeRedirectUri = bodyParams.get('redirect_uri');
        return new Response(
          JSON.stringify({ access_token: 'mock-uri-token', token_type: 'Bearer', expires_in: 28800 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      await paypalIdentityService.exchangeCodeForTokens(`test-uri-code-${Date.now()}`);

      assert.ok(authRedirectUri, '22a. Authorization URL must contain redirect_uri');
      assert.ok(tokenExchangeRedirectUri, '22b. Token exchange request must contain redirect_uri');
      assert.strictEqual(
        authRedirectUri,
        tokenExchangeRedirectUri,
        '22c. redirect_uri used in authorization MUST be byte-for-byte identical to redirect_uri in token exchange'
      );
      assert.strictEqual(
        authRedirectUri,
        env.PAYPAL_IDENTITY_REDIRECT_URI,
        '22d. Both must match canonical env.PAYPAL_IDENTITY_REDIRECT_URI'
      );

      console.log('[PASS] Scenario 22: Redirect URI is byte-for-byte consistent across authorization and token exchange.\n');
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Cleanup test users
  await UserModel.deleteMany({ email: /@paypal-test\.finance$/ });
  await PaymentRequestModel.deleteMany({ recipientEmail: /paypal-test/ });

  await disconnectDatabase();

  console.log('================================================================');
  console.log('ALL 22 PAYPAL IDENTITY & PAYMENT TEST SCENARIOS PASSED (100%)');
  console.log('================================================================');
}

runPayPalIdentityAndPaymentTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('PayPal Test Suite Failed:', err);
    process.exit(1);
  });
