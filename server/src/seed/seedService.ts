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
  ConversationModel,
  MessageModel,
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
  monthlyIncome: 7500,
  bio: 'Salaried tech lead managing household finances, savings goals, and regular recurring commitments.',
};

export const DEMO_PRIYA_CREDENTIALS = {
  email: 'priya@aura-demo.finance',
  password: 'PriyaDemo#2026',
  pin: '7391',
  name: 'Priya Sharma',
  role: 'Healthcare Professional (Family Member)',
  monthlyIncome: 6200,
  bio: 'Healthcare professional with strict individual account privacy and shared household budget contribution.',
};

export const DEMO_MAYA_CREDENTIALS = {
  email: 'maya@aura-demo.finance',
  password: 'MayaDemo#2026',
  pin: '1942',
  name: 'Maya Patel',
  role: 'Freelance Designer & Graduate Student',
  monthlyIncome: 4200,
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
        ConversationModel.deleteMany({ userId: { $in: demoUserIds } }),
        MessageModel.deleteMany({ userId: { $in: demoUserIds } }),
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
    accountType: 'personal',
    auraAccountType: 'PERSONAL',
    paypalAccountType: 'PERSONAL',
    merchantVerificationStatus: 'NOT_STARTED',
    merchantAccessEnabled: false,
    merchantVerifiedAt: null,
    paypalMerchantId: null,
    verificationMethod: null,
    verificationUpdatedAt: new Date(),
    currency: 'USD',
    monthlyIncome: 7500,
    familyGroupId,
    spendingPreferences: {
      riskTolerance: 'balanced',
      priorityCategories: ['Housing', 'Savings', 'Groceries', 'Education'],
      savingsTargetPercent: 20,
    },
    financialPolicy: {
      requirePinAboveAmount: 100,
      singleTransactionLimit: 2500,
      dailySpendingLimit: 5000,
      requireExplicitApproval: true,
      discretionaryMonthlyCap: 1800,
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
    accountType: 'personal',
    auraAccountType: 'PERSONAL',
    paypalAccountType: 'PERSONAL',
    merchantVerificationStatus: 'NOT_STARTED',
    merchantAccessEnabled: false,
    merchantVerifiedAt: null,
    paypalMerchantId: null,
    verificationMethod: null,
    verificationUpdatedAt: new Date(),
    currency: 'USD',
    monthlyIncome: 6200,
    familyGroupId,
    spendingPreferences: {
      riskTolerance: 'conservative',
      priorityCategories: ['Savings', 'Education', 'Healthcare'],
      savingsTargetPercent: 25,
    },
    financialPolicy: {
      requirePinAboveAmount: 100,
      singleTransactionLimit: 2000,
      dailySpendingLimit: 4000,
      requireExplicitApproval: true,
      discretionaryMonthlyCap: 1500,
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
        monthlySharedContribution: 2000,
      },
      {
        userId: priya._id as mongoose.Types.ObjectId,
        name: priya.name,
        email: priya.email,
        relationship: 'Spouse / Partner',
        role: 'member',
        privacyLevel: 'strict_private',
        monthlySharedContribution: 1500,
      },
    ],
    sharedMonthlyBudget: 3500,
    sharedSpentThisMonth: 1450,
    sharedCategories: ['Rent', 'Groceries', 'Electricity', 'Internet', 'Family Education'],
  });

  // Create Alex's 3 Accounts
  const checkingAcc = await AccountModel.create({
    userId: alex._id,
    name: 'Premier Salary & Everyday Checking',
    institution: 'Chase Bank',
    type: 'checking',
    accountNumberMasked: 'XXXX-4821',
    balance: 4850,
    currency: 'USD',
    isSharedWithFamily: false,
    familyGroupId,
    status: 'active',
  });

  const savingsAcc = await AccountModel.create({
    userId: alex._id,
    name: 'High-Yield Goal Savings',
    institution: 'Marcus by Goldman Sachs',
    type: 'savings',
    accountNumberMasked: 'XXXX-9012',
    balance: 18400,
    currency: 'USD',
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
    balance: 1250,
    currency: 'USD',
    isSharedWithFamily: false,
    familyGroupId,
    status: 'active',
  });

  // Create Priya's Private Account (Strictly invisible to Alex!)
  const priyaPrivateAcc = await AccountModel.create({
    userId: priya._id,
    name: 'Priya Personal Account (Private)',
    institution: 'Citibank',
    type: 'checking',
    accountNumberMasked: 'XXXX-7741',
    balance: 5200,
    currency: 'USD',
    isSharedWithFamily: false,
    familyGroupId,
    status: 'active',
  });

  await TransactionModel.create({
    userId: priya._id,
    accountId: priyaPrivateAcc._id,
    accountName: priyaPrivateAcc.name,
    date: new Date(),
    merchant: 'Private Wellness Studio',
    description: 'Priya Private Personal Expense (Protected by Family Privacy Boundary)',
    category: 'Healthcare',
    type: 'expense',
    amount: 120,
    currency: 'USD',
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
      merchant: 'TechCorp Systems Inc',
      category: 'Salary' as const,
      amount: 7500,
      currency: 'USD',
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
      merchant: 'Greenwood Residency Properties',
      category: 'Rent' as const,
      amount: 1800,
      currency: 'USD',
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
      merchant: 'MetLife Premier Health',
      category: 'Insurance' as const,
      amount: 180,
      currency: 'USD',
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
      merchant: 'Verizon Fios Fiber',
      category: 'Internet' as const,
      amount: 75,
      currency: 'USD',
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
      merchant: 'Sallie Mae Student Finance',
      category: 'Loan EMI' as const,
      amount: 250,
      currency: 'USD',
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
      title: 'Home Electricity & Power Utility',
      merchant: 'National Grid Utilities',
      category: 'Electricity' as const,
      amount: 95,
      currency: 'USD',
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
      amount: 35,
      currency: 'USD',
      frequency: 'monthly' as const,
      dueDayOfMonth: 18,
      nextDueDate: new Date(y, m, 18),
      status: 'inferred' as const,
      confidenceScore: 0.88,
      autoPayEnabled: false,
      isSharedWithFamily: false,
      familyGroupId,
      notes: 'Inferred recurring monthly subscription.',
    },
  ];

  await MandateModel.insertMany(mandatesData);

  // Create Multi-Month Transactions for Alex
  const sampleTransactions = [
    // Current month income & commitments
    {
      date: new Date(y, m, 1),
      merchant: 'TechCorp Systems Inc',
      description: 'Monthly Salary Credit — November',
      category: 'Salary',
      type: 'income',
      amount: 7500,
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
      merchant: 'Greenwood Residency Properties',
      description: 'Monthly Apartment Rent (Due 1st)',
      category: 'Rent',
      type: 'expense',
      amount: 1800,
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
      merchant: 'Whole Foods Market',
      description: 'Monthly Household Groceries & Fresh Produce',
      category: 'Groceries',
      type: 'expense',
      amount: 140,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: true,
      tags: ['groceries', 'household'],
    },
    // Dining over last 3 months
    {
      date: new Date(y, m, 3),
      merchant: 'Artisan Bistro & Kitchen',
      description: 'Weekend Family Dinner & Desserts',
      category: 'Dining',
      type: 'expense',
      amount: 45,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['dining', 'restaurant', 'food'],
    },
    {
      date: new Date(y, m, 4),
      merchant: 'The Capital Grille Fine Dining',
      description: 'Celebration Group Dinner & Tasting Menu (Unusual Dining Spike)',
      category: 'Dining',
      type: 'expense',
      amount: 240,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: true,
      unusualReason: 'Dining spend of $240 is 4.8x higher than your $50 category average.',
      isSharedFamilyTransaction: false,
      tags: ['dining', 'unusual', 'fine-dining'],
    },
    {
      date: new Date(y, m - 1, 14),
      merchant: 'DoorDash Food Delivery',
      description: 'Mid-week Team Lunch & Takeout',
      category: 'Dining',
      type: 'expense',
      amount: 28,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['dining', 'food'],
    },
    {
      date: new Date(y, m - 1, 24),
      merchant: 'Burma Asian Kitchen',
      description: 'Asian Specialty Dinner',
      category: 'Dining',
      type: 'expense',
      amount: 65,
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
      merchant: 'Blue Tokai Specialty Coffee',
      description: 'Brunch & Coffee Meetings',
      category: 'Dining',
      type: 'expense',
      amount: 14,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['dining', 'coffee'],
    },
    // Holiday / Travel transactions
    {
      date: new Date(y, m - 1, 18),
      merchant: 'Delta Air Lines',
      description: 'Round-trip Flights for Coastal Holiday Vacation',
      category: 'Travel',
      type: 'expense',
      amount: 340,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['travel', 'holiday', 'vacation', 'flight'],
    },
    {
      date: new Date(y, m - 1, 19),
      merchant: 'Coastal Shore Beach Resort',
      description: '3-Night Stay — Holiday Vacation',
      category: 'Travel',
      type: 'expense',
      amount: 520,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: true,
      unusualReason: 'Seasonal holiday resort booking of $520.',
      isSharedFamilyTransaction: false,
      tags: ['travel', 'holiday', 'vacation', 'hotel'],
    },
    {
      date: new Date(y, m - 1, 21),
      merchant: 'Uber Rides & City Transfers',
      description: 'Local Sightseeing & Airport Transfers',
      category: 'Travel',
      type: 'expense',
      amount: 85,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
      isRecurring: false,
      isUnusual: false,
      isSharedFamilyTransaction: false,
      tags: ['travel', 'holiday', 'transport'],
    },
    // Previous month salary & bills
    {
      date: new Date(y, m - 1, 1),
      merchant: 'TechCorp Systems Inc',
      description: 'Monthly Salary Credit — October',
      category: 'Salary',
      type: 'income',
      amount: 7500,
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
      merchant: 'MetLife Premier Health',
      description: 'Monthly Insurance Premium',
      category: 'Insurance',
      type: 'expense',
      amount: 180,
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
      merchant: 'Verizon Fios Fiber',
      description: 'Home Fiber Broadband Internet Plan',
      category: 'Internet',
      type: 'expense',
      amount: 75,
      accountId: checkingAcc._id,
      accountName: checkingAcc.name,
      paymentMethod: 'card',
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
      currency: 'USD',
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
      targetAmount: 15000,
      currentAmount: 10500,
      monthlyContribution: 500,
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
      targetAmount: 2000,
      currentAmount: 1400,
      monthlyContribution: 200,
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
      title: 'Shared Household & Travel Reserve',
      category: 'Family',
      targetAmount: 3000,
      currentAmount: 2250,
      monthlyContribution: 150,
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
    title: 'Upcoming Commitment: Health & Term Insurance ($180)',
    message: 'Your confirmed MetLife Premier Health mandate of $180 is scheduled on the 5th of the month.',
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
    accountType: 'personal',
    auraAccountType: 'PERSONAL',
    paypalAccountType: 'PERSONAL',
    merchantVerificationStatus: 'NOT_STARTED',
    merchantAccessEnabled: false,
    merchantVerifiedAt: null,
    paypalMerchantId: null,
    verificationMethod: null,
    verificationUpdatedAt: new Date(),
    currency: 'USD',
    monthlyIncome: 4200,
    familyGroupId: 'aura-family-patel',
    spendingPreferences: {
      riskTolerance: 'growth',
      priorityCategories: ['Education', 'Technology', 'Savings'],
      savingsTargetPercent: 15,
    },
    financialPolicy: {
      requirePinAboveAmount: 100,
      singleTransactionLimit: 1500,
      dailySpendingLimit: 2500,
      requireExplicitApproval: true,
      discretionaryMonthlyCap: 1200,
      allowFamilySharedView: false,
      blockedCategories: ['Gambling'],
    },
    onboardingCompleted: true,
  });

  const mayaChecking = await AccountModel.create({
    userId: maya._id,
    name: 'Student & Freelance Checking',
    institution: 'Chase Bank',
    type: 'checking',
    accountNumberMasked: 'XXXX-3199',
    balance: 2450,
    currency: 'USD',
    isSharedWithFamily: false,
    status: 'active',
  });

  const mayaPaypal = await AccountModel.create({
    userId: maya._id,
    name: 'PayPal Freelance Client Wallet',
    institution: 'PayPal Sandbox',
    type: 'wallet',
    accountNumberMasked: 'maya-freelance@paypal',
    balance: 1680,
    currency: 'USD',
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
      amount: 15,
      currency: 'USD',
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
      merchant: 'Xfinity Broadband',
      category: 'Internet',
      amount: 55,
      currency: 'USD',
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
      amount: 60,
      currency: 'USD',
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
      merchant: 'National Design Institute',
      category: 'Education',
      amount: 450,
      currency: 'USD',
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
    targetAmount: 1200,
    currentAmount: 600,
    monthlyContribution: 150,
    deadline: new Date(y, m + 6, 1),
    priority: 'high',
    isSharedWithFamily: false,
    milestones: [
      { percentage: 25, reached: true, reachedAt: new Date(y, m - 2, 10), confirmedByUser: true },
      { percentage: 50, reached: true, reachedAt: new Date(y, m, 1), confirmedByUser: true },
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

export const DEMO_BRUCE_CREDENTIALS = {
  email: 'bruce_wayne@business.example.com',
  password: 'BruceBusiness#2026',
  pin: '1939',
  name: 'Bruce Wayne',
  role: 'merchant' as const,
  accountType: 'business' as const,
  monthlyIncome: 250000,
  bio: 'AURA Store Merchant & Enterprise Administrator managing inventory, order fulfillment, and verified PayPal business settlements.',
};

export async function ensureDemoMerchantBruceSeeded(forceReset = false) {
  const existingBruce = await UserModel.findOne({ email: DEMO_BRUCE_CREDENTIALS.email });
  if (existingBruce && !forceReset) {
    let changed = false;
    if (existingBruce.accountType !== 'business' || existingBruce.role !== 'merchant') {
      existingBruce.accountType = 'business';
      existingBruce.role = 'merchant';
      changed = true;
    }
    if (
      existingBruce.auraAccountType !== 'BUSINESS' ||
      existingBruce.paypalAccountType !== 'BUSINESS' ||
      existingBruce.merchantVerificationStatus !== 'VERIFIED' ||
      !existingBruce.merchantAccessEnabled
    ) {
      existingBruce.auraAccountType = 'BUSINESS';
      existingBruce.paypalAccountType = 'BUSINESS';
      existingBruce.merchantVerificationStatus = 'VERIFIED';
      existingBruce.merchantAccessEnabled = true;
      existingBruce.merchantVerifiedAt = existingBruce.merchantVerifiedAt || new Date();
      existingBruce.paypalMerchantId = 'MERCHANT-BRUCE-WAYNE';
      existingBruce.verificationMethod = 'paypal_sandbox_verified_business_identity';
      existingBruce.verificationUpdatedAt = new Date();
      existingBruce.paypalAccountLinked = true;
      existingBruce.paypalIdentityVerified = true;
      existingBruce.paypalEmail = DEMO_BRUCE_CREDENTIALS.email;
      existingBruce.paypalUserId = existingBruce.paypalUserId || 'paypal-sub-bruce-wayne-biz';
      existingBruce.paypalPayerId = existingBruce.paypalPayerId || 'PAYER-ID-BRUCE-BIZ';
      changed = true;
    }
    if (changed) {
      await existingBruce.save();
    }
    return {
      seeded: false,
      user: existingBruce,
      credentials: DEMO_BRUCE_CREDENTIALS,
    };
  }

  if (forceReset && existingBruce) {
    await UserModel.deleteOne({ _id: existingBruce._id });
    await AccountModel.deleteMany({ userId: existingBruce._id });
  }

  logger.info('SeedService', 'Seeding demo merchant Bruce Wayne (Business Account persona)...');
  const passwordHash = await hashSecretArgon2id(DEMO_BRUCE_CREDENTIALS.password);
  const pinHash = await hashSecretArgon2id(DEMO_BRUCE_CREDENTIALS.pin);

  const bruce = await UserModel.create({
    name: DEMO_BRUCE_CREDENTIALS.name,
    email: DEMO_BRUCE_CREDENTIALS.email,
    passwordHash,
    pinHash,
    role: 'merchant',
    accountType: 'business',
    auraAccountType: 'BUSINESS',
    paypalAccountType: 'BUSINESS',
    merchantVerificationStatus: 'VERIFIED',
    merchantAccessEnabled: true,
    merchantVerifiedAt: new Date(),
    paypalMerchantId: 'MERCHANT-BRUCE-WAYNE',
    verificationMethod: 'paypal_sandbox_verified_business_identity',
    verificationUpdatedAt: new Date(),
    paypalAccountLinked: true,
    paypalIdentityVerified: true,
    paypalEmail: DEMO_BRUCE_CREDENTIALS.email,
    paypalUserId: 'paypal-sub-bruce-wayne-biz',
    paypalPayerId: 'PAYER-ID-BRUCE-BIZ',
    currency: 'USD',
    monthlyIncome: 250000,
    spendingPreferences: {
      riskTolerance: 'balanced',
      priorityCategories: ['Inventory', 'Logistics', 'Operations'],
      savingsTargetPercent: 30,
    },
    financialPolicy: {
      requirePinAboveAmount: 5000,
      singleTransactionLimit: 500000,
      dailySpendingLimit: 1000000,
      requireExplicitApproval: true,
      discretionaryMonthlyCap: 100000,
      allowFamilySharedView: false,
      blockedCategories: [],
    },
    onboardingCompleted: true,
  });

  const merchantAccount = await AccountModel.create({
    userId: bruce._id,
    name: 'Wayne Enterprises Merchant Settlement',
    institution: 'PayPal Sandbox Business Account',
    type: 'checking',
    accountNumberMasked: 'bruce_wayne@business.example.com',
    balance: 15420,
    currency: 'USD',
    isSharedWithFamily: false,
    status: 'active',
  });

  return {
    seeded: true,
    user: bruce,
    account: merchantAccount,
    credentials: DEMO_BRUCE_CREDENTIALS,
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
    {
      id: 'bruce',
      ...DEMO_BRUCE_CREDENTIALS,
    },
  ];
}
