import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ITransaction } from '../../models';

export interface AgGridFilterCommand {
  categoryFilter?: string[];
  typeFilter?: 'income' | 'expense' | 'transfer';
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  onlyUnusual?: boolean;
  searchQuery?: string;
  sortBy?: 'date' | 'amount' | 'merchant' | 'category';
  sortOrder?: 'asc' | 'desc';
  groupBy?: 'category' | 'month' | 'accountName' | 'paymentMethod' | null;
}

export interface AgGridAnalyticsPayload {
  edition: 'ag-grid-community' | 'ag-studio-enterprise';
  rowCount: number;
  rows: any[];
  summaryRow: {
    merchant: string;
    totalIncome: number;
    totalExpense: number;
    netAmount: number;
    unusualCount: number;
    averageExpense: number;
  };
  categoryAggregations: {
    category: string;
    count: number;
    totalAmount: number;
    sharePercent: number;
    avgAmount: number;
  }[];
  appliedFilterModel: AgGridFilterCommand;
}

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  dining: ['Dining', 'Food & Dining', 'Restaurants'],
  food: ['Dining', 'Food & Dining', 'Groceries'],
  groceries: ['Groceries', 'Household'],
  rent: ['Rent', 'Housing'],
  housing: ['Rent', 'Housing'],
  travel: ['Travel', 'Transport'],
  transport: ['Transport', 'Travel', 'Fuel'],
  shopping: ['Shopping', 'Electronics'],
  electronics: ['Electronics', 'Shopping'],
  utilities: ['Electricity', 'Internet', 'Utilities'],
  electricity: ['Electricity', 'Utilities'],
  internet: ['Internet', 'Utilities'],
  insurance: ['Insurance'],
  subscriptions: ['Subscription'],
  education: ['Education', 'Family Education'],
  salary: ['Salary', 'Income'],
};

export class AgGridIntegrationService {
  getHealthStatus() {
    const isStudio = Boolean(env.AG_STUDIO_ENABLED && env.AG_GRID_LICENSE_KEY);
    return {
      technology: 'AG Grid / AG Studio',
      intendedResponsibility: 'Financial analytics engine, interactive transaction grid & NL query exploration',
      status: 'operational',
      edition: isStudio ? 'AG Studio Enterprise' : 'AG Grid Community v32 + AURA Financial Analytics Workbench',
      studioLicenseConfigured: isStudio,
      capabilities: [
        'Sortable & filterable multi-account transactions',
        'Category grouping & aggregation summaries',
        'Date range & account filtering',
        'Custom status & anomaly cell indicators',
        'Natural-language query to AG Grid filter/aggregation model',
      ],
    };
  }

  /**
   * Parses a natural-language financial question into a deterministic AG Grid filter & aggregation command.
   * Ensures all figures displayed in AG Grid originate strictly from backend calculations.
   */
  parseNaturalLanguageToGridFilter(query: string, referenceDate = new Date()): AgGridFilterCommand {
    const q = query.toLowerCase();
    const cmd: AgGridFilterCommand = {
      sortBy: 'date',
      sortOrder: 'desc',
      groupBy: null,
    };

    // Match categories
    const matchedCategories = new Set<string>();
    for (const [keyword, cats] of Object.entries(CATEGORY_SYNONYMS)) {
      if (q.includes(keyword)) {
        cats.forEach((c) => matchedCategories.add(c));
      }
    }
    if (matchedCategories.size > 0) {
      cmd.categoryFilter = Array.from(matchedCategories);
    }

    // Match time horizon (e.g., "last three months", "last 3 months", "this month", "last month")
    const now = new Date(referenceDate);
    if (q.includes('three months') || q.includes('3 months') || q.includes('quarter')) {
      const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      cmd.dateFrom = from.toISOString().split('T')[0];
    } else if (q.includes('six months') || q.includes('6 months')) {
      const from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      cmd.dateFrom = from.toISOString().split('T')[0];
    } else if (q.includes('last month')) {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      cmd.dateFrom = from.toISOString().split('T')[0];
      cmd.dateTo = to.toISOString().split('T')[0];
    } else if (q.includes('this month')) {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      cmd.dateFrom = from.toISOString().split('T')[0];
    }

    // Match unusual / anomaly queries
    if (q.includes('unusual') || q.includes('anomal') || q.includes('flagged') || q.includes('spike')) {
      cmd.onlyUnusual = true;
    }

    // Match expense vs income
    if (q.includes('expenditure') || q.includes('spend') || q.includes('spent') || q.includes('expense')) {
      cmd.typeFilter = 'expense';
    } else if (q.includes('income') || q.includes('salary') || q.includes('earned')) {
      cmd.typeFilter = 'income';
    }

    // Match grouping intent
    if (q.includes('by category') || q.includes('category-wise') || q.includes('breakdown')) {
      cmd.groupBy = 'category';
    } else if (q.includes('by month') || q.includes('monthly')) {
      cmd.groupBy = 'month';
    }

    // Match threshold amounts like "above 5000" or "over ₹2,000"
    const overMatch = q.match(/(?:above|over|more than|greater than)\s*(?:₹|inr|rs\.?)?\s*([\d,]+)/i);
    if (overMatch) {
      const parsed = parseFloat(overMatch[1].replace(/,/g, ''));
      if (!isNaN(parsed)) cmd.minAmount = parsed;
    }

    logger.info('AGGridIntegration', 'Translated NL query into AG Grid filter command', { query, cmd });
    return cmd;
  }

