import mongoose, { Schema, Document } from 'mongoose';

// ============================================================================
// 1. User Model (Argon2id Password + Argon2id PIN + Financial Permission Policy)
// ============================================================================
export interface IFinancialPolicy {
  requirePinAboveAmount: number;       // e.g. ₹2,000
  singleTransactionLimit: number;      // e.g. ₹75,000
  dailySpendingLimit: number;          // e.g. ₹1,00,000
  requireExplicitApproval: boolean;    // Always true by default
  discretionaryMonthlyCap: number;     // e.g. ₹18,000
  allowFamilySharedView: boolean;
  blockedCategories: string[];
}

export interface IFinancialProfile {
  monthlyIncome: number;
  incomeType: 'salary' | 'freelance' | 'business' | 'pension' | 'other';
  incomeFrequency: 'monthly' | 'biweekly' | 'weekly';
  expectedIncomeDate: number; // day of month, e.g. 1
  additionalIncome: number;
  incomeStatus: 'user_estimate' | 'imported_record' | 'verified';
  preferredCurrency: string;
}

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  pinHash: string;
  role: 'user' | 'family_admin' | 'family_member' | 'merchant' | 'admin';
  accountType?: 'personal' | 'business';
  currency: string;
  monthlyIncome: number;
  financialProfile?: IFinancialProfile;
  familyGroupId?: string;
  // PayPal Identity API Fields
  paypalUserId?: string;
  paypalPayerId?: string;
  paypalEmail?: string;
  paypalAccountLinked?: boolean;
  paypalIdentityVerified?: boolean;
  authenticationProvider?: 'local' | 'paypal' | 'both';
  paypalAccessToken?: string;
  paypalRefreshToken?: string;
  paypalTokenExpiresAt?: number;
  paypalGrantedScopes?: string;
  paypalAddress?: {
    streetAddress?: string;
    locality?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  paypalLastSyncAt?: Date;
  spendingPreferences: {
    riskTolerance: 'conservative' | 'balanced' | 'growth';
    priorityCategories: string[];
    savingsTargetPercent: number;
  };
  financialPolicy: IFinancialPolicy;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    pinHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'family_admin', 'family_member', 'merchant', 'admin'], default: 'family_admin' },
    accountType: { type: String, enum: ['personal', 'business'], default: 'personal' },
    currency: { type: String, default: 'USD' },
    monthlyIncome: { type: Number, default: 95000 },
    // PayPal Identity Fields
    paypalUserId: { type: String, unique: true, sparse: true, index: true },
    paypalPayerId: { type: String, sparse: true },
    paypalEmail: { type: String, lowercase: true, trim: true, sparse: true },
    paypalAccountLinked: { type: Boolean, default: false },
    paypalIdentityVerified: { type: Boolean, default: false },
    authenticationProvider: { type: String, enum: ['local', 'paypal', 'both'], default: 'local' },
    paypalAccessToken: { type: String, select: false },
    paypalRefreshToken: { type: String, select: false },
    paypalTokenExpiresAt: { type: Number },
    paypalGrantedScopes: { type: String },
    paypalAddress: {
      streetAddress: { type: String, trim: true },
      locality: { type: String, trim: true },
      region: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    paypalLastSyncAt: { type: Date },
    financialProfile: {
      monthlyIncome: { type: Number, default: 95000 },
      incomeType: { type: String, enum: ['salary', 'freelance', 'business', 'pension', 'other'], default: 'salary' },
      incomeFrequency: { type: String, enum: ['monthly', 'biweekly', 'weekly'], default: 'monthly' },
      expectedIncomeDate: { type: Number, default: 1 },
      additionalIncome: { type: Number, default: 0 },
      incomeStatus: { type: String, enum: ['user_estimate', 'imported_record', 'verified'], default: 'user_estimate' },
      preferredCurrency: { type: String, default: 'USD' },
    },
    familyGroupId: { type: String, index: true },
    spendingPreferences: {
      riskTolerance: { type: String, enum: ['conservative', 'balanced', 'growth'], default: 'balanced' },
      priorityCategories: { type: [String], default: ['Housing', 'Savings', 'Groceries', 'Education'] },
      savingsTargetPercent: { type: Number, default: 20 },
    },
    financialPolicy: {
      requirePinAboveAmount: { type: Number, default: 1000 },
      singleTransactionLimit: { type: Number, default: 75000 },
      dailySpendingLimit: { type: Number, default: 100000 },
      requireExplicitApproval: { type: Boolean, default: true },
      discretionaryMonthlyCap: { type: Number, default: 18000 },
      allowFamilySharedView: { type: Boolean, default: true },
      blockedCategories: { type: [String], default: [] },
    },
    onboardingCompleted: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>('User', UserSchema);

// ============================================================================
// 2. Financial Account Model
// ============================================================================
export interface IAccount extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  institution: string;
  type: 'checking' | 'savings' | 'credit' | 'wallet' | 'investment';
  accountNumberMasked: string;
  balance: number;
  currency: string;
  isSharedWithFamily: boolean;
  familyGroupId?: string;
  status: 'active' | 'archived';
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    institution: { type: String, required: true, trim: true },
    type: { type: String, enum: ['checking', 'savings', 'credit', 'wallet', 'investment'], default: 'checking' },
    accountNumberMasked: { type: String, required: true },
    balance: { type: Number, required: true, default: 0 },
    currency: { type: String, default: 'USD' },
    isSharedWithFamily: { type: Boolean, default: false },
    familyGroupId: { type: String, index: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const AccountModel = mongoose.model<IAccount>('Account', AccountSchema);

// ============================================================================
// 3. Transaction Model (Synchronised to Elasticsearch)
// ============================================================================
export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  accountName: string;
  date: Date;
  merchant: string;
  description: string;
  category: string;
  subcategory?: string;
  type: 'income' | 'expense' | 'transfer';
  direction?: 'incoming' | 'outgoing';
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'flagged' | 'failed' | 'refunded' | 'reversed';
  paymentMethod: 'bank_transfer' | 'upi' | 'card' | 'paypal' | 'direct_debit' | 'cash';
  isRecurring: boolean;
  mandateId?: mongoose.Types.ObjectId;
  isUnusual: boolean;
  unusualReason?: string;
  anomalyScore?: number;
  isSharedFamilyTransaction: boolean;
  familyGroupId?: string;
  tags: string[];
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalTransactionId?: string;
  counterparty?: string;
  sourceAccount?: string;
  destinationAccount?: string;
  associatedOrderId?: string;
  orderNumber?: string;
  feeAmount?: number;
  netAmount?: number;
  elasticSynced: boolean;
  elasticSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    accountName: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    merchant: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    subcategory: { type: String },
    type: { type: String, enum: ['income', 'expense', 'transfer'], required: true, index: true },
    direction: { type: String, enum: ['incoming', 'outgoing'], index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: {
      type: String,
      enum: ['completed', 'pending', 'flagged', 'failed', 'refunded', 'reversed'],
      default: 'completed',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'upi', 'card', 'paypal', 'direct_debit', 'cash'],
      default: 'upi',
    },
    isRecurring: { type: Boolean, default: false },
    mandateId: { type: Schema.Types.ObjectId, ref: 'Mandate' },
    isUnusual: { type: Boolean, default: false, index: true },
    unusualReason: { type: String },
    anomalyScore: { type: Number, default: 0 },
    isSharedFamilyTransaction: { type: Boolean, default: false },
    familyGroupId: { type: String, index: true },
    tags: { type: [String], default: [] },
    paypalOrderId: { type: String, index: true },
    paypalCaptureId: { type: String, index: true },
    paypalTransactionId: { type: String, index: true },
    counterparty: { type: String },
    sourceAccount: { type: String },
    destinationAccount: { type: String },
    associatedOrderId: { type: String },
    orderNumber: { type: String },
    feeAmount: { type: Number, default: 0 },
    netAmount: { type: Number },
    elasticSynced: { type: Boolean, default: false },
    elasticSyncedAt: { type: Date },
  },
  { timestamps: true }
);

