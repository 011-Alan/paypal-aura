import mongoose from 'mongoose';
import {
  UserModel,
  AccountModel,
  TransactionModel,
  MandateModel,
  FinancialPlanModel,
  GoalModel,
  FamilyGroupModel,
  CalendarEventModel,
  PaymentRequestModel,
  NotificationModel,
  AutomationRuleModel,
  AuditLogModel,
} from '../models';
import { hashSecretArgon2id, recordAuditLog } from '../middleware/security';
import { coreFinancialService } from '../services/financial/financialService';
import { bryntumIntegration } from '../integrations/bryntum';
import { elasticIntegration } from '../integrations/elastic';
import { zapierIntegration } from '../integrations/zapier';
import { logger } from '../config/logger';

export const DEMO_ALEX_CREDENTIALS = {
  email: 'alex@aura-demo.finance',
  password: 'AuraDemo#2026',
  pin: '4826',
  name: 'Alex Sharma',
  role: 'Senior Tech Lead (Salaried Professional)',
  monthlyIncome: 95000,
  bio: 'Salaried tech lead managing household finances, savings goals, and regular recurring commitments.',
};

export const DEMO_PRIYA_CREDENTIALS = {
  email: 'priya@aura-demo.finance',
  password: 'PriyaDemo#2026',
  pin: '7391',
  name: 'Priya Sharma',
  role: 'Healthcare Professional (Family Member)',
  monthlyIncome: 78000,
  bio: 'Healthcare professional with strict individual account privacy and shared household budget contribution.',
};

export const DEMO_MAYA_CREDENTIALS = {
  email: 'maya@aura-demo.finance',
  password: 'MayaDemo#2026',
  pin: '1942',
  name: 'Maya Patel',
  role: 'Freelance Designer & Graduate Student',
  monthlyIncome: 42000,
  bio: 'Freelancer with variable cash flow, design subscription commitments, and student equipment savings target.',
};

