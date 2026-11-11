import React, { useState, useEffect } from 'react';
import {
  Code2,
  Terminal,
  BookOpen,
  Sparkles,
  Play,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Key,
  Database,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

type PortalTab = 'overview' | 'reference' | 'sdks' | 'playground' | 'guides' | 'security';

interface EndpointDoc {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  tag: string;
  summary: string;
  auth: 'Bearer' | 'ApiKey' | 'Public';
  description: string;
  requestBody?: any;
  responseSample: any;
}

const ENDPOINTS: EndpointDoc[] = [
  {
    method: 'POST',
    path: '/api/auth/demo-login',
    tag: 'Authentication',
    summary: 'Instant login into seeded demo personas',
    auth: 'Public',
    description: 'Authenticates as one of the pre-configured sandbox personas: alex (Personal), priya (Family Admin), maya (Shopper), or bruce (Verified Merchant).',
    requestBody: { persona: 'alex' },
    responseSample: {
      success: true,
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      user: {
        id: 'usr_alex_001',
        email: 'alex@example.com',
        name: 'Alex Morgan',
        auraAccountType: 'PERSONAL',
        merchantAccessEnabled: false,
      },
    },
  },
  {
    method: 'GET',
    path: '/api/accounts',
    tag: 'Accounts',
    summary: 'List all linked financial accounts',
    auth: 'Bearer',
    description: 'Retrieves connected bank accounts, liquid balances, and synchronization timestamps for the authenticated user.',
    responseSample: {
      accounts: [
        { id: 'acc_01', name: 'Chase Premier Checking', type: 'checking', balance: 4520.5, currency: 'USD' },
        { id: 'acc_02', name: 'Marcus High-Yield Savings', type: 'savings', balance: 14200.0, currency: 'USD' },
      ],
      totalBalance: 18720.5,
    },
  },
  {
    method: 'GET',
    path: '/api/transactions',
    tag: 'Transactions',
    summary: 'Retrieve transactions formatted for AG Grid',
    auth: 'Bearer',
    description: 'Returns historical financial transactions with AG Grid community row data schema and category summaries.',
    responseSample: {
      transactions: [
        { id: 'tx_01', date: '2026-11-05', merchant: 'Amazon Prime', amount: 129.99, type: 'expense', category: 'Shopping' },
        { id: 'tx_02', date: '2026-11-04', merchant: 'Whole Foods Market', amount: 84.2, type: 'expense', category: 'Groceries' },
      ],
      agGrid: { totalCount: 48 },
    },
  },
  {
    method: 'GET',
    path: '/api/plans',
    tag: 'Financial Planning',
    summary: 'Get active financial plan and budget allocations',
    auth: 'Bearer',
    description: 'Returns active monthly cashflow plan, essential living allowances, discretionary buffers, and savings target milestones.',
    responseSample: {
      activePlan: {
        id: 'plan_nov_2026',
        title: 'November 2026 Cashflow Plan',
        totalCommitments: 1250.0,
        totalEssentialBudget: 800.0,
        totalDiscretionaryBudget: 550.0,
        totalSavingsTarget: 700.0,
        aiSummary: 'Discretionary buffer healthy. Pacing well within monthly target.',
      },
    },
  },
  {
    method: 'GET',
    path: '/api/mandates',
    tag: 'Commitments',
    summary: 'List recurring bills, subscriptions, and mandates',
    auth: 'Bearer',
    description: 'Retrieves all detected and confirmed recurring outflow commitments with due days of month.',
    responseSample: {
      mandates: [
        { id: 'man_01', title: 'Home Internet Fiber', merchant: 'Verizon Fios', amount: 79.99, dueDayOfMonth: 10, status: 'confirmed' },
        { id: 'man_02', title: 'Netflix Premium 4K', merchant: 'Netflix', amount: 22.99, dueDayOfMonth: 14, status: 'confirmed' },
      ],
      confirmedMonthlyOutflow: 840.5,
    },
  },
  {
    method: 'GET',
    path: '/api/grid/views?gridId=transactions-grid',
    tag: 'AG Grid Workspace',
    summary: 'Get saved AG Grid views for a grid table',
    auth: 'Bearer',
    description: 'Retrieves user-saved table views including filter models, sort models, and column visibility.',
    responseSample: {
      success: true,
      views: [
        {
          id: 'view_01',
          gridId: 'transactions-grid',
          name: 'Expenses Over $100',
          filterModel: { amount: { filterType: 'number', type: 'greaterThan', filter: 100 } },
          sortModel: [{ colId: 'amount', sort: 'desc' }],
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/api/grid/selection-context',
    tag: 'AG Grid Workspace',
    summary: 'Resolve authoritative ground-truth context for selected row IDs',
    auth: 'Bearer',
    description: 'Validates record ownership, filters client-sent data, and calculates verified statistical summaries for AI analysis without hallucination.',
    requestBody: {
      source: 'transactions',
      gridId: 'transactions-grid',
      selectedIds: ['tx_01', 'tx_02'],
      selectionMode: 'explicit',
    },
    responseSample: {
      success: true,
      context: {
        source: 'transactions',
        gridId: 'transactions-grid',
        totalSelected: 2,
        summary: {
          totalAmount: 214.19,
          currency: 'USD',
          itemCount: 2,
          averageAmount: 107.09,
        },
        records: [
          { id: 'tx_01', merchant: 'Amazon Prime', amount: 129.99, category: 'Shopping' },
          { id: 'tx_02', merchant: 'Whole Foods Market', amount: 84.2, category: 'Groceries' },
        ],
      },
    },
  },
  {
    method: 'POST',
    path: '/api/ai/ask',
    tag: 'Ask AURA AI',
    summary: 'Submit prompt to Ask AURA with attached grid selection',
    auth: 'Bearer',
    description: 'Dispatches natural-language instructions to AURA AI orchestrator, executing financial tools, navigation, or AG Grid operations.',
    requestBody: {
      prompt: 'What is the total and primary category of these selected expenses?',
      gridSelectionContext: {
        source: 'transactions',
        gridId: 'transactions-grid',
        selectedIds: ['tx_01', 'tx_02'],
      },
    },
    responseSample: {
      success: true,
      response: 'The 2 selected expenses total $214.19 across Shopping and Groceries.',
      executedAction: {
        name: 'grid_analyse_selection',
        gridId: 'transactions-grid',
      },
    },
  },
  {
    method: 'GET',
    path: '/api/ecommerce/merchant/overview',
    tag: 'Merchant Hub',
    summary: 'Get merchant operations metrics (PayPal Business Only)',
    auth: 'Bearer',
    description: 'Returns store order metrics, revenue, and fulfillment pipeline status. Strictly forbidden for Personal accounts (HTTP 403).',
    responseSample: {
      success: true,
      overview: {
        totalOrders: 28,
        totalRevenue: 4890.0,
        pendingFulfillment: 5,
        deliveredOrders: 23,
      },
    },
  },
];

export const DeveloperPortalPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Playground state
  const [selectedEndpointIndex, setSelectedEndpointIndex] = useState(0);
  const [playgroundPersona, setPlaygroundPersona] = useState<'alex' | 'bruce' | 'unauth'>('alex');
  const [playgroundBody, setPlaygroundBody] = useState('');
  const [playgroundExecuting, setPlaygroundExecuting] = useState(false);
  const [playgroundResponse, setPlaygroundResponse] = useState<any>(null);
  const [playgroundStatus, setPlaygroundStatus] = useState<number | null>(null);
  const [playgroundLatency, setPlaygroundLatency] = useState<number | null>(null);

  const selectedEndpoint = ENDPOINTS[selectedEndpointIndex];

  useEffect(() => {
    if (selectedEndpoint.requestBody) {
      setPlaygroundBody(JSON.stringify(selectedEndpoint.requestBody, null, 2));
    } else {
      setPlaygroundBody('');
    }
  }, [selectedEndpointIndex]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleExecutePlayground = async () => {
    setPlaygroundExecuting(true);
    setPlaygroundResponse(null);
    setPlaygroundStatus(null);
    const start = performance.now();

    try {
      let token = '';
      if (playgroundPersona !== 'unauth') {
        const authRes = await apiRequest<{ token: string }>('/auth/demo-login', {
          method: 'POST',
          body: JSON.stringify({ persona: playgroundPersona }),
        });
        token = authRes.token;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const options: RequestInit = {
        method: selectedEndpoint.method,
        headers,
      };

      if (['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && playgroundBody.trim()) {
        options.body = playgroundBody;
      }

      const rawPath = selectedEndpoint.path.replace(/^\/api/, '');
      const resp = await fetch(`http://localhost:5000/api${rawPath}`, options);
      const latency = Math.round(performance.now() - start);
      setPlaygroundLatency(latency);
      setPlaygroundStatus(resp.status);

      const data = await resp.json().catch(() => ({ statusText: resp.statusText }));
      setPlaygroundResponse(data);
    } catch (err: any) {
      setPlaygroundLatency(Math.round(performance.now() - start));
      setPlaygroundStatus(500);
      setPlaygroundResponse({ error: err.message });
    } finally {
      setPlaygroundExecuting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-navy-950 via-slate-900 to-navy-900 rounded-3xl p-8 lg:p-10 border border-slate-800 shadow-xl text-white relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            APIMatic Developer Platform • OpenAPI 3.0.3 Validated
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            AURA Developer Platform &amp; API Workspace
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Programmatic financial intelligence, natural-language AG Grid workflows, authoritative selection analysis, and verified PayPal merchant operations.
          </p>

          <div className="pt-2 flex flex-wrap gap-4 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Spec: OpenAPI 3.0.3</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Native SDKs: TypeScript + Python</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Contract Validator: APIMatic Orders v2</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'overview', label: 'Getting Started', icon: BookOpen },
          { id: 'reference', label: 'API Reference', icon: Code2 },
          { id: 'sdks', label: 'SDKs & Libraries', icon: Terminal },
          { id: 'playground', label: 'Interactive Playground', icon: Play },
          { id: 'guides', label: 'Integration Guides', icon: Layers },
          { id: 'security', label: 'Security & Contracts', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as PortalTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                active
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Getting Started */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="font-bold text-navy-900 dark:text-white">Authentication</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Obtain a Bearer JWT token via <code className="text-blue-600">/api/auth/login</code> or <code className="text-blue-600">/api/auth/demo-login</code>. Alternatively use your <code className="text-blue-600">X-AURA-API-KEY</code> header.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold">
                2
              </div>
              <h3 className="font-bold text-navy-900 dark:text-white">AG Grid Selection Sync</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Connect your frontend AG Grid table rows directly to Ask AURA using <code className="text-blue-600">POST /api/grid/selection-context</code> for verified statistical analysis.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center font-bold">
                3
              </div>
              <h3 className="font-bold text-navy-900 dark:text-white">Verified Merchant Hub</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Access PayPal merchant fulfillment, order tracking, and received payments. Protected by strict server-side entitlement checks.
              </p>
            </div>
          </div>

          {/* Quick cURL Example */}
          <div className="bg-slate-950 rounded-3xl p-6 border border-slate-800 text-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-400">Quick Start: Authenticate &amp; Fetch Transactions</span>
              <button
                onClick={() =>
                  copyToClipboard(
                    `# 1. Login as Alex\nTOKEN=$(curl -s -X POST http://localhost:5000/api/auth/demo-login \\\n  -H "Content-Type: application/json" \\\n  -d '{"persona":"alex"}' | jq -r .token)\n\n# 2. Fetch Transactions\ncurl -s http://localhost:5000/api/transactions \\\n  -H "Authorization: Bearer $TOKEN"`,
                    'curl_qs'
                  )
                }
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                {copiedKey === 'curl_qs' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'curl_qs' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="text-xs font-mono text-emerald-400 overflow-x-auto p-2 rounded-xl bg-black/40">
{`# 1. Login as Alex (Demo Persona)
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/demo-login \\
  -H "Content-Type: application/json" \\
  -d '{"persona":"alex"}' | jq -r .token)

# 2. Fetch Transactions with AG Grid Row Format
curl -s http://localhost:5000/api/transactions \\
  -H "Authorization: Bearer $TOKEN"`}
            </pre>
          </div>
        </div>
      )}

      {/* Tab: API Reference */}
      {activeTab === 'reference' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {ENDPOINTS.map((ep, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition hover:border-blue-500/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                        ep.method === 'GET'
                          ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                          : ep.method === 'POST'
                          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="font-mono text-xs font-bold text-navy-900 dark:text-white truncate">
                      {ep.path}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {ep.tag}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {ep.description}
                </p>

                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Example Response</span>
                  <pre className="text-[11px] font-mono p-3 rounded-2xl bg-slate-950 text-slate-300 overflow-x-auto max-h-44">
                    {JSON.stringify(ep.responseSample, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: SDKs & Libraries */}
      {activeTab === 'sdks' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* TypeScript SDK */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                    TS
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-900 dark:text-white">TypeScript SDK</h3>
                    <p className="text-xs text-slate-400">sdk/typescript/</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 border border-blue-200 dark:border-blue-800">
                  v1.0.0 Ready
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs">
                npm install ./sdk/typescript
              </div>

              <pre className="text-xs font-mono p-4 rounded-2xl bg-slate-950 text-slate-300 overflow-x-auto">
{`import { AuraClient } from '@aura/sdk';

const client = new AuraClient({ baseUrl: 'http://localhost:5000' });

// Authenticate
await client.auth.demoLogin('alex');

// Fetch Transactions for AG Grid
const { transactions } = await client.transactions.list();

// Analyze selected rows with Ask AURA
const analysis = await client.ai.analyseSelection(
  'transactions',
  'transactions-grid',
  ['tx_01', 'tx_02'],
  'What is the total spent?'
);
console.log(analysis.response);`}
              </pre>
            </div>

            {/* Python SDK */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                    PY
                  </div>
                  <div>
                    <h3 className="font-bold text-navy-900 dark:text-white">Python SDK</h3>
                    <p className="text-xs text-slate-400">sdk/python/</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 border border-emerald-200 dark:border-emerald-800">
                  v1.0.0 Ready
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs">
                pip install ./sdk/python
              </div>

              <pre className="text-xs font-mono p-4 rounded-2xl bg-slate-950 text-slate-300 overflow-x-auto">
{`from aura_sdk import AuraClient

client = AuraClient(base_url="http://localhost:5000")

# Authenticate
client.demo_login("alex")

# Resolve selection context
context = client.resolve_grid_selection(
    source="transactions",
    grid_id="transactions-grid",
    selected_ids=["tx_01", "tx_02"]
)
print("Total Amount:", context["context"]["summary"]["totalAmount"])

# Ask AURA
reply = client.ask_aura("How can I budget this better?")
print(reply["response"])`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Interactive Playground */}
      {activeTab === 'playground' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-navy-900 dark:text-white">Interactive API Sandbox</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Execute live requests against the local or remote AURA backend with authenticated demo personas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Select API Endpoint
              </label>
              <select
                value={selectedEndpointIndex}
                onChange={(e) => setSelectedEndpointIndex(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                {ENDPOINTS.map((ep, i) => (
                  <option key={i} value={i}>
                    {ep.method} {ep.path} — {ep.summary}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Authenticated Persona
              </label>
              <select
                value={playgroundPersona}
                onChange={(e) => setPlaygroundPersona(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="alex">Alex Morgan (Consumer / Personal Account)</option>
                <option value="bruce">Bruce Wayne (Verified PayPal Business Merchant)</option>
                <option value="unauth">Unauthenticated (Anonymous)</option>
              </select>
            </div>
          </div>

          {['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                JSON Request Body
              </label>
              <textarea
                value={playgroundBody}
                onChange={(e) => setPlaygroundBody(e.target.value)}
                rows={5}
                className="w-full p-3 rounded-2xl font-mono text-xs bg-slate-950 text-slate-200 border border-slate-800 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleExecutePlayground}
              disabled={playgroundExecuting}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition"
            >
              {playgroundExecuting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {playgroundExecuting ? 'Executing Request...' : 'Send API Request'}
            </button>

            {playgroundStatus !== null && (
              <div className="flex items-center gap-2 text-xs font-mono font-semibold">
                <span
                  className={`px-2.5 py-0.5 rounded-full ${
                    playgroundStatus >= 200 && playgroundStatus < 300
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  HTTP {playgroundStatus}
                </span>
                <span className="text-slate-400">{playgroundLatency}ms</span>
              </div>
            )}
          </div>

          {playgroundResponse && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live Response Payload</span>
              <pre className="text-xs font-mono p-4 rounded-2xl bg-slate-950 text-slate-200 overflow-x-auto max-h-96">
                {JSON.stringify(playgroundResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Tab: Integration Guides */}
      {activeTab === 'guides' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center gap-2 font-bold text-navy-900 dark:text-white">
              <Layers className="w-4 h-4 text-blue-600" />
              1. AG Grid Context Resolution Architecture
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              When a user checks rows in AG Grid and clicks "Analyse with AURA", only the record IDs and source name are passed to the server. The backend retrieves the authoritative documents, verifies ownership, computes statistical aggregate summaries, and feeds the ground-truth directly to Gemini without risk of client hallucination.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center gap-2 font-bold text-navy-900 dark:text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              2. APIMatic PayPal Orders v2 Enforcement
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              All PayPal checkout and capture requests are pre-validated by <code className="text-blue-600">ApimaticPayPalContractValidator</code>. This ensures deprecated v1 endpoints are strictly prohibited, idempotency headers are injected, and currency amounts adhere to strict 2-decimal ISO-4217 specifications.
            </p>
          </div>
        </div>
      )}

      {/* Tab: Security & Compliance */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-navy-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              Role-Based Access Control &amp; Data Isolation Policy
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Strict isolation is enforced across personal consumer records and verified business merchant endpoints.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                  <th className="py-2 px-3">Role / Account Condition</th>
                  <th className="py-2 px-3">Consumer Endpoints</th>
                  <th className="py-2 px-3">Merchant Hub Endpoints</th>
                  <th className="py-2 px-3">Enforcement Mechanism</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <td className="py-3 px-3 font-semibold text-navy-900 dark:text-white">Alex Morgan (Consumer)</td>
                  <td className="py-3 px-3 text-emerald-600">Enabled (200 OK)</td>
                  <td className="py-3 px-3 text-rose-600 font-bold">Forbidden (403 Access Denied)</td>
                  <td className="py-3 px-3">Server-side entitlement check</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-navy-900 dark:text-white">Bruce Wayne (PayPal Business)</td>
                  <td className="py-3 px-3 text-emerald-600">Enabled (200 OK)</td>
                  <td className="py-3 px-3 text-emerald-600 font-bold">Authorized (200 OK)</td>
                  <td className="py-3 px-3">Verified merchant access check</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-semibold text-navy-900 dark:text-white">Anonymous / Unauthenticated</td>
                  <td className="py-3 px-3 text-amber-600">401 Unauthorized</td>
                  <td className="py-3 px-3 text-amber-600">401 Unauthorized</td>
                  <td className="py-3 px-3">JWT Bearer verification</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
