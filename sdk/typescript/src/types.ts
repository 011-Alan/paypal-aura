export interface User {
  id: string;
  email: string;
  name: string;
  auraAccountType: 'PERSONAL' | 'BUSINESS' | 'UNVERIFIED';
  paypalAccountType: 'PERSONAL' | 'BUSINESS' | 'UNKNOWN';
  merchantVerificationStatus: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'UNVERIFIED';
  merchantAccessEnabled: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment';
  institution: string;
  balance: number;
  currency: string;
  lastSyncedAt?: string;
}

export interface Transaction {
  id: string;
  date: string;
  merchant: string;
  description: string;
  category: string;
  accountName?: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  status?: string;
  isUnusual?: boolean;
  unusualReason?: string;
}

export interface FinancialPlan {
  id: string;
  title: string;
  totalCommitments: number;
  totalEssentialBudget: number;
  totalDiscretionaryBudget: number;
  totalSavingsTarget: number;
  aiSummary: string;
  allocations?: Array<{
    category: string;
    type: string;
    plannedAmount: number;
    spentAmount: number;
    remainingAmount: number;
    utilizationPercent: number;
    status: 'normal' | 'warning' | 'overrun';
    recommendation?: string;
  }>;
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  category?: string;
  monthlyContribution?: number;
  status: 'in_progress' | 'completed' | 'paused';
}

export interface Mandate {
  id: string;
  title: string;
  merchant: string;
  category: string;
  amount: number;
  dueDayOfMonth: number;
  status: 'confirmed' | 'inferred' | 'paused';
}

export interface EcommerceProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
  inStock?: boolean;
}

export interface EcommerceOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  totalAmount: number;
  currency: string;
  fulfillmentStatus:
    | 'payment_completed'
    | 'order_confirmed'
    | 'processing'
    | 'packed'
    | 'shipped'
    | 'out_for_delivery'
    | 'delivered'
    | 'cancelled';
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export interface GridSavedView {
  id?: string;
  gridId: string;
  name: string;
  filterModel?: Record<string, any>;
  sortModel?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
  columnVisibility?: Record<string, boolean>;
  createdAt?: string;
}

export interface GridSelectionContext {
  source: 'transactions' | 'orders' | 'commitments' | 'goals' | 'budget';
  gridId: string;
  selectedIds: string[];
  selectionMode?: 'explicit' | 'filtered' | 'all';
}

export interface SanitizedSelectionResult {
  source: string;
  gridId: string;
  totalSelected: number;
  records: any[];
  summary: {
    totalAmount: number;
    currency: string;
    itemCount: number;
    averageAmount?: number;
    dateRange?: { earliest: string; latest: string };
    categories?: Record<string, number>;
    merchants?: Record<string, number>;
  };
}

export interface AiAskRequest {
  prompt: string;
  conversationId?: string;
  gridSelectionContext?: GridSelectionContext;
}

export interface AiAskResponse {
  success: boolean;
  response: string;
  executedAction?: {
    name: string;
    gridId?: string;
    parameters?: any;
  };
  suggestedNextPrompts?: string[];
}
