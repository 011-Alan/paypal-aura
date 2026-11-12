const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const FRONTEND_URL = 'https://aura-frontend-izl2.onrender.com';
const BACKEND_URL = 'https://aura-backend-api-88nx.onrender.com/api';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../AURA_Submission/Screenshots');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loginUser(email, password) {
  const resp = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json();
  if (!data.success) {
    throw new Error(`Login failed for ${email}: ${data.error}`);
  }
  return data;
}

async function run() {
  console.log('--- CAPTURING AURA APPLICATION SCREENSHOTS ---');
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // 1. Authenticate Demo Personas
  console.log('Authenticating demo user Alex Sharma...');
  const alexAuth = await loginUser('alex@aura-demo.finance', 'AuraDemo#2026');
  console.log('Authenticating demo merchant Bruce Wayne...');
  const bruceAuth = await loginUser('bruce_wayne@business.example.com', 'BruceBusiness#2026');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 2 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();

  // Helper to set local auth session
  async function setSession(token, user) {
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate((t, u) => {
      localStorage.setItem('aura_auth_token', t);
      localStorage.setItem('aura_auth_user', JSON.stringify(u));
    }, token, user);
  }

  try {
    // =========================================================================
    // 01_Dashboard.png
    // =========================================================================
    console.log('Capturing 01_Dashboard.png...');
    await setSession(alexAuth.token, alexAuth.user);
    await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_Dashboard.png') });
    console.log('Saved 01_Dashboard.png');

    // =========================================================================
    // 02_Ask_AURA.png
    // =========================================================================
    console.log('Capturing 02_Ask_AURA.png...');
    await page.goto(`${FRONTEND_URL}/ask-aura`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_Ask_AURA.png') });
    console.log('Saved 02_Ask_AURA.png');

    // =========================================================================
    // 03_Transactions.png
    // =========================================================================
    console.log('Capturing 03_Transactions.png...');
    await page.goto(`${FRONTEND_URL}/spending`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_Transactions.png') });
    console.log('Saved 03_Transactions.png');

    // =========================================================================
    // 04_Financial_Goals.png
    // =========================================================================
    console.log('Capturing 04_Financial_Goals.png...');
    await page.goto(`${FRONTEND_URL}/goals`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_Financial_Goals.png') });
    console.log('Saved 04_Financial_Goals.png');

    // =========================================================================
    // 05_Commitments.png
    // =========================================================================
    console.log('Capturing 05_Commitments.png...');
    await page.goto(`${FRONTEND_URL}/commitments`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_Commitments.png') });
    console.log('Saved 05_Commitments.png');

    // =========================================================================
    // 06_Commerce.png
    // =========================================================================
    console.log('Capturing 06_Commerce.png...');
    await page.goto(`${FRONTEND_URL}/smart-purchases`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_Commerce.png') });
    console.log('Saved 06_Commerce.png');

    // =========================================================================
    // 07_Product_Comparison.png (Product details & affordability evaluation)
    // =========================================================================
    console.log('Capturing 07_Product_Comparison.png...');
    // Click on the first product card if available
    const productCard = await page.$('button[class*="group flex flex-col"], div[class*="rounded-3xl cursor-pointer"]');
    if (productCard) {
      await productCard.click();
      await sleep(2000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_Product_Comparison.png') });
    console.log('Saved 07_Product_Comparison.png');

    // =========================================================================
    // 08_PayPal_Checkout.png
    // =========================================================================
    console.log('Capturing 08_PayPal_Checkout.png...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const buyBtn = btns.find((b) => /buy now|checkout|proceed to paypal|purchase/i.test(b.innerText));
      if (buyBtn) buyBtn.click();
    });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_PayPal_Checkout.png') });
    console.log('Saved 08_PayPal_Checkout.png');

    // =========================================================================
    // 09_Merchant_Hub.png (Logged in as Bruce Wayne, Merchant Persona)
    // =========================================================================
    console.log('Capturing 09_Merchant_Hub.png with Bruce Wayne session...');
    await setSession(bruceAuth.token, bruceAuth.user);
    await page.goto(`${FRONTEND_URL}/smart-purchases`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1500);
    // Click on "Merchant Hub" tab if present
    const merchantTab = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.includes('Merchant Hub'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_Merchant_Hub.png') });
    console.log('Saved 09_Merchant_Hub.png');

    // =========================================================================
    // 10_Purchase_Tracking.png (Customer order tracking & timeline)
    // =========================================================================
    console.log('Capturing 10_Purchase_Tracking.png...');
    await setSession(alexAuth.token, alexAuth.user);
    await page.goto(`${FRONTEND_URL}/smart-purchases`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1500);
    // Click on "My Purchases" tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.includes('My Purchases') || b.innerText.includes('Tracking'));
      if (btn) btn.click();
    });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_Purchase_Tracking.png') });
    console.log('Saved 10_Purchase_Tracking.png');

    console.log('All 10 screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
