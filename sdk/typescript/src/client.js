"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuraClient = void 0;
const errors_1 = require("./errors");
class AuraClient {
    baseUrl;
    token;
    apiKey;
    maxRetries;
    retryDelayMs;
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || 'http://localhost:5000').replace(/\/$/, '');
        this.token = options.token;
        this.apiKey = options.apiKey;
        this.maxRetries = options.maxRetries ?? 2;
        this.retryDelayMs = options.retryDelayMs ?? 400;
    }
    setToken(token) {
        this.token = token;
    }
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }
    async request(path, options = {}) {
        const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...options.headers,
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
                    throw new errors_1.AuraAuthenticationError('Authentication required or token expired');
                }
                if (response.status === 403) {
                    const body = await response.json().catch(() => ({}));
                    throw new errors_1.AuraAuthorizationError(body.error || 'Access denied for current credentials', body);
                }
                if (response.status === 404) {
                    throw new errors_1.AuraNotFoundError(`Resource at ${path} not found`);
                }
                if (response.status === 429) {
                    throw new errors_1.AuraRateLimitError('Rate limit exceeded; backoff recommended');
                }
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new errors_1.AuraError(data.error || `HTTP ${response.status}`, response.status, data.code, data);
                }
                return data;
            }
            catch (err) {
                attempt++;
                const isTransient = err instanceof errors_1.AuraRateLimitError || (err.statusCode && err.statusCode >= 500) || err.name === 'FetchError';
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
    auth = {
        demoLogin: async (persona) => {
            const res = await this.request('/api/auth/demo-login', {
                method: 'POST',
                body: JSON.stringify({ persona }),
            });
            if (res.token) {
                this.setToken(res.token);
            }
            return res;
        },
        login: async (email, password) => {
            const res = await this.request('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });
            if (res.token) {
                this.setToken(res.token);
            }
            return res;
        },
        getSession: async () => {
            return this.request('/api/auth/session');
        },
    };
    accounts = {
        list: async () => {
            return this.request('/api/accounts');
        },
    };
    transactions = {
        list: async (params) => {
            const qs = new URLSearchParams();
            if (params?.category)
                qs.set('category', params.category);
            if (params?.type)
                qs.set('type', params.type);
            if (params?.limit)
                qs.set('limit', String(params.limit));
            const query = qs.toString() ? `?${qs.toString()}` : '';
            return this.request(`/api/transactions${query}`);
        },
    };
    plans = {
        getActive: async () => {
            return this.request('/api/plans');
        },
        generate: async () => {
            return this.request('/api/plans/generate', {
                method: 'POST',
                body: JSON.stringify({}),
            });
        },
    };
    goals = {
        list: async () => {
            return this.request('/api/goals');
        },
    };
    mandates = {
        list: async () => {
            return this.request('/api/mandates');
        },
        create: async (data) => {
            return this.request('/api/mandates', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        },
    };
    ecommerce = {
        listProducts: async (search) => {
            const q = search ? `?search=${encodeURIComponent(search)}` : '';
            return this.request(`/api/ecommerce/products${q}`);
        },
        listOrders: async () => {
            return this.request('/api/ecommerce/orders');
        },
    };
    merchant = {
        getOverview: async () => {
            return this.request('/api/ecommerce/merchant/overview');
        },
        listOrders: async () => {
            return this.request('/api/ecommerce/merchant/orders');
        },
        updateFulfillment: async (orderId, data) => {
            return this.request(`/api/ecommerce/merchant/orders/${orderId}/fulfillment`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        },
        getReceivedPayments: async () => {
            return this.request('/api/ecommerce/merchant/received-payments');
        },
    };
    grid = {
        getViews: async (gridId) => {
            return this.request(`/api/grid/views?gridId=${encodeURIComponent(gridId)}`);
        },
        saveView: async (view) => {
            return this.request('/api/grid/views', {
                method: 'POST',
                body: JSON.stringify(view),
            });
        },
        deleteView: async (id) => {
            return this.request(`/api/grid/views/${id}`, {
                method: 'DELETE',
            });
        },
        resolveSelectionContext: async (source, gridId, selectedIds) => {
            return this.request('/api/grid/selection-context', {
                method: 'POST',
                body: JSON.stringify({ source, gridId, selectedIds, selectionMode: 'explicit' }),
            });
        },
    };
    ai = {
        ask: async (prompt, options = {}) => {
            return this.request('/api/ai/ask', {
                method: 'POST',
                body: JSON.stringify({
                    prompt,
                    conversationId: options.conversationId,
                    gridSelectionContext: options.gridSelectionContext,
                }),
            });
        },
        analyseSelection: async (source, gridId, selectedIds, question) => {
            return this.request('/api/ai/ask', {
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
exports.AuraClient = AuraClient;
//# sourceMappingURL=client.js.map