TransactionSchema.index({ description: 'text', merchant: 'text', category: 'text' });

export const TransactionModel = mongoose.model<ITransaction>('Transaction', TransactionSchema);

// ============================================================================
// 4. Recurring Mandate / Upcoming Commitment Model (Synced with Bryntum Calendar)
// ============================================================================
export interface IMandate extends Document {
  userId: mongoose.Types.ObjectId;
  accountId?: mongoose.Types.ObjectId;
  title: string;
  merchant: string;
  category:
    | 'Rent'
    | 'Loan EMI'
    | 'Insurance'
    | 'Subscription'
    | 'Electricity'
    | 'Internet'
    | 'Education'
    | 'Salary'
    | 'Savings'
    | 'Other';
  amount: number;
  currency: string;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'weekly';
  dueDayOfMonth: number;
  nextDueDate: Date;
  status: 'confirmed' | 'inferred' | 'paused' | 'cancelled';
  confidenceScore: number;
  autoPayEnabled: boolean;
  isSharedWithFamily: boolean;
  familyGroupId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MandateSchema = new Schema<IMandate>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    title: { type: String, required: true, trim: true },
    merchant: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        'Rent',
        'Loan EMI',
        'Insurance',
        'Subscription',
        'Electricity',
        'Internet',
        'Education',
        'Salary',
        'Savings',
        'Other',
      ],
      default: 'Other',
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    frequency: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'weekly'], default: 'monthly' },
    dueDayOfMonth: { type: Number, required: true, min: 1, max: 31 },
    nextDueDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ['confirmed', 'inferred', 'paused', 'cancelled'], default: 'confirmed' },
    confidenceScore: { type: Number, default: 0.95 },
    autoPayEnabled: { type: Boolean, default: false },
    isSharedWithFamily: { type: Boolean, default: false },
    familyGroupId: { type: String, index: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export const MandateModel = mongoose.model<IMandate>('Mandate', MandateSchema);

// ============================================================================
// 5. Financial Plan & Recovery Model (Synchronised to Elasticsearch)
// ============================================================================
export interface IBudgetAllocation {
  category: string;
  type: 'essential' | 'discretionary' | 'savings' | 'commitment';
  plannedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  utilizationPercent: number;
  status: 'on_track' | 'warning' | 'overrun';
  recommendation?: string;
}

export interface IFinancialPlan extends Document {
  userId: mongoose.Types.ObjectId;
  month: string; // e.g. '2026-11'
  title: string;
  totalIncome: number;
  totalCommitments: number;
  totalEssentialBudget: number;
  totalDiscretionaryBudget: number;
  totalSavingsTarget: number;
  unallocatedBuffer: number;
  allocations: IBudgetAllocation[];
  aiSummary: string;
  recoveryRecommendations: {
    id: string;
    category: string;
    overrunAmount: number;
    action: string;
    projectedSavings: number;
    status: 'proposed' | 'accepted' | 'rejected';
  }[];
  status: 'draft' | 'active' | 'archived';
  elasticSynced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FinancialPlanSchema = new Schema<IFinancialPlan>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    month: { type: String, required: true, index: true },
    title: { type: String, required: true },
    totalIncome: { type: Number, required: true },
    totalCommitments: { type: Number, required: true },
    totalEssentialBudget: { type: Number, required: true },
    totalDiscretionaryBudget: { type: Number, required: true },
    totalSavingsTarget: { type: Number, required: true },
    unallocatedBuffer: { type: Number, default: 0 },
    allocations: [
      {
        category: { type: String, required: true },
        type: { type: String, enum: ['essential', 'discretionary', 'savings', 'commitment'], default: 'essential' },
        plannedAmount: { type: Number, required: true },
        spentAmount: { type: Number, default: 0 },
        remainingAmount: { type: Number, default: 0 },
        utilizationPercent: { type: Number, default: 0 },
        status: { type: String, enum: ['on_track', 'warning', 'overrun'], default: 'on_track' },
        recommendation: { type: String },
      },
    ],
    aiSummary: { type: String, required: true },
    recoveryRecommendations: [
      {
        id: { type: String, required: true },
        category: { type: String, required: true },
        overrunAmount: { type: Number, required: true },
        action: { type: String, required: true },
        projectedSavings: { type: Number, required: true },
        status: { type: String, enum: ['proposed', 'accepted', 'rejected'], default: 'proposed' },
      },
    ],
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'active' },
    elasticSynced: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const FinancialPlanModel = mongoose.model<IFinancialPlan>('FinancialPlan', FinancialPlanSchema);

// ============================================================================
// 6. Financial Goal Model
// ============================================================================
export interface IGoal extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  category: 'Emergency Fund' | 'Technology' | 'Travel' | 'Education' | 'Home' | 'Investment' | 'Family' | 'Other';
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  deadline: Date;
  priority: 'high' | 'medium' | 'low';
  isSharedWithFamily: boolean;
  familyGroupId?: string;
  milestones: {
    percentage: number;
    reached: boolean;
    reachedAt?: Date;
    confirmedByUser: boolean;
  }[];
  status: 'active' | 'completed' | 'paused';
  createdAt: Date;
  updatedAt: Date;
}