export async function ensureDemoUserAlexSeeded(forceReset = false) {
  const existingAlex = await UserModel.findOne({ email: DEMO_ALEX_CREDENTIALS.email });
  if (existingAlex && !forceReset) {
    return {
      seeded: false,
      user: existingAlex,
      credentials: DEMO_ALEX_CREDENTIALS,
    };
  }

  if (forceReset) {
    // CRITICAL ISOLATION GUARANTEE:
    // Only clean up records belonging to demo personas. NEVER delete personal user accounts or data!
    const demoUsers = await UserModel.find({
      email: {
        $in: [
          DEMO_ALEX_CREDENTIALS.email,
          DEMO_PRIYA_CREDENTIALS.email,
          DEMO_MAYA_CREDENTIALS.email,
        ],
      },
    });
    const demoUserIds = demoUsers.map((u) => u._id);

    if (demoUserIds.length > 0) {
      await Promise.all([
        UserModel.deleteMany({ _id: { $in: demoUserIds } }),
        AccountModel.deleteMany({ userId: { $in: demoUserIds } }),
        TransactionModel.deleteMany({ userId: { $in: demoUserIds } }),
        MandateModel.deleteMany({ userId: { $in: demoUserIds } }),
        FinancialPlanModel.deleteMany({ userId: { $in: demoUserIds } }),
        GoalModel.deleteMany({ userId: { $in: demoUserIds } }),
        FamilyGroupModel.deleteMany({ familyGroupId: { $in: ['aura-family-sharma', 'aura-family-patel'] } }),
        CalendarEventModel.deleteMany({ userId: { $in: demoUserIds } }),
        PaymentRequestModel.deleteMany({ userId: { $in: demoUserIds } }),
        NotificationModel.deleteMany({ userId: { $in: demoUserIds } }),
        AutomationRuleModel.deleteMany({ userId: { $in: demoUserIds } }),
        AuditLogModel.deleteMany({ userId: { $in: demoUserIds } }),
      ]);
    }
  }

  logger.info('SeedService', 'Seeding demo user Alex Sharma & family member Priya Sharma...');

  const alexPasswordHash = await hashSecretArgon2id(DEMO_ALEX_CREDENTIALS.password);
  const alexPinHash = await hashSecretArgon2id(DEMO_ALEX_CREDENTIALS.pin);

  const priyaPasswordHash = await hashSecretArgon2id(DEMO_PRIYA_CREDENTIALS.password);
  const priyaPinHash = await hashSecretArgon2id(DEMO_PRIYA_CREDENTIALS.pin);

  const familyGroupId = 'aura-family-sharma';

  const alex = await UserModel.create({
    name: DEMO_ALEX_CREDENTIALS.name,
    email: DEMO_ALEX_CREDENTIALS.email,
    passwordHash: alexPasswordHash,
    pinHash: alexPinHash,
    role: 'family_admin',
    currency: 'INR',
    monthlyIncome: 95000,
    familyGroupId,
    spendingPreferences: {
      riskTolerance: 'balanced',
      priorityCategories: ['Housing', 'Savings', 'Groceries', 'Education'],
      savingsTargetPercent: 20,
    },
    financialPolicy: {
      requirePinAboveAmount: 1000,
      singleTransactionLimit: 75000,
      dailySpendingLimit: 100000,
      requireExplicitApproval: true,
      discretionaryMonthlyCap: 18000,
      allowFamilySharedView: true,
      blockedCategories: ['Gambling', 'Unverified Crypto'],
    },
    onboardingCompleted: true,
  });

  const priya = await UserModel.create({
    name: DEMO_PRIYA_CREDENTIALS.name,
    email: DEMO_PRIYA_CREDENTIALS.email,
    passwordHash: priyaPasswordHash,
    pinHash: priyaPinHash,
    role: 'family_member',
    currency: 'INR',
    monthlyIncome: 78000,
    familyGroupId,
    spendingPreferences: {
      riskTolerance: 'conservative',
      priorityCategories: ['Savings', 'Education', 'Healthcare'],
      savingsTargetPercent: 25,
    },
    financialPolicy: {
      requirePinAboveAmount: 1000,
      singleTransactionLimit: 50000,
      dailySpendingLimit: 75000,
      requireExplicitApproval: true,
      discretionaryMonthlyCap: 15000,
      allowFamilySharedView: true,
      blockedCategories: [],
    },
    onboardingCompleted: true,
  });

  // Create Family Group
  await FamilyGroupModel.create({
    familyGroupId,
    name: 'The Sharma Household',
    createdBy: alex._id,
    members: [
      {
        userId: alex._id as mongoose.Types.ObjectId,
        name: alex.name,
        email: alex.email,
        relationship: 'Household Lead',
        role: 'admin',
        privacyLevel: 'shared_summary_only',
        monthlySharedContribution: 22000,
      },
      {
        userId: priya._id as mongoose.Types.ObjectId,
        name: priya.name,
        email: priya.email,
        relationship: 'Spouse / Partner',
        role: 'member',
        privacyLevel: 'strict_private',
        monthlySharedContribution: 18000,
      },
    ],
    sharedMonthlyBudget: 40000,
    sharedSpentThisMonth: 16250,
    sharedCategories: ['Rent', 'Groceries', 'Electricity', 'Internet', 'Family Education'],
  });

  // Create Alex's 3 Accounts
  const checkingAcc = await AccountModel.create({
    userId: alex._id,
    name: 'HDFC Salary & Everyday Checking',
    institution: 'HDFC Bank',
    type: 'checking',
    accountNumberMasked: 'XXXX-4821',
    balance: 114200,
    currency: 'INR',
    isSharedWithFamily: false,
    familyGroupId,
    status: 'active',
  });

  const savingsAcc = await AccountModel.create({
    userId: alex._id,
    name: 'ICICI High-Yield Goal Savings',
    institution: 'ICICI Bank',
    type: 'savings',
    accountNumberMasked: 'XXXX-9012',
    balance: 245000,
    currency: 'INR',
    isSharedWithFamily: true,
    familyGroupId,
    status: 'active',
  });

  const paypalWallet = await AccountModel.create({
    userId: alex._id,
    name: 'PayPal Sandbox Linked Account',
    institution: 'PayPal Sandbox',
    type: 'wallet',
    accountNumberMasked: 'alex-sbx@paypal',
    balance: 28500,
    currency: 'INR',
    isSharedWithFamily: false,
    familyGroupId,
    status: 'active',
  });

  // Create Priya's Private Account (Strictly invisible to Alex!)
  const priyaPrivateAcc = await AccountModel.create({
    userId: priya._id,
    name: 'Priya Personal Axis Account (Private)',
    institution: 'Axis Bank',
    type: 'checking',
    accountNumberMasked: 'XXXX-7741',
    balance: 192000,
    currency: 'INR',
    isSharedWithFamily: false,
    familyGroupId,
    status: 'active',
  });

  await TransactionModel.create({
    userId: priya._id,
    accountId: priyaPrivateAcc._id,
    accountName: priyaPrivateAcc.name,
    date: new Date(),
    merchant: 'Private Solo Wellness Retreat',
    description: 'Priya Private Personal Expense (Protected by Family Privacy Boundary)',
    category: 'Healthcare',
    type: 'expense',
    amount: 6400,
    currency: 'INR',
    status: 'completed',
    paymentMethod: 'card',
    isRecurring: false,
    isUnusual: false,
    isSharedFamilyTransaction: false,
    tags: ['private'],
  });

  // Create Alex's Recurring Mandates (including exact specification examples: Rent ₹8,000 on 1st, Insurance ₹1,000 on 5th, Internet ₹800 on 10th)
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const mandatesData = [
    {
      userId: alex._id,
      accountId: checkingAcc._id,
      title: 'Monthly Tech Corp Salary',
      merchant: 'TechCorp India Pvt Ltd',
      category: 'Salary' as const,
      amount: 95000,
      currency: 'INR',
      frequency: 'monthly' as const,
      dueDayOfMonth: 1,
      nextDueDate: new Date(y, m + 1, 1),
      status: 'confirmed' as const,
      confidenceScore: 0.99,
      autoPayEnabled: true,
      isSharedWithFamily: false,
      familyGroupId,
    },
    {
      userId: alex._id,
      accountId: checkingAcc._id,
      title: 'Apartment Rent Mandate',
      merchant: 'Greenwood Residency Landlords',
      category: 'Rent' as const,
      amount: 8000,
      currency: 'INR',
      frequency: 'monthly' as const,
      dueDayOfMonth: 1,
      nextDueDate: new Date(y, m + 1, 1),
      status: 'confirmed' as const,
      confidenceScore: 0.99,
      autoPayEnabled: true,
      isSharedWithFamily: true,
      familyGroupId,
      notes: 'Due on the 1st of every month',
    },
    {
      userId: alex._id,
      accountId: checkingAcc._id,
      title: 'Health & Term Insurance Premium',
      merchant: 'HDFC ERGO Insurance',
      category: 'Insurance' as const,
      amount: 1000,
      currency: 'INR',
      frequency: 'monthly' as const,
      dueDayOfMonth: 5,
      nextDueDate: new Date(y, m, 5 > now.getDate() ? 5 : 5, 10, 0, 0),
      status: 'confirmed' as const,
      confidenceScore: 0.98,
      autoPayEnabled: true,
      isSharedWithFamily: false,
      familyGroupId,
      notes: 'Due on the 5th of every month',
    },
    {
      userId: alex._id,
      accountId: checkingAcc._id,
      title: 'Fiber Broadband Internet Bill',
      merchant: 'Airtel Xstream Fiber',
      category: 'Internet' as const,
      amount: 800,
      currency: 'INR',
      frequency: 'monthly' as const,
      dueDayOfMonth: 10,
      nextDueDate: new Date(y, m, 10),
      status: 'confirmed' as const,
      confidenceScore: 0.97,
      autoPayEnabled: true,
      isSharedWithFamily: true,
      familyGroupId,
      notes: 'Due on the 10th of every month',
    },
    {
      userId: alex._id,
      accountId: checkingAcc._id,
      title: 'Education & Upskilling EMI',
      merchant: 'Axis EduFinance',
      category: 'Loan EMI' as const,
      amount: 4500,
      currency: 'INR',
      frequency: 'monthly' as const,
      dueDayOfMonth: 12,
      nextDueDate: new Date(y, m, 12),
      status: 'confirmed' as const,
      confidenceScore: 0.96,
      autoPayEnabled: true,
      isSharedWithFamily: false,
      familyGroupId,
    },
    {
      userId: alex._id,
      accountId: checkingAcc._id,
      title: 'BESCOM Home Electricity Bill',
      merchant: 'BESCOM Power Utility',
      category: 'Electricity' as const,
      amount: 1650,
      currency: 'INR',
      frequency: 'monthly' as const,
      dueDayOfMonth: 15,
      nextDueDate: new Date(y, m, 15),
      status: 'confirmed' as const,
      confidenceScore: 0.94,
      autoPayEnabled: false,
      isSharedWithFamily: true,
      familyGroupId,
    },
    {
      userId: alex._id,
      accountId: paypalWallet._id,
      title: 'Cloud & Media Streaming Bundle',
      merchant: 'Netflix & Cloud Productivity',
      category: 'Subscription' as const,
      amount: 649,
      currency: 'INR',
      frequency: 'monthly' as const,
      dueDayOfMonth: 18,
      nextDueDate: new Date(y, m, 18),
      status: 'inferred' as const,
      confidenceScore: 0.88,
      autoPayEnabled: false,
      isSharedWithFamily: false,
      familyGroupId,
      notes: 'Inferred by AURA Mandate Intelligence Agent from 3 consecutive monthly charges.',
    },
  ];

  await MandateModel.insertMany(mandatesData);

  // Create Multi-Month Transactions for Alex (Dining over last 3 months, Holiday travel in Goa, Groceries, Bills, Unusual spend)
  const sampleTransactions = [
    // Current month income & commitments
    {
      date: new Date(y, m, 1),
      merchant: 'TechCorp India Pvt Ltd',
      description: 'Monthly Salary Credit — November',
      category: 'Salary',
      type: 'income',
      amount: 95000,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'bank_transfer',
      isRecurring: true,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['salary', 'income'],
    },
    {
      date: new Date(y, m, 1),
      merchant: 'Greenwood Residency Landlords',
      description: 'Monthly Apartment Rent (Due 1st)',
      category: 'Rent',
      type: 'expense',
      amount: 8000,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'bank_transfer',
      isRecurring: true,
      isUnusual: false,
      isSharedFamilyTransaction: true,
      tags: ['rent', 'housing', 'commitment'],
    },
    {
      date: new Date(y, m, 2),
      merchant: 'Nature Basket Supermarket',
      description: 'Monthly Household Groceries & Fresh Produce',
      category: 'Groceries',
      type: 'expense',
      amount: 4800,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'upi',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: true,
      tags: ['groceries', 'household'],
    },
    // Dining over last 3 months (for "Show my dining expenditure over the last three months")
    {
      date: new Date(y, m, 3),
      merchant: 'Truffles Koramangala',
      description: 'Weekend Family Dinner & Desserts',
      category: 'Dining',
      type: 'expense',
      amount: 1850,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'upi',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['dining', 'restaurant', 'food'],
    },
    {
      date: new Date(y, m, 4),
      merchant: 'The Oberoi Sky Lounge & Fine Dining',
      description: 'Celebration Group Dinner & Tasting Menu (Unusual Dining Spike)',
      category: 'Dining',
      type: 'expense',
      amount: 8400,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: true,
      unusualReason: 'Dining spend of ₹8,400 is 4.2x higher than your ₹1,950 category average.',
      isSharedFamilyTransaction: false,
      tags: ['dining', 'unusual', 'fine-dining'],
    },
    {
      date: new Date(y, m - 1, 14),
      merchant: 'Swiggy Instamart & Dining',
      description: 'Mid-week Team Lunch & Takeout',
      category: 'Dining',
      type: 'expense',
      amount: 1420,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'upi',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['dining', 'food', 'swiggy'],
    },
    {
      date: new Date(y, m - 1, 24),
      merchant: 'Burma Burma Kitchen',
      description: 'Asian Specialty Dinner',
      category: 'Dining',
      type: 'expense',
      amount: 2350,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['dining', 'restaurant'],
    },
    {
      date: new Date(y, m - 2, 11),
      merchant: 'Blue Tokai & Artisanal Bistro',
      description: 'Brunch & Coffee Meetings',
      category: 'Dining',
      type: 'expense',
      amount: 1280,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'upi',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['dining', 'coffee'],
    },
    // Holiday / Travel transactions (for "How much did I spend on travel during my last holiday?")
    {
      date: new Date(y, m - 1, 18),
      merchant: 'IndiGo Airlines',
      description: 'Round-trip Flights for Goa Coastal Holiday Vacation',
      category: 'Travel',
      type: 'expense',
      amount: 11400,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['travel', 'holiday', 'vacation', 'flight', 'goa'],
    },
    {
      date: new Date(y, m - 1, 19),
      merchant: 'Taj Fort Aguada Resort Goa',
      description: '3-Night Stay — Last Holiday in Goa',
      category: 'Travel',
      type: 'expense',
      amount: 16800,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: true,
      unusualReason: 'Seasonal holiday resort booking of ₹16,800.',
      isSharedFamilyTransaction: false,
      tags: ['travel', 'holiday', 'vacation', 'hotel', 'goa'],
    },
    {
      date: new Date(y, m - 1, 21),
      merchant: 'Goa Coastal Cabs & Ferry',
      description: 'Local Sightseeing & Airport Transfers during Goa Holiday',
      category: 'Travel',
      type: 'expense',
      amount: 3200,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'upi',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['travel', 'holiday', 'goa', 'transport'],
    },
    // Previous month salary & bills
    {
      date: new Date(y, m - 1, 1),
      merchant: 'TechCorp India Pvt Ltd',
      description: 'Monthly Salary Credit — October',
      category: 'Salary',
      type: 'income',
      amount: 95000,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'bank_transfer',
      isRecurring: true,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['salary', 'income'],
    },
    {
      date: new Date(y, m - 1, 5),
      merchant: 'HDFC ERGO Insurance',
      description: 'Monthly Insurance Premium',
      category: 'Insurance',
      type: 'expense',
      amount: 1000,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'direct_debit',
      isRecurring: true,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['insurance', 'commitment'],
    },
    {
      date: new Date(y, m - 1, 10),
      merchant: 'Airtel Xstream Fiber',
      description: 'Home Fiber Broadband Internet Plan',
      category: 'Internet',
      type: 'expense',
      amount: 800,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'upi',
      isRecurring: true,
      isUnusual: false,
      isSharedFamilyTransaction: true,
      tags: ['internet', 'utilities', 'commitment'],
    },
  ];

  const insertedTxs = await TransactionModel.insertMany(
    sampleTransactions.map((t) => ({
      ...t,
      userId: alex._id,
      currency: 'INR',
      status: t.isUnusual ? 'flagged' : 'completed',
      familyGroupId,
      elasticSynced: false,
    }))
  );

  // Create Alex's Financial Goals
  await GoalModel.insertMany([
    {
      userId: alex._id,
      title: 'Emergency Resilience Fund (6 Months)',
      category: 'Emergency Fund',
      targetAmount: 300000,
      currentAmount: 215000,
      monthlyContribution: 10000,
      deadline: new Date(y + 1, 5, 30),
      priority: 'high',
      isSharedWithFamily: false,
      familyGroupId,
      milestones: [
        { percentage: 25, reached: true, reachedAt: new Date(y, m - 4, 15), confirmedByUser: true },
        { percentage: 50, reached: true, reachedAt: new Date(y, m - 2, 15), confirmedByUser: true },
        { percentage: 75, reached: false, confirmedByUser: false },
        { percentage: 100, reached: false, confirmedByUser: false },
      ],
      status: 'active',
    },
    {
      userId: alex._id,
      title: 'Workstation Laptop Upgrade Fund',
      category: 'Technology',
      targetAmount: 55000,
      currentAmount: 22000,
      monthlyContribution: 5500,
      deadline: new Date(y, m + 5, 15),
      priority: 'medium',
      isSharedWithFamily: false,
      familyGroupId,
      milestones: [
        { percentage: 25, reached: true, reachedAt: new Date(y, m - 1, 10), confirmedByUser: true },
        { percentage: 50, reached: false, confirmedByUser: false },
        { percentage: 75, reached: false, confirmedByUser: false },
        { percentage: 100, reached: false, confirmedByUser: false },
      ],
      status: 'active',
    },
    {
      userId: alex._id,
      title: 'Shared Household Education & Annual Reserve',
      category: 'Family',
      targetAmount: 80000,
      currentAmount: 60000,
      monthlyContribution: 4500,
      deadline: new Date(y + 1, 2, 31),
      priority: 'high',
      isSharedWithFamily: true,
      familyGroupId,
      milestones: [
        { percentage: 25, reached: true, reachedAt: new Date(y, m - 5, 1), confirmedByUser: true },
        { percentage: 50, reached: true, reachedAt: new Date(y, m - 3, 1), confirmedByUser: true },
        { percentage: 75, reached: true, reachedAt: new Date(y, m, 1), confirmedByUser: false },
        { percentage: 100, reached: false, confirmedByUser: false },
      ],
      status: 'active',
    },
  ]);

  const alexIdStr = String(alex._id);

  // Sync transactions to Elastic
  for (const tx of insertedTxs) {
    await elasticIntegration.syncTransaction(tx as any);
  }

  // Generate Monthly Financial Plan via Python Analytics Engine
  await coreFinancialService.generateOrUpdateMonthlyPlan(alexIdStr);

  // Sync Bryntum Financial Life Calendar
  await bryntumIntegration.syncUserFinancialCalendar(alexIdStr);

  // Initialize Zapier Automation Rules & initial welcome notification
  await zapierIntegration.ensureDefaultAutomationRules(alexIdStr, alex.email);
  await zapierIntegration.triggerAutomation({
    userId: alexIdStr,
    automationType: 'upcoming_commitment_reminder',
    title: 'Upcoming Commitment: Health & Term Insurance (₹1,000)',
    message: 'Your confirmed HDFC ERGO Insurance mandate of ₹1,000 is scheduled on the 5th of the month.',
    deduplicationKey: 'seed-initial-insurance-reminder',
  });

  await recordAuditLog({
    userId: alexIdStr,
    actor: 'system_worker',
    action: 'demo_user_alex_seeded',
    resourceType: 'user',
    resourceId: alexIdStr,
    status: 'success',
    details: {
      accountsCreated: 3,
      transactionsCreated: insertedTxs.length,
      mandatesCreated: mandatesData.length,
      goalsCreated: 3,
    },
  });

  logger.info('SeedService', 'Successfully seeded Alex Sharma end-to-end demo data.');
  return {
    seeded: true,
    user: alex,
    credentials: DEMO_ALEX_CREDENTIALS,
  };
}

