const https = require('https');

function postJson(url, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const u = new URL(url);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname,
        method: 'POST',
        headers,
        timeout: 90000,
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resBody) });
          } catch {
            resolve({ status: res.statusCode, raw: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname,
        method: 'GET',
        headers,
        timeout: 30000,
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resBody) });
          } catch {
            resolve({ status: res.statusCode, raw: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const BASE_URL = 'https://aura-backend-api-88nx.onrender.com/api';

async function main() {
  console.log('================================================================');
  console.log('  LIVE RENDER COMMERCE INTELLIGENCE & CONVERSATION TEST');
  console.log('================================================================\n');

  // 1. Authenticate user
  const email = `alex_test_${Date.now()}@aurafin.com`;
  console.log(`Registering test user: ${email}...`);
  const regRes = await postJson(`${BASE_URL}/auth/register`, {
    name: 'Alex Sharma',
    email,
    password: 'Password123!',
    currency: 'INR',
  });

  let token = regRes.data?.token;
  if (!token) {
    console.log('Switching to demo persona...');
    const demoRes = await postJson(`${BASE_URL}/auth/demo-switch`, { persona: 'personal' });
    token = demoRes.data?.token;
  }

  if (!token) {
    throw new Error('Authentication failed on live backend.');
  }
  console.log(' Successfully authenticated with live backend.\n');

  // 2. Create conversation
  const convRes = await postJson(`${BASE_URL}/conversations`, {
    title: 'Live Commerce Verification Session',
  }, token);
  const convId = convRes.data?.conversation?._id;
  console.log(`Created live conversation ID: ${convId}\n`);

  // --- Step 1: Initial ASUS Vivobook 14 Inquiry ---
  console.log('--- TURN 1: "I want to buy an ASUS Vivobook 14. Do you think I can buy it, and do you have other brands to recommend at that price range?" ---');
  const t0 = Date.now();
  const msg1Res = await postJson(`${BASE_URL}/conversations/${convId}/messages`, {
    content: 'I want to buy an ASUS Vivobook 14. Do you think I can buy it, and do you have other brands to recommend at that price range?',
  }, token);

  console.log(`Status: ${msg1Res.status}, Latency: ${Date.now() - t0}ms`);
  const ans1 = msg1Res.data?.assistantMessage?.content || msg1Res.data?.explanation || '';
  console.log(`Answer:\n${ans1.slice(0, 300)}...\n`);
  const context1 = msg1Res.data?.commerceContext || msg1Res.data?.conversation?.commerceContext;
  console.log(`Preserved Commerce Context Products: ${context1?.products?.length || 0}`);
  if (context1?.products?.[0]) {
    console.log(`First product: [${context1.products[0].id}] ${context1.products[0].name} (₹${context1.products[0].priceInr})`);
  }

  await sleep(6500); // Respect Gemini API rate limit

  // --- Step 2: Recommendation & USD Price ---
  console.log('\n--- TURN 2: "Can you recommend one of these and give me the price in USD?" ---');
  const t1 = Date.now();
  const msg2Res = await postJson(`${BASE_URL}/conversations/${convId}/messages`, {
    content: 'Can you recommend one of these and give me the price in USD?',
  }, token);

  console.log(`Status: ${msg2Res.status}, Latency: ${Date.now() - t1}ms`);
  const ans2 = msg2Res.data?.assistantMessage?.content || msg2Res.data?.explanation || '';
  console.log(`Answer:\n${ans2.slice(0, 350)}...\n`);
  const context2 = msg2Res.data?.commerceContext || msg2Res.data?.conversation?.commerceContext;
  console.log(`Recommended Product ID: ${context2?.recommendedProductId}`);

  await sleep(6500);

  // --- Step 3: Affordability Check ---
  console.log('\n--- TURN 3: "Can I afford it?" ---');
  const t2 = Date.now();
  const msg3Res = await postJson(`${BASE_URL}/conversations/${convId}/messages`, {
    content: 'Can I afford it?',
  }, token);

  console.log(`Status: ${msg3Res.status}, Latency: ${Date.now() - t2}ms`);
  const ans3 = msg3Res.data?.assistantMessage?.content || msg3Res.data?.explanation || '';
  console.log(`Answer:\n${ans3.slice(0, 350)}...\n`);

  await sleep(6500);

  // --- Step 4: Lenovo Alternative ---
  console.log('\n--- TURN 4: "Find me a cheaper Lenovo alternative." ---');
  const t3 = Date.now();
  const msg4Res = await postJson(`${BASE_URL}/conversations/${convId}/messages`, {
    content: 'Find me a cheaper Lenovo alternative.',
  }, token);

  console.log(`Status: ${msg4Res.status}, Latency: ${Date.now() - t3}ms`);
  const ans4 = msg4Res.data?.assistantMessage?.content || msg4Res.data?.explanation || '';
  console.log(`Answer:\n${ans4.slice(0, 350)}...\n`);
  const context4 = msg4Res.data?.commerceContext || msg4Res.data?.conversation?.commerceContext;
  console.log(`Alternative Products Count: ${context4?.alternativeProducts?.length || 0}`);

  await sleep(6500);

  // --- Step 5: Side-by-Side Comparison ---
  console.log('\n--- TURN 5: "Compare it with the ASUS you recommended." ---');
  const t4 = Date.now();
  const msg5Res = await postJson(`${BASE_URL}/conversations/${convId}/messages`, {
    content: 'Compare it with the ASUS you recommended.',
  }, token);

  console.log(`Status: ${msg5Res.status}, Latency: ${Date.now() - t4}ms`);
  const ans5 = msg5Res.data?.assistantMessage?.content || msg5Res.data?.explanation || '';
  console.log(`Answer:\n${ans5.slice(0, 450)}...\n`);

  await sleep(6500);

  // --- Step 6: Navigation to AURA Commerce ---
  console.log('\n--- TURN 6: "Search Vivobook 14 in AURA Commerce" ---');
  const t5 = Date.now();
  const msg6Res = await postJson(`${BASE_URL}/conversations/${convId}/messages`, {
    content: 'Search Vivobook 14 in AURA Commerce',
  }, token);

  console.log(`Status: ${msg6Res.status}, Latency: ${Date.now() - t5}ms`);
  const ans6 = msg6Res.data?.assistantMessage?.content || msg6Res.data?.explanation || '';
  console.log(`Answer:\n${ans6}`);
  console.log('Tool Action:', JSON.stringify(msg6Res.data?.toolAction, null, 2));

  console.log('\n================================================================');
  console.log('  LIVE VERIFICATION WORKFLOW COMPLETE');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Live verification failed:', err);
  process.exit(1);
});