const GoalSchema = new Schema<IGoal>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Emergency Fund', 'Savings', 'Technology', 'Travel', 'Education', 'Home', 'Investment', 'Family', 'Other'],
      default: 'Other',
    },
    targetAmount: { type: Number, required: true },
    currentAmount: { type: Number, default: 0 },
    monthlyContribution: { type: Number, default: 5000 },
    deadline: { type: Date, required: true },
    priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    isSharedWithFamily: { type: Boolean, default: false },
    familyGroupId: { type: String, index: true },
    milestones: [
      {
        percentage: { type: Number, required: true },
        reached: { type: Boolean, default: false },
        reachedAt: { type: Date },
        confirmedByUser: { type: Boolean, default: false },
      },
    ],
    status: { type: String, enum: ['active', 'completed', 'paused'], default: 'active' },
  },
  { timestamps: true }
);

export const GoalModel = mongoose.model<IGoal>('Goal', GoalSchema);

// ============================================================================
// 7. Family Group Model (Privacy-Preserving Shared Finance)
// ============================================================================
export interface IFamilyGroup extends Document {
  familyGroupId: string;
  name: string;
  createdBy: mongoose.Types.ObjectId;
  members: {
    userId: mongoose.Types.ObjectId;
    name: string;
    email: string;
    relationship: string;
    role: 'admin' | 'member';
    privacyLevel: 'strict_private' | 'shared_summary_only' | 'shared_budgets';
    monthlySharedContribution: number;
  }[];
  sharedMonthlyBudget: number;
  sharedSpentThisMonth: number;
  sharedCategories: string[];
  createdAt: Date;
  updatedAt: Date;
}

