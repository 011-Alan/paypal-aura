import {
  User,
  Account,
  Transaction,
  FinancialPlan,
  Goal,
  Mandate,
  EcommerceProduct,
  EcommerceOrder,
  GridSavedView,
  GridSelectionContext,
  SanitizedSelectionResult,
  AiAskRequest,
  AiAskResponse,
} from './types';
import {
  AuraError,
  AuraAuthenticationError,
  AuraAuthorizationError,
  AuraNotFoundError,
  AuraRateLimitError,
} from './errors';

export interface AuraClientOptions {
  baseUrl?: string;
  apiKey?: string;
  token?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class AuraClient {
  private baseUrl: string;
  private token?: string;
  private apiKey?: string;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: AuraClientOptions = {}) {
    this.baseUrl = (options.baseUrl || 'http://localhost:5000').replace(/\/$/, '');
    this.token = options.token;
    this.apiKey = options.apiKey;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 400;
  }

  public setToken(token: string) {
    this.token = token;
  }

  public setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.apiKey) {
      headers['X-AURA-API-KEY'] = this.apiKey;
    }

    let attempt = 0;
    while (true) {
      try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
          throw new AuraAuthenticationError('Authentication required or token expired');
        }
        if (response.status === 403) {
          const body: any = await response.json().catch(() => ({}));
          throw new AuraAuthorizationError(body.error || 'Access denied for current credentials', body);
        }
        if (response.status === 404) {
          throw new AuraNotFoundError(`Resource at ${path} not found`);
        }
        if (response.status === 429) {
          throw new AuraRateLimitError('Rate limit exceeded; backoff recommended');
        }

        const data: any = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new AuraError(data.error || `HTTP ${response.status}`, response.status, data.code, data);
        }

        return data as T;
      } catch (err: any) {
        attempt++;
        const isTransient = err instanceof AuraRateLimitError || (err.statusCode && err.statusCode >= 500) || err.name === 'FetchError';
        if (isTransient && attempt <= this.maxRetries) {
          const backoff = this.retryDelayMs * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }
        throw err;
      }
    }
  }

  // --- Sub-APIs ---

  public auth = {
    demoLogin: async (persona: 'alex' | 'priya' | 'maya' | 'bruce'): Promise<{ user: User; token: string }> => {
      const res = await this.request<{ user: User; token: string }>('/api/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ persona }),
      });
      if (res.token) {
        this.setToken(res.token);
      }
      return res;
    },
    login: async (email: string, password: string): Promise<{ user: User; token: string }> => {
      const res = await this.request<{ user: User; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.token) {
        this.setToken(res.token);
      }
      return res;
    },
    getSession: async (): Promise<{ user: User }> => {
      return this.request<{ user: User }>('/api/auth/session');
    },
  };

  public accounts = {
    list: async (): Promise<{ accounts: Account[]; totalBalance: number }> => {
      return this.request<{ accounts: Account[]; totalBalance: number }>('/api/accounts');
    },
  };

  public transactions = {
    list: async (params?: { category?: string; type?: string; limit?: number }): Promise<{ transactions: Transaction[]; agGrid?: any }> => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set('category', params.category);
      if (params?.type) qs.set('type', params.type);
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString() ? `?${qs.toString()}` : '';
      return this.request<{ transactions: Transaction[]; agGrid?: any }>(`/api/transactions${query}`);
    },
  };

  public plans = {
    getActive: async (): Promise<{ activePlan: FinancialPlan }> => {
      return this.request<{ activePlan: FinancialPlan }>('/api/plans');
    },
    generate: async (): Promise<{ plan: FinancialPlan }> => {
      return this.request<{ plan: FinancialPlan }>('/api/plans/generate', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
  };

  public goals = {
    list: async (): Promise<{ goals: Goal[] }> => {
      return this.request<{ goals: Goal[] }>('/api/goals');
    },
  };

  public mandates = {
    list: async (): Promise<{ mandates: Mandate[]; confirmedMonthlyOutflow: number }> => {
      return this.request<{ mandates: Mandate[]; confirmedMonthlyOutflow: number }>('/api/mandates');
    },
    create: async (data: { title: string; merchant: string; category: string; amount: number; dueDayOfMonth: number }): Promise<{ mandate: Mandate }> => {
      return this.request<{ mandate: Mandate }>('/api/mandates', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  };

  public ecommerce = {
    listProducts: async (search?: string): Promise<{ products: EcommerceProduct[] }> => {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      return this.request<{ products: EcommerceProduct[] }>(`/api/ecommerce/products${q}`);
    },
    listOrders: async (): Promise<{ orders: EcommerceOrder[] }> => {
      return this.request<{ orders: EcommerceOrder[] }>('/api/ecommerce/orders');
    },
  };

  public merchant = {
    getOverview: async (): Promise<{ success: boolean; overview: any }> => {
      return this.request<{ success: boolean; overview: any }>('/api/ecommerce/merchant/overview');
    },
    listOrders: async (): Promise<{ success: boolean; orders: EcommerceOrder[] }> => {
      return this.request<{ success: boolean; orders: EcommerceOrder[] }>('/api/ecommerce/merchant/orders');
    },
    updateFulfillment: async (orderId: string, data: { fulfillmentStatus: string; carrier?: string; trackingNumber?: string; notes?: string }): Promise<any> => {
      return this.request(`/api/ecommerce/merchant/orders/${orderId}/fulfillment`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    getReceivedPayments: async (): Promise<any> => {
      return this.request('/api/ecommerce/merchant/received-payments');
    },
  };

  public grid = {
    getViews: async (gridId: string): Promise<{ success: boolean; views: GridSavedView[] }> => {
      return this.request<{ success: boolean; views: GridSavedView[] }>(`/api/grid/views?gridId=${encodeURIComponent(gridId)}`);
    },
    saveView: async (view: GridSavedView): Promise<{ success: boolean; view: GridSavedView }> => {
      return this.request<{ success: boolean; view: GridSavedView }>('/api/grid/views', {
        method: 'POST',
        body: JSON.stringify(view),
      });
    },
    deleteView: async (id: string): Promise<{ success: boolean }> => {
      return this.request<{ success: boolean }>(`/api/grid/views/${id}`, {
        method: 'DELETE',
      });
    },
    resolveSelectionContext: async (
      source: 'transactions' | 'orders' | 'commitments' | 'goals' | 'budget',
      gridId: string,
      selectedIds: string[]
    ): Promise<{ success: boolean; context: SanitizedSelectionResult }> => {
      return this.request<{ success: boolean; context: SanitizedSelectionResult }>('/api/grid/selection-context', {
        method: 'POST',
        body: JSON.stringify({ source, gridId, selectedIds, selectionMode: 'explicit' }),
      });
    },
  };

  public ai = {
    ask: async (prompt: string, options: { conversationId?: string; gridSelectionContext?: GridSelectionContext } = {}): Promise<AiAskResponse> => {
      return this.request<AiAskResponse>('/api/ai/ask', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          conversationId: options.conversationId,
          gridSelectionContext: options.gridSelectionContext,
        }),
      });
    },
    analyseSelection: async (
      source: 'transactions' | 'orders' | 'commitments' | 'goals' | 'budget',
      gridId: string,
      selectedIds: string[],
      question?: string
    ): Promise<AiAskResponse> => {
      return this.request<AiAskResponse>('/api/ai/ask', {
        method: 'POST',
        body: JSON.stringify({
          prompt: question || 'Please provide a comprehensive financial breakdown of these selected records.',
          gridSelectionContext: {
            source,
            gridId,
            selectedIds,
            selectionMode: 'explicit',
          },
        }),
      });
    },
  };
}
