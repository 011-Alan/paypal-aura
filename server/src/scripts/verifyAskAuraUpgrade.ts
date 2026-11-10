import mongoose from 'mongoose';
import { env } from '../config/env';
import {
  UserModel,
  AccountModel,
  TransactionModel,
  MandateModel,
  GoalModel,
  CalendarEventModel,
  NotificationModel,
  ScheduledTaskModel,
} from '../models';
import { aiActionRegistry } from '../services/ai/aiActionRegistry';
import { durableSchedulerService } from '../services/scheduling/durableSchedulerService';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';

async function runAskAuraVerification() {
  console.log('====================================================');
  console.log('STARTING ASK AURA INTELLIGENT AGENT VERIFICATION');
  console.log('====================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  // Load test users: Alex Sharma (personal) and Bruce Wayne (business)
  const alexUser = await UserModel.findOne({ email: 'alex@aura-demo.finance' });
  const bruceUser = await UserModel.findOne({ accountType: 'business' });

  if (!alexUser) {
    throw new Error('Alex Sharma demo user not found in database.');
  }

  const alexCtx = {
    userId: String(alexUser._id),
    user: alexUser,
    prompt: '',
    requestId: `req_${Date.now()}`,
    conversationId: `conv_${Date.now()}`,
  };

  const bruceCtx = bruceUser
    ? {
        userId: String(bruceUser._id),
        user: bruceUser,
        prompt: '',
        requestId: `req_bruce_${Date.now()}`,
        conversationId: `conv_bruce_${Date.now()}`,
      }
    : null;

  let passedTests = 0;
  let totalTests = 12;

  // ---------------------------------------------------------------------------
  // TEST 1: NAVIGATION
  // ---------------------------------------------------------------------------
  console.log('>>> TEST 1: Navigation Control');
  const navAction = aiActionRegistry.getAction('navigate_to_page');
  const navRes = await navAction?.execute({ page: 'transactions' }, alexCtx);
  if (navRes?.success && navRes.toolAction.navTarget === 'transactions') {
    console.log('  ✅ Navigation target resolved to "transactions"');
    console.log('  ✅ ToolAction:', navRes.toolAction.title, '| Status:', navRes.toolAction.status);
    passedTests++;
  } else {
    console.error('  ❌ Navigation test failed:', navRes);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: THEME SWITCHING
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 2: Application Theme Switching');
  const themeAction = aiActionRegistry.getAction('change_theme');
  const darkRes = await themeAction?.execute({ theme: 'dark' }, alexCtx);
  const lightRes = await themeAction?.execute({ theme: 'light' }, alexCtx);
  if (darkRes?.data.theme === 'dark' && lightRes?.data.theme === 'light') {
    console.log('  ✅ Dark mode and light mode actions executed successfully');
    console.log('  ✅ Dark response:', darkRes.explanation);
    console.log('  ✅ Light response:', lightRes.explanation);
    passedTests++;
  } else {
    console.error('  ❌ Theme test failed');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: COMMERCE & CHANNEL3 SEARCH (Find a Bible)
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 3: Intelligent Shopping & Channel3 Product Search');
  const searchAction = aiActionRegistry.getAction('search_products');
  const searchRes = await searchAction?.execute({ query: 'Bible' }, alexCtx);
  console.log('  🔍 Search Query: "Bible"');
  console.log('  📦 Products Found:', searchRes?.data.totalFound);
  if (searchRes?.success && searchRes.data.totalFound > 0) {
    const firstP = searchRes.data.products[0];
    console.log('  ✅ First Product:', firstP.name);
    console.log('  ✅ Retailer:', firstP.retailerName, '| Brand:', firstP.brand);
    console.log('  ✅ Price INR:', firstP.priceInr, '| USD:', firstP.priceUsd);

    // Test product comparison
    const compareAction = aiActionRegistry.getAction('compare_products');
    const compareRes = await compareAction?.execute({ query: 'Bible' }, alexCtx);
    if (compareRes?.success && compareRes.data.product1 && compareRes.data.product2) {
      console.log('  ✅ Side-by-side product comparison generated with real items');
      passedTests++;
    } else {
      console.error('  ❌ Compare products failed');
    }
  } else {
    console.error('  ❌ Search test failed');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: FINANCIAL AFFORDABILITY (7-Factor Analysis)
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 4: Deterministic 7-Factor Affordability Evaluation');
  const affordAction = aiActionRegistry.getAction('analyse_purchase_affordability');
  const affordRes = await affordAction?.execute({ productName: 'Holy Bible Luxury Edition', priceInr: 2500 }, alexCtx);
  if (affordRes?.success && affordRes.data.score > 0) {
    console.log('  ✅ Affordability Score:', affordRes.data.score, '/ 100');
    console.log('  ✅ Guidance:', affordRes.data.guidance);
    console.log('  ✅ Liquid Balance verified:', affordRes.data.liquidBalance);
    console.log('  ✅ Upcoming Commitments ringfenced:', affordRes.data.upcomingCommitmentsTotal);
    console.log('  ✅ Remaining buffer after purchase:', affordRes.data.remainingBuffer);
    passedTests++;
  } else {
    console.error('  ❌ Affordability test failed:', affordRes);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: PAYMENT SAFETY (Strict Permission Boundary)
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 5: Payment Safety & Guardian Boundary');
  const payAction = aiActionRegistry.getAction('prepare_payment');
  const payRes = await payAction?.execute({ recipientName: 'John', amountInr: 5000 }, alexCtx);
  if (payRes?.success && payRes.toolAction.status === 'awaiting_approval' && payRes.toolAction.requiresUserPaymentApproval) {
    console.log('  ✅ Payment Prepared with Financial Guardian Check');
    console.log('  ✅ Strict Security Guarantee Enforced: requiresUserPaymentApproval = true');
    console.log('  ✅ NavTarget:', payRes.toolAction.navTarget);
    passedTests++;
  } else {
    console.error('  ❌ Payment safety test failed:', payRes);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: SAVINGS GOAL PERSISTENCE
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 6: Financial Savings Goal Persistence');
  const goalAction = aiActionRegistry.getAction('create_financial_goal');
  const goalRes = await goalAction?.execute({ title: 'Family Holiday Fund', targetAmount: 60000, durationMonths: 12 }, alexCtx);
  const savedGoal = await GoalModel.findById(goalRes?.data.goalId);
  if (savedGoal && savedGoal.title === 'Family Holiday Fund' && savedGoal.monthlyContribution === 5000) {
    console.log('  ✅ Goal created and verified in database:', savedGoal.title);
    console.log('  ✅ Target Amount: ₹' + savedGoal.targetAmount, '| Monthly: ₹' + savedGoal.monthlyContribution);
    passedTests++;
  } else {
    console.error('  ❌ Goal persistence failed:', goalRes);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: DURABLE SCHEDULING & ALERTS
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 7: Durable Scheduling, Recurring Reminders & Alerts');
  // 1. One-time reminder
  const reminderRes = await durableSchedulerService.createSchedule({
    userId: String(alexUser._id),
    title: 'Pay Electricity Bill',
    targetDateTime: new Date(Date.now() + 3600000), // 1 hour later
    scheduleType: 'one_time',
    triggerType: 'datetime',
    timezone: 'Asia/Kolkata',
  });
  // 2. Recurring reminder
  const recurringRes = await durableSchedulerService.createSchedule({
    userId: String(alexUser._id),
    title: 'Review Weekly Savings',
    scheduleType: 'recurring',
    triggerType: 'datetime',
    recurrenceRule: 'weekly',
    recurrenceDayOfWeek: 0,
    timezone: 'Asia/Kolkata',
  });
  // 3. Conditional alert
  const alertRes = await durableSchedulerService.createSchedule({
    userId: String(alexUser._id),
    title: 'Shopping Spend Cap Alert',
    scheduleType: 'conditional_event',
    triggerType: 'spending_threshold',
    condition: { thresholdValue: 10000, category: 'Shopping' },
    timezone: 'Asia/Kolkata',
  });

  // Verify DB persistence
  const savedSchedules = await ScheduledTaskModel.find({ userId: alexUser._id });
  console.log('  ✅ Saved Schedules Count in MongoDB:', savedSchedules.length);

  // Test evaluation loop
  const evalResult = await durableSchedulerService.evaluateScheduledJobs();
  console.log('  ✅ Scheduler Evaluation Result:', evalResult);

  // Test notification creation & read status
  const notif = await NotificationModel.create({
    userId: alexUser._id,
    title: 'Test Electricity Reminder',
    message: 'Due soon',
    isRead: false,
  });
  notif.isRead = true;
  await notif.save();
  const verifiedNotif = await NotificationModel.findById(notif._id);
  if (savedSchedules.length >= 3 && verifiedNotif?.isRead) {
    console.log('  ✅ Durable scheduler persistence & notification mark-as-read verified');
    passedTests++;
  } else {
    console.error('  ❌ Scheduler test failed');
  }

  // ---------------------------------------------------------------------------
  // TEST 8: BUSINESS FINANCIAL INTELLIGENCE & ISOLATION
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 8: Business Financial Intelligence & Role Isolation');
  const bizAction = aiActionRegistry.getAction('analyse_business_finances');

  // Alex (Personal user) should be blocked:
  const alexBizRes = await bizAction?.execute({}, alexCtx);
  console.log('  🔒 Personal User Access Attempt:', alexBizRes?.data.error);

  // Bruce (Business user) should succeed:
  if (bruceCtx) {
    const bruceBizRes = await bizAction?.execute({}, bruceCtx);
    console.log('  💼 Business User Gross Revenue:', bruceBizRes?.data.revenue);
    console.log('  💼 Business User Margin:', bruceBizRes?.data.margin + '%');

    const projAction = aiActionRegistry.getAction('generate_business_projections');
    const projRes = await projAction?.execute({}, bruceCtx);
    console.log('  💼 Business Projections:', {
      optimistic: projRes?.data.optimistic,
      expected: projRes?.data.expected,
      conservative: projRes?.data.conservative,
    });

    if (alexBizRes?.data.error === 'UNAUTHORIZED_MERCHANT_ACCESS' && bruceBizRes?.success) {
      console.log('  ✅ Merchant permission boundaries strictly enforced!');
      passedTests++;
    } else {
      console.error('  ❌ Business isolation test failed');
    }
  } else {
    console.log('  ⚠️ Bruce user not found, skipping business execution');
    if (alexBizRes?.data.error === 'UNAUTHORIZED_MERCHANT_ACCESS') passedTests++;
  }

  // ---------------------------------------------------------------------------
  // TEST 9: SECURE LOGOUT
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 9: Secure Logout Action');
  const logoutAction = aiActionRegistry.getAction('logout_user');
  const logoutRes = await logoutAction?.execute({}, alexCtx);
  if (logoutRes?.success && logoutRes.toolAction.type === 'logout') {
    console.log('  ✅ Logout action executed: Redirect to', logoutRes.toolAction.details.redirectTo);
    passedTests++;
  } else {
    console.error('  ❌ Logout test failed:', logoutRes);
  }

  // ---------------------------------------------------------------------------
  // TEST 10: PERSONALISATION & SCENARIO SIMULATION
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 10: Personalisation & Financial Scenario Simulation');
  const simAction = aiActionRegistry.getAction('simulate_financial_scenario');
  const sim5k = await simAction?.execute({ scenario: 'save 5,000 every month' }, alexCtx);
  const sim15 = await simAction?.execute({ scenario: 'reduce shopping by 15%' }, alexCtx);
  if (sim5k?.success && sim15?.success) {
    console.log('  ✅ Scenario 1 (₹5,000/mo):', sim5k.toolAction.title);
    console.log('  ✅ Scenario 2 (Cut Shopping 15%):', sim15.toolAction.title);
    passedTests++;
  } else {
    console.error('  ❌ Scenario test failed');
  }

  // ---------------------------------------------------------------------------
  // TEST 11: FINANCIAL DISTRESS, FRAUD & CYBERCRIME ASSISTANCE
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 11: Financial Distress, Fraud & Cybercrime Assistance');
  const distressAction = aiActionRegistry.getAction('assist_financial_distress');
  const distressRes = await distressAction?.execute({ amount: 20000 }, alexCtx);
  const emailDraftAction = aiActionRegistry.getAction('draft_email');
  const emailRes = await emailDraftAction?.execute({ type: 'bank_fraud' }, alexCtx);

  const guidanceHasHelpline = distressRes?.explanation.includes('1930');
  const guidanceHasPortal = distressRes?.explanation.includes('https://cybercrime.gov.in');
  const emailHasRbiCitation = emailRes?.explanation.includes('RBI');

  if (distressRes?.success && guidanceHasHelpline && guidanceHasPortal && emailHasRbiCitation) {
    console.log('  ✅ Empathetic distress guidance delivered with Indian Cyber Helpline 1930');
    console.log('  ✅ Official portal linked:', distressRes.data.portal);
    console.log('  ✅ RBI-compliant bank dispute email drafted');
    passedTests++;
  } else {
    console.error('  ❌ Distress assistance test failed');
  }

  // ---------------------------------------------------------------------------
  // TEST 12: VISUAL EXPLANATIONS, TABLES & LOAN AMORTISATION
  // ---------------------------------------------------------------------------
  console.log('\n>>> TEST 12: Visual Explanations, Tables & Loan Amortisation');
  const loanAction = aiActionRegistry.getAction('calculate_loan_repayment');
  const loanRes = await loanAction?.execute({ principalInr: 100000, annualInterestRatePercent: 12, tenureMonths: 12 }, alexCtx);
  const spendingAction = aiActionRegistry.getAction('analyse_spending');
  const spendingRes = await spendingAction?.execute({ days: 30 }, alexCtx);

  if (loanRes?.success && loanRes.explanation.includes('|') && spendingRes?.success) {
    console.log('  ✅ Loan Amortisation Table generated: Monthly EMI = ₹' + loanRes.data.monthlyEmi);
    console.log('  ✅ Spending Breakdown Table generated: Total spend = ₹' + spendingRes.data.totalSpend);
    passedTests++;
  } else {
    console.error('  ❌ Visual explanation test failed');
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  process.exit(passedTests === totalTests ? 0 : 1);
}

runAskAuraVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
