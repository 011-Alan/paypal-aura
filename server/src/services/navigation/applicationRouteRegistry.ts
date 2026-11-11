export interface ApplicationRouteDefinition {
  id: string;
  route: string;
  navTabId: string;
  title: string;
  description: string;
  capabilities: string[];
  requiresMerchantAuth?: boolean;
  defaultSubView?: string;
}

export const APPLICATION_ROUTES: Record<string, ApplicationRouteDefinition> = {
  overview: {
    id: 'overview',
    route: '/',
    navTabId: 'overview',
    title: 'Financial Overview',
    description: 'High-level dashboard of total wealth, liquid checking/savings balances, and recent financial activity.',
    capabilities: [
      'view_overview',
      'view_net_worth',
      'view_monthly_cashflow',
      'view_recent_activity',
    ],
  },
  accounts: {
    id: 'accounts',
    route: '/accounts',
    navTabId: 'accounts',
    title: 'Financial Accounts',
    description: 'Linked bank accounts, digital wallets, credit cards, and live institution synchronization.',
    capabilities: [
      'view_accounts',
      'link_account',
      'view_balances',
      'view_bank_sync',
    ],
  },
  transactions: {
    id: 'transactions',
    route: '/transactions',
    navTabId: 'transactions',
    title: 'Transactions & Spending',
    description: 'Interactive AG Grid table with column filtering, sorting, row selection, and deep AI spending intelligence.',
    capabilities: [
      'view_transactions',
      'filter_transactions',
      'sort_transactions',
      'analyse_transactions',
      'grid_actions',
      'export_csv',
    ],
  },
  goals: {
    id: 'goals',
    route: '/goals',
    navTabId: 'goals',
    title: 'Financial Goals',
    description: 'Targeted savings accounts, milestone tracking, monthly contribution calculations, and emergency fund goals.',
    capabilities: [
      'view_goals',
      'create_goal',
      'update_goal',
      'delete_goal',
      'calculate_monthly_contribution',
    ],
  },
  commitments: {
    id: 'commitments',
    route: '/commitments',
    navTabId: 'commitments',
    title: 'Bills & Commitments',
    description: 'Scheduled recurring payments, subscription review, utility bills, and cash outflow forecasting.',
    capabilities: [
      'view_bills',
      'create_bill',
      'update_bill',
      'cancel_subscription',
      'view_upcoming_commitments',
    ],
  },
  financialPlanning: {
    id: 'financial-planning',
    route: '/financial-planning',
    navTabId: 'financial-planning',
    title: 'Financial Planning',
    description: 'Monthly discretionary budgets, category allocations, emergency cushions, and 50/30/20 breakdown.',
    capabilities: [
      'view_budget',
      'modify_budget',
      'emergency_fund_calculator',
      'cashflow_forecast',
    ],
  },
  calendar: {
    id: 'calendar',
    route: '/calendar',
    navTabId: 'calendar',
    title: 'Financial Calendar',
    description: 'Bryntum-powered timeline for upcoming bills, income paydays, subscription renewals, and durable reminders.',
    capabilities: [
      'view_calendar',
      'schedule_reminder',
      'create_event',
      'monthly_review_schedule',
    ],
  },
  commerce: {
    id: 'smart-purchases',
    route: '/smart-purchases',
    navTabId: 'smart-purchases',
    title: 'AURA Commerce',
    description: 'Intelligent e-commerce storefront with Channel3 catalog search, spec comparison, affordability analysis, and PayPal checkout.',
    capabilities: [
      'search_products',
      'filter_products',
      'compare_products',
      'recommend_products',
      'select_product',
      'prepare_checkout',
      'track_orders',
    ],
  },
  payments: {
    id: 'payments',
    route: '/payments',
    navTabId: 'payments',
    title: 'Payments & Transfers',
    description: 'Review prepared payment drafts and authorize money movement with explicit security PIN approval.',
    capabilities: [
      'view_payment_methods',
      'prepare_payment',
      'send_money',
      'authorize_payment',
    ],
  },
  settings: {
    id: 'settings',
    route: '/settings',
    navTabId: 'settings',
    title: 'Settings & Security',
    description: 'Theme customization (light/dark), sidebar controls, notification preferences, and PayPal Business merchant verification.',
    capabilities: [
      'change_theme',
      'toggle_sidebar',
      'merchant_verification',
      'notification_preferences',
      'logout',
    ],
  },
  merchantHub: {
    id: 'merchant-hub',
    route: '/merchant-hub',
    navTabId: 'merchant-hub',
    title: 'Merchant Hub',
    description: 'B2B order fulfillment, revenue analytics, customer refund management, and inventory operations. Requires verified PayPal Business classification.',
    capabilities: [
      'view_merchant_orders',
      'view_merchant_analytics',
      'update_fulfilment',
      'manage_inventory',
    ],
    requiresMerchantAuth: true,
  },
  developer: {
    id: 'developer',
    route: '/developer',
    navTabId: 'developer',
    title: 'Developer Portal',
    description: 'APIMatic OpenAPI 3.0.3 documentation, TypeScript & Python SDKs, and live interactive API playground.',
    capabilities: [
      'api_reference',
      'sdks',
      'live_playground',
      'openapi_spec',
    ],
  },
  family: {
    id: 'family',
    route: '/family',
    navTabId: 'family',
    title: 'Family Shared Finance',
    description: 'Privacy-preserving family budgets, shared savings pools, and dependent allowance management.',
    capabilities: [
      'view_family_members',
      'shared_budgets',
      'shared_goals',
    ],
  },
};

