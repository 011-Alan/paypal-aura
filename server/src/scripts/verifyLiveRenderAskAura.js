const https = require('https');

function postJson(url, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers,
      timeout: 60000,
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });
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

    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'GET',
      headers,
      timeout: 30000,
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resBody) });
        } catch {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== LIVE PRODUCTION VERIFICATION ON RENDER ===\n');

  // 1. Register test user
  const email = 'live_test_' + Date.now() + '@aurafin.com';
  const reg = await postJson('https://aura-backend-api-88nx.onrender.com/api/auth/register', {
    name: 'Sarah Jenkins',
    email,
    password: 'Password123!',
    currency: 'INR',
  });
  console.log('User registered:', email, 'status:', reg.status);
  const token = reg.data.token;
  const userId = reg.data.user.id;

  // 2. Test 'Find me a Bible'
  console.log('\n--- 1. Testing "Find me a Bible" ---');
  const t0 = Date.now();
  const res1 = await postJson('https://aura-backend-api-88nx.onrender.com/api/ai/ask', {
    prompt: 'Find me a Bible',
  }, token);
  console.log('Status:', res1.status, 'Latency:', Date.now() - t0, 'ms');
  console.log('Workflow:', res1.data?.workflowType);
  console.log('Tool Action:', JSON.stringify(res1.data?.toolAction, null, 2));
  console.log('Products Found:', res1.data?.toolAction?.data?.products?.length || res1.data?.toolAction?.data?.results?.length || 0);
  console.log('Affordability:', JSON.stringify(res1.data?.toolAction?.data?.affordability, null, 2));
  console.log('Answer preview:\n', (res1.data?.explanation || res1.data?.answer || '').slice(0, 400));

  await sleep(6500); // Respect rate limit

  // 3. Test 'Remind me to pay electricity bill on November 15'
  console.log('\n--- 2. Testing "Remind me to pay electricity bill on November 15" ---');
  const t1 = Date.now();
  const res2 = await postJson('https://aura-backend-api-88nx.onrender.com/api/ai/ask', {
    prompt: 'Remind me to pay electricity bill on November 15 at 10 AM',
  }, token);
  console.log('Status:', res2.status, 'Latency:', Date.now() - t1, 'ms');
  console.log('Workflow:', res2.data?.workflowType);
  console.log('Tool Action:', JSON.stringify(res2.data?.toolAction, null, 2));
  console.log('Answer preview:\n', (res2.data?.explanation || res2.data?.answer || '').slice(0, 400));

  // Check schedules endpoint to verify durable persistence
  const scheds = await getJson('https://aura-backend-api-88nx.onrender.com/api/schedules', token);
  console.log('Persisted schedules count:', scheds.data?.schedules?.length);
  if (scheds.data?.schedules?.length > 0) {
    console.log('First schedule:', JSON.stringify(scheds.data.schedules[0], null, 2));
  }

  await sleep(6500); // Respect rate limit

  // 4. Test 'Take me to Transactions'
  console.log('\n--- 3. Testing "Take me to Transactions" ---');
  const t2 = Date.now();
  const res3 = await postJson('https://aura-backend-api-88nx.onrender.com/api/ai/ask', {
    prompt: 'Take me to Transactions',
  }, token);
  console.log('Status:', res3.status, 'Latency:', Date.now() - t2, 'ms');
  console.log('Tool Action:', JSON.stringify(res3.data?.toolAction, null, 2));

  await sleep(6500); // Respect rate limit

  // 5. Test 'How can I improve my financial situation?'
  console.log('\n--- 4. Testing "How can I improve my financial situation?" ---');
  const t3 = Date.now();
  const res4 = await postJson('https://aura-backend-api-88nx.onrender.com/api/ai/ask', {
    prompt: 'How can I improve my financial situation?',
  }, token);
  console.log('Status:', res4.status, 'Latency:', Date.now() - t3, 'ms');
  console.log('Answer preview:\n', (res4.data?.explanation || res4.data?.answer || '').slice(0, 500));
}

main().catch(console.error);
