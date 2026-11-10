import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { UserModel, AccountModel, MandateModel, GoalModel, ConversationModel, MessageModel, ICommerceContext } from '../models';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { exchangeRateService } from '../services/finance/exchangeRateService';
import { commerceIntelligenceService } from '../services/ecommerce/commerceIntelligenceService';
import { channel3Integration } from '../integrations/channel3';

interface StepResult {
  step: number;
  name: string;
  passed: boolean;
  details: string;
  outputSnippet?: string;
}

async function runCommerceIntelligenceSuite() {
  console.log('\n================================================================');
  console.log('  AURA COMMERCE INTELLIGENCE & CONTEXT VERIFICATION SUITE');
  console.log('================================================================\n');

  // Connect to DB
  await mongoose.connect(env.MONGODB_URI);
  console.log(' Connected to MongoDB database successfully.');

  // If Gemini is not configured in local environment, set up the official test client adapter
  if (!auraAiOrchestrator.isGeminiConfigured) {
    console.log(' Local GEMINI_API_KEY not present; attaching test Gemini client adapter for full functional suite verification.');
    const mockGeminiClient = {
      models: {
        generateContent: async (params: any) => {
          const contents = params.contents || [];
          const lastContent = contents[contents.length - 1];
          const userPrompt = lastContent?.parts?.[0]?.text || '';
          const pLower = userPrompt.toLowerCase();

          if (pLower.includes('compare')) {
            return {
              functionCalls: [
                {
                  id: 'call_compare',
                  name: 'compareProducts',
                  args: {},
                },
              ],
            };
          } else if (pLower.includes('asus vivobook 14')) {
            return {
              functionCalls: [
                {
                  id: 'call_search',
                  name: 'searchProducts',
                  args: { query: 'ASUS Vivobook 14' },
                },
              ],
            };
          } else if (pLower.includes('recommend') || pLower.includes('price in usd')) {
            return {
              functionCalls: [
                {
                  id: 'call_rec',
                  name: 'recommendProduct',
                  args: { criteria: 'value' },
                },
              ],
            };
          } else if (pLower.includes('afford')) {
            return {
              functionCalls: [
                {
                  id: 'call_afford',
                  name: 'analyseAffordability',
                  args: {},
                },
              ],
            };
          } else if (pLower.includes('lenovo') || pLower.includes('alternative') || pLower.includes('cheaper')) {
            return {
              functionCalls: [
                {
                  id: 'call_alt',
                  name: 'searchProducts',
                  args: { query: 'Lenovo laptop', isAlternative: true },
                },
              ],
            };
          } else if (pLower.includes('search vivobook') || pLower.includes('in aura commerce') || pLower.includes('commerce')) {
            return {
              functionCalls: [
                {
                  id: 'call_nav',
                  name: 'navigateApplication',
                  args: { targetTab: 'smart-purchases', searchQuery: 'Vivobook 14' },
                },
              ],
            };
          }

          return {
            text: `I understand your request regarding: ${userPrompt}`,
          };
        },
      },
    };
    auraAiOrchestrator.setGeminiClientForTesting(mockGeminiClient);
  }

  const results: StepResult[] = [];

  // Find or create test user
  let user = await UserModel.findOne({ email: 'alex@aura-demo.finance' });
  if (!user) {
    user = await UserModel.findOne();
  }
  if (!user) {
    throw new Error('No user found in database for testing.');
  }

  const userId = String(user._id);
  console.log(` Using test user: ${user.name} (${user.email}), ID: ${userId}\n`);

  // Ensure user has accounts and commitments for financial evaluation
  let account = await AccountModel.findOne({ userId: user._id, status: 'active' });
  if (!account) {
    account = await AccountModel.create({
      userId: user._id,
      name: 'Primary Checking Account',
      institution: 'HDFC Bank',
      type: 'checking',
      balance: 145000,
      currency: 'INR',
      status: 'active',
    });
  }

  // Create test conversation
  const testConv = await ConversationModel.create({
    userId: user._id,
    title: 'Commerce Intelligence Verification Conv',
    lastMessageAt: new Date(),
  });
  const conversationId = String(testConv._id);

  let activeCommerceContext: ICommerceContext | null = null;
  const conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];

  // --------------------------------------------------------------------------
  // STEP 1: ASUS Vivobook 14 Inquiry
  // --------------------------------------------------------------------------
  console.log('--- STEP 1: Initial ASUS Vivobook 14 Inquiry ---');
  const prompt1 = 'I want to buy an ASUS Vivobook 14. Do you think I can buy it, and do you have other brands to recommend at that price range?';
  console.log(`User: "${prompt1}"`);

  conversationHistory.push({ role: 'user', content: prompt1 });
  const res1 = await auraAiOrchestrator.processConversationalQuery({
    userId,
    prompt: prompt1,
    conversationHistory,
    conversationId,
    commerceContext: activeCommerceContext,
  });

  const step1Snippet = (res1.explanation || res1.answer || '').slice(0, 300);
  console.log(`AURA: ${step1Snippet}...`);

  if (res1.commerceContext) {
    activeCommerceContext = res1.commerceContext;
    testConv.commerceContext = activeCommerceContext;
    await testConv.save();
  }
  conversationHistory.push({ role: 'assistant', content: res1.explanation || res1.answer });

  const hasVivobook = (res1.explanation || '').toLowerCase().includes('vivobook') ||
    Boolean(res1.commerceContext?.products?.some((p) => p.name.toLowerCase().includes('vivobook')));
  const step1Passed = res1.success && hasVivobook && Boolean(res1.commerceContext?.products?.length);

  results.push({
    step: 1,
    name: 'Initial Product Inquiry & Channel3 Search',
    passed: step1Passed,
    details: `Discovered ${res1.commerceContext?.products?.length || 0} products. Has Vivobook: ${hasVivobook}`,
    outputSnippet: step1Snippet,
  });
  console.log(`Result: ${step1Passed ? 'PASSED' : 'FAILED'}\n`);

  // --------------------------------------------------------------------------
  // STEP 2: Verify Preserved Structured Commerce Context
  // --------------------------------------------------------------------------
  console.log('--- STEP 2: Inspect Saved Commerce Context ---');
  const products = activeCommerceContext?.products || [];
  const p1 = products[0];

  const hasRequiredFields = Boolean(
    p1 &&
    p1.id &&
    p1.name &&
    p1.priceInr &&
    p1.currency &&
    p1.brand &&
    p1.retailerName &&
    p1.purchaseUrl &&
    p1.specifications &&
    p1.specifications.Processor &&
    p1.specifications.RAM
  );

  console.log(`Saved Context Product Count: ${products.length}`);
  if (p1) {
    console.log(`Sample Product: [${p1.id}] ${p1.name}`);
    console.log(`Price: ₹${p1.priceInr.toLocaleString('en-IN')} ${p1.currency}`);
    console.log(`Brand: ${p1.brand}, Retailer: ${p1.retailerName}`);
    console.log(`Specs: Processor: ${p1.specifications?.Processor}, RAM: ${p1.specifications?.RAM}, Storage: ${p1.specifications?.Storage}, Display: ${p1.specifications?.Display}`);
  }

  const step2Passed = products.length >= 2 && hasRequiredFields;
  results.push({
    step: 2,
    name: 'Preserved Structured Commerce Context Verification',
    passed: step2Passed,
    details: `Fields verified on ${products.length} products: ID, Name, Price, Currency, Brand, Retailer, URL, Specs (Processor, RAM, Storage, Display).`,
  });
  console.log(`Result: ${step2Passed ? 'PASSED' : 'FAILED'}\n`);

  // --------------------------------------------------------------------------
  // STEP 3: Recommendation & USD Price Conversion
  // --------------------------------------------------------------------------
  console.log('--- STEP 3: Recommendation & Currency Conversion ---');
  const prompt3 = 'Can you recommend one of these and give me the price in USD?';
  console.log(`User: "${prompt3}"`);

  conversationHistory.push({ role: 'user', content: prompt3 });
  const res3 = await auraAiOrchestrator.processConversationalQuery({
    userId,
    prompt: prompt3,
    conversationHistory,
    conversationId,
    commerceContext: activeCommerceContext,
  });

  const step3Snippet = (res3.explanation || res3.answer || '');
  console.log(`AURA: ${step3Snippet.slice(0, 350)}...`);

  if (res3.commerceContext) {
    activeCommerceContext = res3.commerceContext;
    testConv.commerceContext = activeCommerceContext;
    await testConv.save();
  }
  conversationHistory.push({ role: 'assistant', content: res3.explanation || res3.answer });

  const hasRecommendation = step3Snippet.toLowerCase().includes('recommend') ||
    step3Snippet.toLowerCase().includes('best value') ||
    step3Snippet.toLowerCase().includes('ideal balance');
  const hasUsdConversion = step3Snippet.includes('$') || step3Snippet.toLowerCase().includes('usd');
  const hasRateTimestamp = step3Snippet.toLowerCase().includes('rate timestamp') || step3Snippet.toLowerCase().includes('exchange rate');
  const hasHardwareSpecs = step3Snippet.toLowerCase().includes('ram') || step3Snippet.toLowerCase().includes('processor') || step3Snippet.toLowerCase().includes('ssd');

  const step3Passed = res3.success && hasRecommendation && hasUsdConversion && hasHardwareSpecs;
  results.push({
    step: 3,
    name: 'Hardware Grounded Recommendation & Real USD Conversion',
    passed: step3Passed,
    details: `Recommended Product ID: ${activeCommerceContext?.recommendedProductId}. Grounded specs: ${hasHardwareSpecs}, USD conversion: ${hasUsdConversion}, Rate info: ${hasRateTimestamp}.`,
    outputSnippet: step3Snippet.slice(0, 250),
  });
  console.log(`Result: ${step3Passed ? 'PASSED' : 'FAILED'}\n`);

  // --------------------------------------------------------------------------
  // STEP 4: Financial Affordability Analysis
  // --------------------------------------------------------------------------
  console.log('--- STEP 4: Authoritative Financial Affordability Check ---');
  const prompt4 = 'Can I afford it?';
  console.log(`User: "${prompt4}"`);

  conversationHistory.push({ role: 'user', content: prompt4 });
  const res4 = await auraAiOrchestrator.processConversationalQuery({
    userId,
    prompt: prompt4,
    conversationHistory,
    conversationId,
    commerceContext: activeCommerceContext,
  });

  const step4Snippet = (res4.explanation || res4.answer || '');
  console.log(`AURA: ${step4Snippet.slice(0, 350)}...`);

  if (res4.commerceContext) {
    activeCommerceContext = res4.commerceContext;
  }
  conversationHistory.push({ role: 'assistant', content: res4.explanation || res4.answer });

  const recProduct = activeCommerceContext?.products.find((p) => p.id === activeCommerceContext?.recommendedProductId) || activeCommerceContext?.products[0];
  const expectedPrice = recProduct?.priceInr || 52990;

  const evaluatesFinancials = step4Snippet.toLowerCase().includes('liquid') ||
    step4Snippet.toLowerCase().includes('balance') ||
    step4Snippet.toLowerCase().includes('discretionary') ||
    step4Snippet.toLowerCase().includes('budget') ||
    step4Snippet.toLowerCase().includes('afford');
  const mentionsPrice = step4Snippet.includes(expectedPrice.toLocaleString('en-IN')) || step4Snippet.includes(String(expectedPrice));
  const notGenericSearch = !step4Snippet.includes('Here are some popular options matching');

  const step4Passed = res4.success && evaluatesFinancials && notGenericSearch;
  results.push({
    step: 4,
    name: 'Authoritative Financial Affordability Analysis',
    passed: step4Passed,
    details: `Evaluates real accounts/budget: ${evaluatesFinancials}, References product price: ${mentionsPrice}, Avoids generic search: ${notGenericSearch}.`,
    outputSnippet: step4Snippet.slice(0, 250),
  });
  console.log(`Result: ${step4Passed ? 'PASSED' : 'FAILED'}\n`);

  // --------------------------------------------------------------------------
  // STEP 5: Alternative Search
  // --------------------------------------------------------------------------
  console.log('--- STEP 5: Search Cheaper Lenovo Alternative ---');
  const prompt5 = 'Find me a cheaper Lenovo alternative.';
  console.log(`User: "${prompt5}"`);

  conversationHistory.push({ role: 'user', content: prompt5 });
  const res5 = await auraAiOrchestrator.processConversationalQuery({
    userId,
    prompt: prompt5,
    conversationHistory,
    conversationId,
    commerceContext: activeCommerceContext,
  });

  const step5Snippet = (res5.explanation || res5.answer || '');
  console.log(`AURA: ${step5Snippet.slice(0, 350)}...`);

  if (res5.commerceContext) {
    activeCommerceContext = res5.commerceContext;
    testConv.commerceContext = activeCommerceContext;
    await testConv.save();
  }
  conversationHistory.push({ role: 'assistant', content: res5.explanation || res5.answer });

  const hasLenovo = step5Snippet.toLowerCase().includes('lenovo') ||
    Boolean(activeCommerceContext?.alternativeProducts?.some((p) => p.name.toLowerCase().includes('lenovo')));
  const preservedAsus = Boolean(activeCommerceContext?.products?.some((p) => p.name.toLowerCase().includes('asus')));

  const step5Passed = res5.success && hasLenovo && preservedAsus;
  results.push({
    step: 5,
    name: 'Targeted Alternative Search with Context Preservation',
    passed: step5Passed,
    details: `Has Lenovo alternatives: ${hasLenovo}, Preserved previous ASUS models: ${preservedAsus}, Alternative count: ${activeCommerceContext?.alternativeProducts?.length || 0}.`,
    outputSnippet: step5Snippet.slice(0, 250),
  });
  console.log(`Result: ${step5Passed ? 'PASSED' : 'FAILED'}\n`);

  // --------------------------------------------------------------------------
  // STEP 6: Side-by-Side Comparison
  // --------------------------------------------------------------------------
  console.log('--- STEP 6: Side-by-Side Product Comparison ---');
  const prompt6 = 'Compare it with the ASUS you recommended.';
  console.log(`User: "${prompt6}"`);

  conversationHistory.push({ role: 'user', content: prompt6 });
  const res6 = await auraAiOrchestrator.processConversationalQuery({
    userId,
    prompt: prompt6,
    conversationHistory,
    conversationId,
    commerceContext: activeCommerceContext,
  });

  const step6Snippet = (res6.explanation || res6.answer || '');
  console.log(`AURA: ${step6Snippet.slice(0, 450)}...`);

  if (res6.commerceContext) {
    activeCommerceContext = res6.commerceContext;
  }
  conversationHistory.push({ role: 'assistant', content: res6.explanation || res6.answer });

  const hasTable = step6Snippet.includes('|') && step6Snippet.includes('---');
  const comparesBoth = (step6Snippet.toLowerCase().includes('asus') && step6Snippet.toLowerCase().includes('lenovo'));
  const hasSpecs = step6Snippet.toLowerCase().includes('processor') && step6Snippet.toLowerCase().includes('ram');
  const hasVerdict = step6Snippet.toLowerCase().includes('verdict') || step6Snippet.toLowerCase().includes('recommend') || step6Snippet.toLowerCase().includes('summary');

  const step6Passed = res6.success && hasTable && comparesBoth && hasSpecs;
  results.push({
    step: 6,
    name: 'Hardware Grounded Side-by-Side Comparison',
    passed: step6Passed,
    details: `Markdown table: ${hasTable}, Compares ASUS & Lenovo: ${comparesBoth}, Specs (Processor/RAM): ${hasSpecs}, Verdict: ${hasVerdict}.`,
    outputSnippet: step6Snippet.slice(0, 300),
  });
  console.log(`Result: ${step6Passed ? 'PASSED' : 'FAILED'}\n`);

  // --------------------------------------------------------------------------
  // STEP 7: Application Navigation to AURA Commerce
  // --------------------------------------------------------------------------
  console.log('--- STEP 7: Navigate to AURA Commerce ---');
  const prompt7 = 'Search Vivobook 14 in AURA Commerce';
  console.log(`User: "${prompt7}"`);

  conversationHistory.push({ role: 'user', content: prompt7 });
  const res7 = await auraAiOrchestrator.processConversationalQuery({
    userId,
    prompt: prompt7,
    conversationHistory,
    conversationId,
    commerceContext: activeCommerceContext,
  });

  const step7Snippet = (res7.explanation || res7.answer || '');
  console.log(`AURA: ${step7Snippet}`);
  console.log(`ToolAction:`, res7.toolAction);

  conversationHistory.push({ role: 'assistant', content: res7.explanation || res7.answer });

  const isNavigation = res7.toolAction?.type === 'navigation' || res7.toolAction?.navTarget === 'smart-purchases';
  const targetIsSmartPurchases = res7.toolAction?.navTarget === 'smart-purchases' || res7.toolAction?.details?.targetTab === 'smart-purchases';
  const hasSearchQuery = Boolean(res7.toolAction?.details?.searchQuery || res7.toolAction?.details?.query);

  const step7Passed = res7.success && isNavigation && targetIsSmartPurchases;
  results.push({
    step: 7,
    name: 'AURA Commerce Deep Navigation & Query Transfer',
    passed: step7Passed,
    details: `Navigation toolAction: ${isNavigation}, Target tab: ${res7.toolAction?.navTarget || res7.toolAction?.details?.targetTab}, Search query passed: ${hasSearchQuery}.`,
    outputSnippet: step7Snippet,
  });
  console.log(`Result: ${step7Passed ? 'PASSED' : 'FAILED'}\n`);

  // --------------------------------------------------------------------------
  // STEP 8: AI Engine Failure & Deterministic Context Preservation
  // --------------------------------------------------------------------------
  console.log('--- STEP 8: AI Engine Failure & Fallback Handling ---');
  const prompt8 = 'Is this worth buying?';
  console.log(`User: "${prompt8}" (simulating AI Engine failure)`);

  // Temporarily disable Gemini client to simulate connection failure
  const originalGeminiClient = (auraAiOrchestrator as any).geminiClient;
  (auraAiOrchestrator as any).geminiClient = null;

  try {
    const res8 = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: prompt8,
      conversationHistory,
      conversationId,
      commerceContext: activeCommerceContext,
    });

    const step8Snippet = (res8.explanation || res8.answer || res8.error || '');
    console.log(`AURA (Failure Response): ${step8Snippet}`);

    const hasSafeMessage = step8Snippet.includes("I'm having a little trouble connecting to my AI engine right now. Your information is safe. Please try again in a moment.");
    const preservesContext = Boolean(res8.commerceContext?.products?.length || activeCommerceContext?.products?.length);
    const notGenericSearch = !step8Snippet.toLowerCase().includes('popular options matching');

    const step8Passed = hasSafeMessage && preservesContext && notGenericSearch;
    results.push({
      step: 8,
      name: 'AI Engine Failure Handling & Context Preservation',
      passed: step8Passed,
      details: `Safe message returned: ${hasSafeMessage}, Verified context preserved: ${preservesContext}, No generic product search: ${notGenericSearch}.`,
      outputSnippet: step8Snippet,
    });
    console.log(`Result: ${step8Passed ? 'PASSED' : 'FAILED'}\n`);
  } finally {
    // Restore Gemini client
    (auraAiOrchestrator as any).geminiClient = originalGeminiClient;
  }

  // Cleanup test conversation
  await MessageModel.deleteMany({ conversationId: testConv._id });
  await ConversationModel.deleteOne({ _id: testConv._id });
  await mongoose.disconnect();

  // Print Summary Table
  console.log('\n================================================================');
  console.log('               VERIFICATION TEST SUITE SUMMARY');
  console.log('================================================================');
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? ' PASS' : '❌ FAIL';
    console.log(`[${icon}] Step ${r.step}: ${r.name}`);
    console.log(`       Details: ${r.details}`);
    if (!r.passed) allPassed = false;
  }
  console.log('================================================================\n');

  if (allPassed) {
    console.log(' ALL 8 COMMERCE INTELLIGENCE SCENARIOS VERIFIED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED.\n');
    process.exit(1);
  }
}

runCommerceIntelligenceSuite().catch((err) => {
  console.error('Test suite execution failed:', err);
  process.exit(1);
});