const FamilyGroupSchema = new Schema<IFamilyGroup>(
  {
    familyGroupId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        relationship: { type: String, required: true },
        role: { type: String, enum: ['admin', 'member'], default: 'member' },
        privacyLevel: {
          type: String,
          enum: ['strict_private', 'shared_summary_only', 'shared_budgets'],
          default: 'shared_summary_only',
        },
        monthlySharedContribution: { type: Number, default: 15000 },
      },
    ],
    sharedMonthlyBudget: { type: Number, default: 40000 },
    sharedSpentThisMonth: { type: Number, default: 0 },
    sharedCategories: { type: [String], default: ['Housing', 'Groceries', 'Utilities', 'Family Education'] },
  },
  { timestamps: true }
);

export const FamilyGroupModel = mongoose.model<IFamilyGroup>('FamilyGroup', FamilyGroupSchema);

// ============================================================================
// 8. Bryntum Financial Calendar Event Model
// ============================================================================
export interface ICalendarEvent extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  eventType:
    | 'salary'
    | 'rent'
    | 'emi'
    | 'insurance'
    | 'subscription'
    | 'electricity'
    | 'education'
    | 'commitment'
    | 'milestone'
    | 'goal_deadline'
    | 'reminder'
    | 'bill'
    | 'loan_repayment'
    | 'credit_card'
    | 'planned_purchase'
    | 'paypal_payment'
    | 'commerce_delivery'
    | 'income'
    | 'incoming'
    | 'outgoing';
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  amount?: number;
  currency: string;
  direction?: 'incoming' | 'outgoing';
  linkedMandateId?: mongoose.Types.ObjectId;
  linkedGoalId?: mongoose.Types.ObjectId;
  linkedOrderId?: string;
  linkedTransactionId?: mongoose.Types.ObjectId;
  counterparty?: string;
  paymentMethod?: string;
  isOverdue?: boolean;
  isCompleted?: boolean;
  status: 'upcoming' | 'completed' | 'overdue' | 'rescheduled' | 'scheduled' | 'cancelled';
  reminderSent: boolean;
  color: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarEventSchema = new Schema<ICalendarEvent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    eventType: {
      type: String,
      enum: [
        'salary',
        'rent',
        'emi',
        'insurance',
        'subscription',
        'electricity',
        'education',
        'commitment',
        'milestone',
        'goal_deadline',
        'reminder',
        'bill',
        'loan_repayment',
        'credit_card',
        'planned_purchase',
        'paypal_payment',
        'commerce_delivery',
        'income',
        'incoming',
        'outgoing',
      ],
      default: 'commitment',
    },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true },
    allDay: { type: Boolean, default: true },
    amount: { type: Number },
    currency: { type: String, default: 'USD' },
    direction: { type: String, enum: ['incoming', 'outgoing'] },
    linkedMandateId: { type: Schema.Types.ObjectId, ref: 'Mandate' },
    linkedGoalId: { type: Schema.Types.ObjectId, ref: 'Goal' },
    linkedOrderId: { type: String },
    linkedTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    counterparty: { type: String },
    paymentMethod: { type: String },
    isOverdue: { type: Boolean, default: false },
    isCompleted: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['upcoming', 'completed', 'overdue', 'rescheduled', 'scheduled', 'cancelled'],
      default: 'upcoming',
    },
    reminderSent: { type: Boolean, default: false },
    color: { type: String, default: '#2563eb' },
    notes: { type: String },
  },
  { timestamps: true }
);

