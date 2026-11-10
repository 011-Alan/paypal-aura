import { env } from '../config/env';
import { logger } from '../config/logger';
import { channel3Integration } from '../integrations/channel3';

async function main() {
  console.log('===============================================================');
  console.log('  PROJECT AURA — CHANNEL3 INTEGRATION VERIFICATION SUITE');
  console.log('===============================================================');
  console.log(`Endpoint: ${env.CHANNEL3_API_URL}/search`);
  console.log(`API Key Configured: ${Boolean(env.CHANNEL3_API_KEY)} (Length: ${env.CHANNEL3_API_KEY ? env.CHANNEL3_API_KEY.length : 0})`);
  console.log('---------------------------------------------------------------\n');

  const testQueries = [
    'Wireless headphones',
    'Gaming laptops',
    'Smartphones',
    'Mechanical keyboards',
    'Running shoes',
  ];

  const results = await channel3Integration.runVerificationSuite(testQueries);

  for (const r of results.results) {
    console.log(`\n===============================================================`);
    console.log(`Query: "${r.query}"`);
    console.log(`HTTP Status: ${r.httpStatus}`);
    console.log(`Duration: ${r.durationMs}ms`);
    console.log(`Live API Used: ${r.liveApiUsed}`);
    console.log(`Returned Products Count: ${r.returnedProductsCount}`);
    console.log(`Status Message: ${r.statusMessage}`);
    if (r.errorDetails) {
      console.log(`Error Details: ${r.errorDetails}`);
    }
    if (r.sampleProducts && r.sampleProducts.length > 0) {
      console.log(`Sample Products:`);
      r.sampleProducts.forEach((p: any, i: number) => {
        console.log(`  [${i + 1}] ${p.title}`);
        console.log(`      Brand: ${p.brand} | Category: ${p.category}`);
        console.log(`      Price: ${p.currency} ${p.currency === 'INR' ? p.priceInr : p.priceUsd} (Retailer: ${p.retailer})`);
        console.log(`      Image: ${p.image}`);
        console.log(`      URL:   ${p.purchaseUrl}`);
      });
    }
    console.log(`===============================================================`);
  }
}

main().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