export class ApplicationRouteRegistry {
  public getAllRoutes(): ApplicationRouteDefinition[] {
    return Object.values(APPLICATION_ROUTES);
  }

  public getRouteById(id: string): ApplicationRouteDefinition | undefined {
    const key = Object.keys(APPLICATION_ROUTES).find(
      (k) =>
        k.toLowerCase() === id.toLowerCase() ||
        APPLICATION_ROUTES[k].id.toLowerCase() === id.toLowerCase() ||
        APPLICATION_ROUTES[k].navTabId.toLowerCase() === id.toLowerCase()
    );
    return key ? APPLICATION_ROUTES[key] : undefined;
  }

  public resolveRouteForIntent(prompt: string): ApplicationRouteDefinition | null {
    const pLower = prompt.toLowerCase();

    // 1. Merchant Hub
    if (pLower.includes('merchant') || pLower.includes('b2b orders') || pLower.includes('business orders')) {
      return APPLICATION_ROUTES.merchantHub;
    }

    // 2. Commerce & Shopping
    if (
      pLower.includes('commerce') ||
      pLower.includes('store') ||
      pLower.includes('shop') ||
      pLower.includes('buy ') ||
      pLower.includes('purchase ') ||
      pLower.includes('find me a ') ||
      pLower.includes('looking for a ')
    ) {
      return APPLICATION_ROUTES.commerce;
    }

    // 3. Transactions & Spending
    if (
      pLower.includes('transaction') ||
      pLower.includes('spending') ||
      pLower.includes('expense') ||
      pLower.includes('filter transactions') ||
      pLower.includes('largest expense')
    ) {
      return APPLICATION_ROUTES.transactions;
    }

    // 4. Goals & Savings
    if (
      pLower.includes('goal') ||
      pLower.includes('savings target') ||
      pLower.includes('emergency fund goal')
    ) {
      return APPLICATION_ROUTES.goals;
    }

    // 5. Bills & Commitments
    if (
      pLower.includes('bill') ||
      pLower.includes('commitment') ||
      pLower.includes('subscription') ||
      pLower.includes('recurring payment')
    ) {
      return APPLICATION_ROUTES.commitments;
    }

    // 6. Financial Planning & Budgets
    if (
      pLower.includes('financial plan') ||
      pLower.includes('planning') ||
      pLower.includes('budget') ||
      pLower.includes('allocation')
    ) {
      return APPLICATION_ROUTES.financialPlanning;
    }

    // 7. Calendar & Scheduling
    if (
      pLower.includes('calendar') ||
      pLower.includes('schedule') ||
      pLower.includes('reminder') ||
      pLower.includes('timeline')
    ) {
      return APPLICATION_ROUTES.calendar;
    }

    // 8. Accounts & Balances
    if (
      pLower.includes('account') ||
      pLower.includes('my money') ||
      pLower.includes('bank balance') ||
      pLower.includes('wallet')
    ) {
      return APPLICATION_ROUTES.accounts;
    }

    // 9. Payments & Transfers
    if (
      pLower.includes('payment') ||
      pLower.includes('transfer money') ||
      pLower.includes('send money')
    ) {
      return APPLICATION_ROUTES.payments;
    }

    // 10. Settings & Security
    if (
      pLower.includes('setting') ||
      pLower.includes('security') ||
      pLower.includes('theme') ||
      pLower.includes('dark mode') ||
      pLower.includes('light mode') ||
      pLower.includes('preferences')
    ) {
      return APPLICATION_ROUTES.settings;
    }

    // 11. Developer Portal
    if (
      pLower.includes('developer') ||
      pLower.includes('api reference') ||
      pLower.includes('sdk') ||
      pLower.includes('open api') ||
      pLower.includes('apimatic')
    ) {
      return APPLICATION_ROUTES.developer;
    }

    // 12. Family
    if (pLower.includes('family') || pLower.includes('shared finance')) {
      return APPLICATION_ROUTES.family;
    }

    return null;
  }
}

export const applicationRouteRegistry = new ApplicationRouteRegistry();