export const CalendarEventModel = mongoose.model<ICalendarEvent>('CalendarEvent', CalendarEventSchema);

// ============================================================================
// 9. Controlled Payment Request & PayPal Sandbox Order Model
// ============================================================================
export interface IPaymentRequest extends Document {
  userId: mongoose.Types.ObjectId;
  accountId?: mongoose.Types.ObjectId;
  idempotencyKey: string;
  recipientName: string;
  recipientEmail?: string;
  merchantCategory: string;
  description: string;
  amountInr: number;
  amountUsd: number;
  currency: string;
  status:
    | 'prepared'
    | 'guardian_approved'
    | 'guardian_blocked'
    | 'user_approved'
    | 'pin_verified'
    | 'paypal_order_created'
    | 'captured'
    | 'webhook_verified'
    | 'cancelled'
    | 'failed';
  guardianEvaluation: {
    passed: boolean;
    requiresPin: boolean;
    policyChecks: {
      rule: string;
      passed: boolean;
      detail: string;
    }[];
    evaluatedAt: Date;
  };
  pinVerifiedAt?: Date;
  approvalTokenHash?: string;
  approvalTokenExpiresAt?: Date;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalStatus?: string;
  paypalApprovalUrl?: string;
  webhookVerified: boolean;
  webhookEventId?: string;
  linkedTransactionId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentRequestSchema = new Schema<IPaymentRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    recipientName: { type: String, required: true, trim: true },
    recipientEmail: { type: String, trim: true },
    merchantCategory: { type: String, default: 'General' },
    description: { type: String, required: true },
    amountInr: { type: Number, required: true },
    amountUsd: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: {
      type: String,
      enum: [
        'prepared',
        'guardian_approved',
        'guardian_blocked',
        'user_approved',
        'pin_verified',
        'paypal_order_created',
        'captured',
        'webhook_verified',
        'cancelled',
        'failed',
      ],
      default: 'prepared',
    },
    guardianEvaluation: {
      passed: { type: Boolean, default: true },
      requiresPin: { type: Boolean, default: true },
      policyChecks: [
        {
          rule: { type: String },
          passed: { type: Boolean },
          detail: { type: String },
        },
      ],
      evaluatedAt: { type: Date, default: Date.now },
    },
    pinVerifiedAt: { type: Date },
    approvalTokenHash: { type: String },
    approvalTokenExpiresAt: { type: Date },
    paypalOrderId: { type: String, index: true },
    paypalCaptureId: { type: String },
    paypalStatus: { type: String },
    paypalApprovalUrl: { type: String },
    webhookVerified: { type: Boolean, default: false },
    webhookEventId: { type: String },
    linkedTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
  },
  { timestamps: true }
);

export const PaymentRequestModel = mongoose.model<IPaymentRequest>('PaymentRequest', PaymentRequestSchema);

// ============================================================================
// 10. Notification & Zapier Automation Rule Models
// ============================================================================
export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'commitment_reminder' | 'milestone' | 'monthly_summary' | 'payment_status' | 'calendar_reminder' | 'spending_warning' | 'recovery';
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'urgent';
  isRead: boolean;
  zapierDispatched: boolean;
  deduplicationKey?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'commitment_reminder',
        'milestone',
        'monthly_summary',
        'payment_status',
        'calendar_reminder',
        'spending_warning',
        'recovery',
      ],
      default: 'commitment_reminder',
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    severity: { type: String, enum: ['info', 'success', 'warning', 'urgent'], default: 'info' },
    isRead: { type: Boolean, default: false },
    zapierDispatched: { type: Boolean, default: false },
    deduplicationKey: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const NotificationModel = mongoose.model<INotification>('Notification', NotificationSchema);