  /**
   * Builds the AG Grid row dataset, pinned summary row, and category aggregations from authorised transactions.
   */
  buildGridAnalyticsPayload(
    transactions: ITransaction[],
    filterCmd: AgGridFilterCommand = {}
  ): AgGridAnalyticsPayload {
    let filtered = [...transactions];

    if (filterCmd.categoryFilter && filterCmd.categoryFilter.length > 0) {
      const allowed = new Set(filterCmd.categoryFilter.map((c) => c.toLowerCase()));
      filtered = filtered.filter((t) => allowed.has(t.category.toLowerCase()));
    }
    if (filterCmd.typeFilter) {
      filtered = filtered.filter((t) => t.type === filterCmd.typeFilter);
    }
    if (filterCmd.onlyUnusual) {
      filtered = filtered.filter((t) => t.isUnusual);
    }
    if (filterCmd.dateFrom) {
      const fromTime = new Date(filterCmd.dateFrom).getTime();
      filtered = filtered.filter((t) => new Date(t.date).getTime() >= fromTime);
    }
    if (filterCmd.dateTo) {
      const toTime = new Date(filterCmd.dateTo).getTime() + 86400000;
      filtered = filtered.filter((t) => new Date(t.date).getTime() <= toTime);
    }
    if (typeof filterCmd.minAmount === 'number') {
      filtered = filtered.filter((t) => t.amount >= filterCmd.minAmount!);
    }
    if (typeof filterCmd.maxAmount === 'number') {
      filtered = filtered.filter((t) => t.amount <= filterCmd.maxAmount!);
    }
    if (filterCmd.searchQuery && filterCmd.searchQuery.trim()) {
      const term = filterCmd.searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.merchant.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term) ||
          t.category.toLowerCase().includes(term) ||
          t.accountName.toLowerCase().includes(term)
      );
    }

    const totalIncome = filtered
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = filtered.filter((t) => t.type === 'expense');
    const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);
    const unusualCount = filtered.filter((t) => t.isUnusual).length;
    const averageExpense = expenses.length > 0 ? Math.round((totalExpense / expenses.length) * 100) / 100 : 0;

    // Category aggregations
    const catMap = new Map<string, { count: number; totalAmount: number }>();
    for (const exp of expenses) {
      const curr = catMap.get(exp.category) || { count: 0, totalAmount: 0 };
      curr.count += 1;
      curr.totalAmount += exp.amount;
      catMap.set(exp.category, curr);
    }

    const categoryAggregations = Array.from(catMap.entries())
      .map(([category, stats]) => ({
        category,
        count: stats.count,
        totalAmount: Math.round(stats.totalAmount * 100) / 100,
        sharePercent: totalExpense > 0 ? Math.round((stats.totalAmount / totalExpense) * 1000) / 10 : 0,
        avgAmount: Math.round((stats.totalAmount / stats.count) * 100) / 100,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const rows = filtered.map((t) => ({
      id: String(t._id),
      date: new Date(t.date).toISOString().split('T')[0],
      merchant: t.merchant,
      description: t.description,
      category: t.category,
      accountName: t.accountName,
      accountId: String(t.accountId),
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      status: t.status,
      paymentMethod: t.paymentMethod,
      isRecurring: t.isRecurring,
      isUnusual: t.isUnusual,
      unusualReason: t.unusualReason || '',
      isSharedFamilyTransaction: t.isSharedFamilyTransaction,
    }));

    return {
      edition: env.AG_STUDIO_ENABLED && env.AG_GRID_LICENSE_KEY ? 'ag-studio-enterprise' : 'ag-grid-community',
      rowCount: rows.length,
      rows,
      summaryRow: {
        merchant: `TOTAL (${rows.length} transactions)`,
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpense: Math.round(totalExpense * 100) / 100,
        netAmount: Math.round((totalIncome - totalExpense) * 100) / 100,
        unusualCount,
        averageExpense,
      },
      categoryAggregations,
      appliedFilterModel: filterCmd,
    };
  }
}

export const agGridIntegration = new AgGridIntegrationService();