export async function ensureDemoUserMayaSeeded(forceReset = false) {
  const existingMaya = await UserModel.findOne({ email: DEMO_MAYA_CREDENTIALS.email });
  if (existingMaya && !forceReset) {
    return {
      seeded: false,
      user: existingMaya,
      credentials: DEMO_MAYA_CREDENTIALS,
    };
  }

  logger.info('SeedService', 'Seeding demo user Maya Patel (Freelancer & Student persona)...');
  const passwordHash = await hashSecretArgon2id(DEMO_MAYA_CREDENTIALS.password);
  const pinHash = await hashSecretArgon2id(DEMO_MAYA_CREDENTIALS.pin);

  const maya = await UserModel.create({
    name: DEMO_MAYA_CREDENTIALS.name,
    email: DEMO_MAYA_CREDENTIALS.email,
    passwordHash,
    pinHash,
    role: 'user',
    currency: 'INR',
    monthlyIncome: 42000,
    familyGroupId: 'aura-family-patel',
    spendingPreferences: {
      riskTolerance: 'growth',
      priorityCategories: ['Education', 'Technology', 'Savings'],
      savingsTargetPercent: 15,
    },
    financialPolicy: {
      requirePinAboveAmount: 1000,
      singleTransactionLimit: 30000,
      dailySpendingLimit: 40000,
      requireExplicitApproval: true,
      discretionaryMonthlyCap: 12000,
      allowFamilySharedView: false,
      blockedCategories: ['Gambling'],
    },
    onboardingCompleted: true,
  });

  const mayaChecking = await AccountModel.create({
    userId: maya._id,
    name: 'HDFC Student & Freelance Checking',
    institution: 'HDFC Bank',
    type: 'checking',
    accountNumberMasked: 'XXXX-3199',
    balance: 24500,
    currency: 'INR',
    isSharedWithFamily: false,
    status: 'active',
  });

  const mayaPaypal = await AccountModel.create({
    userId: maya._id,
    name: 'PayPal Freelance Client Wallet',
    institution: 'PayPal Sandbox',
    type: 'wallet',
    accountNumberMasked: 'maya-freelance@paypal',
    balance: 16800,
    currency: 'INR',
    isSharedWithFamily: false,
    status: 'active',
  });

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  await MandateModel.create([
    {
      userId: maya._id,
      accountId: mayaChecking._id,
      title: 'Figma Professional Subscription',
      merchant: 'Figma Inc',
      category: 'Subscription',
      amount: 1200,
      currency: 'INR',
      frequency: 'monthly',
      dueDayOfMonth: 5,
      nextDueDate: new Date(y, m + 1, 5),
      status: 'confirmed',
      confidenceScore: 0.98,
      autoPayEnabled: true,
    },
    {
      userId: maya._id,
      accountId: mayaChecking._id,
      title: 'High-Speed Broadband Internet',
      merchant: 'ACT Fibernet',
      category: 'Internet',
      amount: 600,
      currency: 'INR',
      frequency: 'monthly',
      dueDayOfMonth: 10,
      nextDueDate: new Date(y, m + 1, 10),
      status: 'confirmed',
      confidenceScore: 0.95,
      autoPayEnabled: false,
    },
    {
      userId: maya._id,
      accountId: mayaChecking._id,
      title: 'Adobe Creative Cloud All Apps',
      merchant: 'Adobe Systems',
      category: 'Subscription',
      amount: 3500,
      currency: 'INR',
      frequency: 'monthly',
      dueDayOfMonth: 15,
      nextDueDate: new Date(y, m + 1, 15),
      status: 'confirmed',
      confidenceScore: 0.96,
      autoPayEnabled: false,
    },
    {
      userId: maya._id,
      accountId: mayaChecking._id,
      title: 'Graduate Student Tuition EMI',
      merchant: 'National Institute of Design',
      category: 'Education',
      amount: 8000,
      currency: 'INR',
      frequency: 'monthly',
      dueDayOfMonth: 20,
      nextDueDate: new Date(y, m + 1, 20),
      status: 'confirmed',
      confidenceScore: 0.99,
      autoPayEnabled: true,
    },
  ]);

  await GoalModel.create({
    userId: maya._id,
    title: 'Ergonomic Studio Workstation & 4K Display',
    category: 'Technology',
    targetAmount: 35000,
    currentAmount: 14000,
    monthlyContribution: 4000,
    deadline: new Date(y, m + 6, 1),
    priority: 'high',
    isSharedWithFamily: false,
    milestones: [
      { percentage: 25, reached: true, reachedAt: new Date(y, m - 2, 10), confirmedByUser: true },
      { percentage: 50, reached: false, confirmedByUser: false },
      { percentage: 75, reached: false, confirmedByUser: false },
      { percentage: 100, reached: false, confirmedByUser: false },
    ],
    status: 'active',
  });

  const mayaIdStr = String(maya._id);
  await coreFinancialService.generateOrUpdateMonthlyPlan(mayaIdStr);
  await bryntumIntegration.syncUserFinancialCalendar(mayaIdStr);
  await zapierIntegration.ensureDefaultAutomationRules(mayaIdStr, maya.email);

  return {
    seeded: true,
    user: maya,
    credentials: DEMO_MAYA_CREDENTIALS,
  };
}

export function getDemoPersonas() {
  return [
    {
      id: 'alex',
      ...DEMO_ALEX_CREDENTIALS,
    },
    {
      id: 'priya',
      ...DEMO_PRIYA_CREDENTIALS,
    },
    {
      id: 'maya',
      ...DEMO_MAYA_CREDENTIALS,
    },
  ];
}