export interface IAutomationRule extends Document {
  userId: mongoose.Types.ObjectId;
  automationType:
    | 'upcoming_commitment_reminder'
    | 'financial_milestone'
    | 'monthly_financial_summary'
    | 'payment_status_notification'
    | 'financial_calendar_reminder';
  name: string;
  description: string;
  triggerDescription: string;
  actionDescription: string;
  channel: 'email' | 'slack' | 'whatsapp_webhook' | 'google_calendar' | 'zapier_mcp';
  targetDestination: string;
  enabled: boolean;
  lastTriggeredAt?: Date;
  executionCount: number;
  lastStatus?: 'delivered' | 'queued_local' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const AutomationRuleSchema = new Schema<IAutomationRule>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    automationType: {
      type: String,
      enum: [
        'upcoming_commitment_reminder',
        'financial_milestone',
        'monthly_financial_summary',
        'payment_status_notification',
        'financial_calendar_reminder',
      ],
      required: true,
    },
    name: { type: String, required: true },
    description: { type: String, required: true },
    triggerDescription: { type: String, required: true },
    actionDescription: { type: String, required: true },
    channel: {
      type: String,
      enum: ['email', 'slack', 'whatsapp_webhook', 'google_calendar', 'zapier_mcp'],
      default: 'zapier_mcp',
    },
    targetDestination: { type: String, default: 'alex@aura-demo.finance' },
    enabled: { type: Boolean, default: true },
    lastTriggeredAt: { type: Date },
    executionCount: { type: Number, default: 0 },
    lastStatus: { type: String, enum: ['delivered', 'queued_local', 'failed'] },
  },
  { timestamps: true }
);

export const AutomationRuleModel = mongoose.model<IAutomationRule>('AutomationRule', AutomationRuleSchema);

