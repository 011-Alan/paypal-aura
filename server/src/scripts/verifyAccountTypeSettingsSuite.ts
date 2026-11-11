import http from 'http';
import { AddressInfo } from 'net';
import mongoose from 'mongoose';
import assert from 'assert';
import { app } from '../index';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { UserModel } from '../models';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';

export async function runAccountTypeSettingsSuite() {
  console.log('========================================================================');
  console.log('  ACCOUNT TYPE SELECTION & BUSINESS OPERATING MODE VERIFICATION SUITE   ');
  console.log('========================================================================\n');

  await connectDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[Test Harness] Ephemeral test server running at ${baseUrl}\n`);

  let passed = 0;
  let total = 0;

  async function test(num: number, title: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      console.log(` [✓] Test ${num}: ${title}`);
      passed++;
    } catch (err: any) {
      console.error(` [✗] Test ${num}: ${title} FAILED:`, err.message);
      throw err;
    }
  }

  // HTTP helper
  async function api(path: string, options: any = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  }

  const testEmail = `test_account_type_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const testPin = '1234';
  let userToken = '';
  let userId = '';

  try {
    // 1. A new user defaults to Personal Account
    await test(1, 'A new user defaults to Personal Account', async () => {
      const regRes = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Jordan Lee',
          email: testEmail,
          password: testPassword,
          pin: testPin,
          monthlyIncome: 6500,
        }),
      });

      assert.strictEqual(regRes.status, 201, `Registration failed: ${JSON.stringify(regRes.data)}`);
      userToken = regRes.data.token;
      userId = regRes.data.user.id;

      // Verify returned user object defaults to personal
      assert.strictEqual(regRes.data.user.accountType, 'personal', 'Returned user accountType must default to personal');

      // Verify MongoDB store defaults to personal
      const dbUser = await UserModel.findById(userId);
      assert.ok(dbUser, 'User must exist in MongoDB');
      assert.strictEqual(dbUser.accountType, 'personal', 'MongoDB user accountType must be "personal"');
      assert.strictEqual(dbUser.merchantAccessEnabled, false, 'Merchant access must be false');
    });

    // 2. Selecting Business Account saves successfully
    await test(2, 'Selecting Business Account saves successfully via /api/auth/account-type', async () => {
      const switchRes = await api('/api/auth/account-type', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ accountType: 'business' }),
      });

      assert.strictEqual(switchRes.status, 200, `Expected HTTP 200, got ${switchRes.status}: ${JSON.stringify(switchRes.data)}`);
      assert.strictEqual(switchRes.data.success, true);
      assert.strictEqual(switchRes.data.user.accountType, 'business', 'Returned user.accountType must be "business"');
      assert.strictEqual(switchRes.data.user.auraAccountType, 'BUSINESS', 'Returned user.auraAccountType must be "BUSINESS"');

      // Verify in MongoDB
      const dbUser = await UserModel.findById(userId);
      assert.strictEqual(dbUser?.accountType, 'business', 'MongoDB user.accountType must be updated to "business"');
      assert.strictEqual(dbUser?.auraAccountType, 'BUSINESS', 'MongoDB user.auraAccountType must be "BUSINESS"');
      // Verify PayPal account is NOT falsely claimed as verified
      assert.strictEqual(dbUser?.merchantAccessEnabled, false, 'merchantAccessEnabled must remain false without PayPal verification');
    });

    // 3. Refreshing the page preserves the selection
    await test(3, 'Refreshing page (GET /api/auth/me) preserves the selection', async () => {
      const meRes = await api('/api/auth/me', {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      assert.strictEqual(meRes.status, 200);
      assert.strictEqual(meRes.data.user.accountType, 'business', 'Refreshed user must still have accountType "business"');
      assert.strictEqual(meRes.data.user.auraAccountType, 'BUSINESS');
    });

    // 4. Logging out and logging back in preserves the selection
    await test(4, 'Logging out and logging back in preserves the selection', async () => {
      const loginRes = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });

      assert.strictEqual(loginRes.status, 200);
      assert.strictEqual(loginRes.data.user.accountType, 'business', 'Login response must preserve accountType "business"');
      userToken = loginRes.data.token; // Update with freshly issued session token
    });

    // 5. Switching back to Personal Account works
    await test(5, 'Switching back to Personal Account works', async () => {
      const switchBackRes = await api('/api/auth/account-type', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ accountType: 'personal' }),
      });

      assert.strictEqual(switchBackRes.status, 200);
      assert.strictEqual(switchBackRes.data.user.accountType, 'personal', 'Returned user.accountType must be "personal"');

      const dbUser = await UserModel.findById(userId);
      assert.strictEqual(dbUser?.accountType, 'personal', 'MongoDB user.accountType must be "personal"');
      assert.strictEqual(dbUser?.auraAccountType, 'PERSONAL', 'MongoDB user.auraAccountType must be "PERSONAL"');
    });

    // 6. Merchant Hub visibility updates correctly
    await test(6, 'Merchant Hub visibility updates correctly across Personal and Business modes', async () => {
      // Helper simulating AppShell's isBusinessOrMerchant logic:
      const evaluateVisibility = (userObj: any) => {
        return Boolean(
          userObj?.accountType === 'business' ||
          userObj?.auraAccountType === 'BUSINESS' ||
          userObj?.merchantAccessEnabled === true
        );
      };

      // When Personal:
      const personalUser = await UserModel.findById(userId);
      assert.strictEqual(evaluateVisibility(personalUser), false, 'Merchant Hub must be HIDDEN when accountType is personal');

      // Switch to Business:
      await api('/api/auth/account-type', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ accountType: 'business' }),
      });
      const businessUser = await UserModel.findById(userId);
      assert.strictEqual(evaluateVisibility(businessUser), true, 'Merchant Hub must be VISIBLE when accountType is business');
    });

    // 7. Direct API access remains protected by backend authorization
    await test(7, 'Direct API access to privileged merchant endpoints remains protected (HTTP 403)', async () => {
      // User is currently in Business operating mode, but has NOT passed PayPal merchant verification
      const dbUser = await UserModel.findById(userId);
      assert.strictEqual(dbUser?.accountType, 'business');
      assert.strictEqual(dbUser?.merchantAccessEnabled, false);

      // Attempt direct call to protected merchant orders endpoint
      const protectedRes = await api('/api/ecommerce/merchant/orders', {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      assert.strictEqual(
        protectedRes.status,
        403,
        `Expected HTTP 403 Forbidden for unverified merchant API call, got ${protectedRes.status}`
      );
      assert.strictEqual(protectedRes.data.success, false);
      assert.strictEqual(protectedRes.data.code, 'MERCHANT_VERIFICATION_REQUIRED');
    });

    // 8. Ask AURA receives the correct account type
    await test(8, 'Ask AURA receives the correct account type and provides mode-specific financial assistance', async () => {
      // 8a. User in Business mode asks for business financial analytics
      const busPrompt = 'Analyze my business finances';
      const busRes = await auraAiOrchestrator.processMessage({
        userId,
        prompt: busPrompt,
        conversationHistory: [],
      });

      assert.ok(busRes.explanation, 'Ask AURA must return an explanation');
      assert.strictEqual(busRes.workflowType, 'business_intelligence', `Expected workflowType "business_intelligence", got ${busRes.workflowType}`);
      assert.ok(
        busRes.explanation.includes('Gross Revenue') || busRes.explanation.includes('Business Financial Intelligence'),
        `Explanation should contain business metrics: ${busRes.explanation}`
      );

      // 8b. Switch user back to Personal mode
      await api('/api/auth/account-type', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ accountType: 'personal' }),
      });

      // 8c. In Personal mode, Ask AURA should recognize personal operating mode
      const persRes = await auraAiOrchestrator.processMessage({
        userId,
        prompt: 'Analyze my business finances',
        conversationHistory: [],
      });

      assert.ok(
        persRes.explanation.includes('Personal Account mode') || persRes.explanation.includes('Business Account Required'),
        `Personal user should be informed they are in Personal mode: ${persRes.explanation}`
      );
    });

  } finally {
    // Cleanup test user
    if (userId) {
      await UserModel.deleteOne({ _id: userId });
    }
    server.close();
    await disconnectDatabase();
  }

  console.log('\n========================================================================');
  console.log(`  VERIFICATION RESULTS: ${passed}/${total} TESTS PASSED               `);
  console.log('========================================================================\n');
}

if (require.main === module) {
  runAccountTypeSettingsSuite().catch((err) => {
    console.error('Fatal suite failure:', err);
    process.exit(1);
  });
}