// ============================================================================
// 10B. Durable Scheduled Task & Alert Model (Ask AURA Scheduling Engine)
// ============================================================================
export interface IScheduledTask extends Document {
  userId: mongoose.Types.ObjectId;
  scheduleId: string;
  title: string;
  message: string;
  scheduleType: 'one_time' | 'recurring' | 'conditional_event';
  triggerType:
    | 'datetime'
    | 'transaction_threshold'
    | 'spending_threshold'
    | 'balance_threshold'
    | 'mandate_due_offset';
  targetDateTime?: Date;
  timezone: string;
  recurrenceRule?: 'daily' | 'weekly' | 'monthly' | 'custom_cron';
  recurrenceDayOfWeek?: number; // 0=Sunday, 1=Monday...
  recurrenceDayOfMonth?: number; // 1-31
  offsetDays?: number; // e.g. 3 days before rent
  condition?: {
    field?: 'amount' | 'spending_month' | 'balance' | 'salary';
    operator?: '>' | '<' | '>=' | '<=' | '==';
    thresholdValue?: number;
    category?: string;
    targetMandateTitle?: string;
  };
  notificationPreferences: {
    channel: 'in_app' | 'email' | 'push';
    severity: 'info' | 'success' | 'warning' | 'urgent';
  };
  status: 'active' | 'completed' | 'cancelled' | 'paused';
  lastExecutedAt?: Date;
  nextExecutionAt?: Date;
  executionCount: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledTaskSchema = new Schema<IScheduledTask>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scheduleId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    scheduleType: {
      type: String,
      enum: ['one_time', 'recurring', 'conditional_event'],
      required: true,
      index: true,
    },
    triggerType: {
      type: String,
      enum: [
        'datetime',
        'transaction_threshold',
        'spending_threshold',
        'balance_threshold',
        'mandate_due_offset',
      ],
      required: true,
      index: true,
    },
    targetDateTime: { type: Date, index: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    recurrenceRule: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom_cron'] },
    recurrenceDayOfWeek: { type: Number },
    recurrenceDayOfMonth: { type: Number },
    offsetDays: { type: Number },
    condition: {
      field: { type: String },
      operator: { type: String },
      thresholdValue: { type: Number },
      category: { type: String },
      targetMandateTitle: { type: String },
    },
    notificationPreferences: {
      channel: { type: String, enum: ['in_app', 'email', 'push'], default: 'in_app' },
      severity: { type: String, enum: ['info', 'success', 'warning', 'urgent'], default: 'info' },
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled', 'paused'],
      default: 'active',
      index: true,
    },
    lastExecutedAt: { type: Date },
    nextExecutionAt: { type: Date, index: true },
    executionCount: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const ScheduledTaskModel = mongoose.model<IScheduledTask>('ScheduledTask', ScheduledTaskSchema);

// ============================================================================
// 11. Security & Financial Audit Log Model (Synced with Elastic Search)
// ============================================================================
export interface IAuditLog extends Document {
  userId?: mongoose.Types.ObjectId;
  actor: string; // 'user' | 'financial_guardian' | 'astropods_agent' | 'paypal_webhook' | 'system_worker'
  action: string;
  resourceType: string;
  resourceId?: string;
  status: 'success' | 'blocked' | 'failure';
  ipAddress?: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actor: { type: String, required: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String },
    status: { type: String, enum: ['success', 'blocked', 'failure'], default: 'success' },
    ipAddress: { type: String },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLogModel = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

// ============================================================================
// 12. Persistent Conversation & Message Models (Ask AURA Memory)
// ============================================================================
export interface CommerceContextProduct {
  id: string;
  name: string;
  title?: string;
  brand: string;
  category: string;
  description: string;
  priceInr: number;
  priceUsd?: number;
  demoPriceUsd?: number;
  demoPriceInr?: number;
  currency: string;
  imageUrl: string;
  retailerName: string;
  purchaseUrl: string;
  specifications?: Record<string, string>;
  features?: string[];
  availability?: string;
  variants?: string[];
  rating?: number;
  reviewCount?: number;
}

export interface ICommerceContext {
  lastSearchQuery?: string;
  lastSearchTimestamp?: Date;
  products: CommerceContextProduct[];
  recommendedProductId?: string;
  selectedProductId?: string;
  alternativeProducts?: CommerceContextProduct[];
  activeComparison?: {
    productAId: string;
    productBId: string;
    summary?: string;
  };
}

export interface IConversation extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  conversationSummary?: string;
  commerceContext?: ICommerceContext;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, default: 'New Conversation', trim: true },
    conversationSummary: { type: String },
    commerceContext: { type: Schema.Types.Mixed, default: null },
    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

export const ConversationModel = mongoose.model<IConversation>('Conversation', ConversationSchema);

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolAction?: any;
  commerceContext?: ICommerceContext;
  suggestedNextPrompts?: string[];
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    toolAction: { type: Schema.Types.Mixed },
    commerceContext: { type: Schema.Types.Mixed, default: null },
    suggestedNextPrompts: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const MessageModel = mongoose.model<IMessage>('Message', MessageSchema);

// ============================================================================
// 12. Semantic Embedding Model (Vector Retrieval & Context Search)
// ============================================================================
export interface ISemanticEmbedding extends Document {
  userId: mongoose.Types.ObjectId;
  sourceType: 'chat_message' | 'transaction' | 'document' | 'financial_note';
  sourceId: string;
  textHash: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const SemanticEmbeddingSchema = new Schema<ISemanticEmbedding>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceType: {
      type: String,
      enum: ['chat_message', 'transaction', 'document', 'financial_note'],
      required: true,
      index: true,
    },
    sourceId: { type: String, required: true },
    textHash: { type: String, required: true, index: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Compound indexes for fast lookup and user isolation
SemanticEmbeddingSchema.index({ userId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
SemanticEmbeddingSchema.index({ userId: 1, textHash: 1 });

export const SemanticEmbeddingModel = mongoose.model<ISemanticEmbedding>(
  'SemanticEmbedding',
  SemanticEmbeddingSchema
);

// ============================================================================
// 13. AURA E-Commerce: Shopping Cart Model
// ============================================================================
export interface ICartItem {
  productId: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  imageUrl: string;
  retailerName: string;
  purchaseUrl: string;
  originalPrice: number;
  demoPrice: number;
  currency: string;
  selectedVariant: string;
  quantity: number;
  availableVariants: string[];
}

export interface ICart extends Document {
  userId: mongoose.Types.ObjectId;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const CartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    brand: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, default: '' },
    imageUrl: { type: String, required: true },
    retailerName: { type: String, required: true },
    purchaseUrl: { type: String, default: '' },
    originalPrice: { type: Number, required: true },
    demoPrice: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    selectedVariant: { type: String, default: 'Standard' },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    availableVariants: { type: [String], default: [] },
  },
  { _id: false }
);

const CartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

export const CartModel = mongoose.model<ICart>('Cart', CartSchema);

// ============================================================================
// 14. AURA E-Commerce: Orders & Shipment Model
// ============================================================================
export type FulfillmentStatus =
  | 'payment_completed'
  | 'order_confirmed'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface IEcommerceOrderItem {
  productId: string;
  name: string;
  brand: string;
  category: string;
  imageUrl: string;
  retailerName: string;
  purchaseUrl: string;
  originalPrice: number;
  demoPrice: number;
  selectedVariant: string;
  quantity: number;
  totalPrice: number;
}

export interface IEcommerceShippingAddress {
  fullName: string;
  streetAddress: string;
  locality: string; // city
  region: string; // state
  postalCode: string;
  country: string;
  phone?: string;
}

export interface IEcommercePaymentInfo {
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paymentStatus: 'pending' | 'completed' | 'failed' | 'cancelled';
  paidAt?: Date;
  amountPaid?: number;
  currency?: string;
  payerEmail?: string;
  payerId?: string;
  payerName?: string;
  rawCaptureData?: any;
  idempotencyKey?: string;
}

export interface IEcommerceShipment {
  carrier?: string;
  trackingNumber?: string;
  shippedAt?: Date;
  estimatedDeliveryAt?: Date;
  notes?: string;
  isSimulated: boolean;
  paypalTrackerId?: string;
  trackingSyncStatus?: 'not_synced' | 'synced' | 'failed';
  trackingSyncError?: string;
}

export interface IEcommerceStatusHistory {
  status: FulfillmentStatus;
  timestamp: Date;
  notes?: string;
  carrier?: string;
  trackingNumber?: string;
  updatedBy?: string;
}

export interface IEcommerceOrder extends Document {
  orderNumber: string;
  userId: mongoose.Types.ObjectId;
  merchantId?: mongoose.Types.ObjectId;
  merchantEmail?: string;
  customerName: string;
  customerEmail: string;
  items: IEcommerceOrderItem[];
  currency: string;
  subtotal: number;
  shippingFee: number;
  tax: number;
  totalAmount: number;
  shippingAddress: IEcommerceShippingAddress;
  paymentInfo: IEcommercePaymentInfo;
  fulfillmentStatus: FulfillmentStatus;
  shipment: IEcommerceShipment;
  statusHistory: IEcommerceStatusHistory[];
  isSimulatedStore: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EcommerceOrderItemSchema = new Schema<IEcommerceOrderItem>(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    brand: { type: String, required: true },
    category: { type: String, required: true },
    imageUrl: { type: String, required: true },
    retailerName: { type: String, required: true },
    purchaseUrl: { type: String, default: '' },
    originalPrice: { type: Number, required: true },
    demoPrice: { type: Number, required: true },
    selectedVariant: { type: String, default: 'Standard' },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    totalPrice: { type: Number, required: true },
  },
  { _id: false }
);

const EcommerceShippingAddressSchema = new Schema<IEcommerceShippingAddress>(
  {
    fullName: { type: String, required: true, trim: true },
    streetAddress: { type: String, required: true, trim: true },
    locality: { type: String, required: true, trim: true },
    region: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'US' },
    phone: { type: String, trim: true },
  },
  { _id: false }
);

const EcommerceOrderSchema = new Schema<IEcommerceOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    merchantId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    merchantEmail: { type: String, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    items: { type: [EcommerceOrderItemSchema], required: true },
    currency: { type: String, default: 'USD' },
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    shippingAddress: { type: EcommerceShippingAddressSchema, required: true },
    paymentInfo: {
      paypalOrderId: { type: String, index: true },
      paypalCaptureId: { type: String, index: true },
      paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'pending',
        index: true,
      },
      paidAt: { type: Date },
      amountPaid: { type: Number },
      currency: { type: String, default: 'USD' },
      payerEmail: { type: String },
      payerId: { type: String },
      payerName: { type: String },
      rawCaptureData: { type: Schema.Types.Mixed },
      idempotencyKey: { type: String, index: true },
    },
    fulfillmentStatus: {
      type: String,
      enum: [
        'payment_completed',
        'order_confirmed',
        'processing',
        'packed',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
      ],
      default: 'payment_completed',
      index: true,
    },
    shipment: {
      carrier: { type: String },
      trackingNumber: { type: String },
      shippedAt: { type: Date },
      estimatedDeliveryAt: { type: Date },
      notes: { type: String },
      isSimulated: { type: Boolean, default: true },
      paypalTrackerId: { type: String },
      trackingSyncStatus: {
        type: String,
        enum: ['not_synced', 'synced', 'failed'],
        default: 'not_synced',
      },
      trackingSyncError: { type: String },
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String },
        carrier: { type: String },
        trackingNumber: { type: String },
        updatedBy: { type: String },
      },
    ],
    isSimulatedStore: { type: Boolean, default: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export const EcommerceOrderModel = mongoose.model<IEcommerceOrder>(
  'EcommerceOrder',
  EcommerceOrderSchema
);
