import React, { useEffect, useState } from 'react';
import {
  Wallet,
  Plus,
  Upload,
  CheckCircle2,
  Building2,
  RefreshCw,
  CreditCard,
  ShieldCheck,
  FileSpreadsheet,
  ArrowUpRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

const SAMPLE_CSV = `date,merchant,description,category,type,amount,paymentMethod,isRecurring
2026-11-01,FreshMart Organic,Weekly Organic Groceries,Groceries,expense,2450,upi,false
2026-11-02,Apollo Pharmacy,Monthly Family Vitamins & Health,Healthcare,expense,1180,card,true
2026-11-03,Luxury Watch Boutique,Impulse Designer Watch Purchase,Shopping,expense,14500,card,false`;

export const MyMoneyPage: React.FC = () => {
  const { balancesVisible, toggleBalancesVisible } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Add account modal / state
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState('checking');
  const [balance, setBalance] = useState('');
  const [isShared, setIsShared] = useState(false);

  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvContent, setCsvContent] = useState(SAMPLE_CSV);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/accounts');
      setAccounts(res.accounts || []);
      setTotalBalance(res.totalBalance || 0);
      if (res.accounts?.length > 0 && !selectedAccountId) {
        setSelectedAccountId(res.accounts[0]._id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !institution) return;
    await apiRequest('/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name,
        institution,
        type,
        balance: Number(balance || 0),
        isSharedWithFamily: isShared,
      }),
    });
    setName('');
    setInstitution('');
    setBalance('');
    setShowAddModal(false);
    await loadAccounts();
  };

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setImportResult(null);
    try {
      const res = await apiRequest('/transactions/import-csv', {
        method: 'POST',
        body: JSON.stringify({
          accountId: selectedAccountId || undefined,
          csvContent,
        }),
      });
      setImportResult(res);
      await loadAccounts();
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (typeof evt.target?.result === 'string') {
        setCsvContent(evt.target.result);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header & Combined Balance */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-navy-900 dark:text-white tracking-tight">Connected Accounts &amp; Liquidity</h2>
            <Tooltip content="Your aggregated checking, high-yield savings, and digital wallet repositories." />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Maintain bank linkages, statement imports, and privacy-shielded liquidity cushions.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-blue-50 dark:bg-blue-950/60 px-5 py-3 rounded-2xl border border-blue-100 dark:border-blue-900/60 text-right transition-colors">
            <div className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold uppercase flex items-center gap-1 justify-end">
              Combined Liquidity
              <Tooltip content="Sum of all active non-credit balances available for discretionary spending and commitments." />
            </div>
            <div className="text-2xl font-bold text-navy-900 dark:text-white">
              {formatInr(totalBalance, !balancesVisible)}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Account
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              Import Statement
            </button>
          </div>
        </div>
      </div>

      {/* Account Cards Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" /> Loading account portfolios...
        </div>
      ) : accounts.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
          <Wallet className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto" />
          <h3 className="text-sm font-bold text-navy-900 dark:text-white">No Financial Accounts Connected Yet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Add a checking, savings, or digital wallet account to track balances and settle transactions.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Your First Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <div
              key={acc._id}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800">
                    {acc.type}
                  </span>
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{acc.accountNumberMasked}</span>
                </div>
                <h3 className="text-base font-bold text-navy-900 dark:text-white">{acc.name}</h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  {acc.institution}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-end justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">Available Balance</span>
                  <div className="text-xl font-bold text-navy-900 dark:text-white mt-0.5">
                    {formatInr(acc.balance, !balancesVisible)}
                  </div>
                </div>
                {acc.isSharedWithFamily && (
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    Shared with Family
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800 transition-colors">
            <h3 className="text-base font-bold text-navy-900 dark:text-white mb-1">Link New Financial Account</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Add a verified bank, high-yield savings, or digital wallet.</p>

            <form onSubmit={handleAddAccount} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Account Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Axis Prime Salary Checking"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Institution</label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Axis Bank"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Account Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="wallet">Digital Wallet</option>
                    <option value="investment">Investment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Initial Balance (USD)</label>
                  <input
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    placeholder="5000"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="modalIsShared"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-800"
                />
                <label htmlFor="modalIsShared" className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                  Share summary balance with household members
                </label>
              </div>

              <div className="flex gap-2.5 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-navy-900 dark:text-white">Import Bank Statement (CSV)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Upload or paste CSV transactions. Triggers automated anomaly screening &amp; mandate detection.
                </p>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {importResult && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 font-medium space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Import Pipeline Complete
                </div>
                <div>Imported {importResult.importedCount} transactions.</div>
                <div>Render Worker: {importResult.renderWorkerAnalysis?.status || 'Active'}.</div>
              </div>
            )}

            <form onSubmit={handleCsvImport} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Account</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} ({a.institution})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">CSV Statement Data</label>
                  <label className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" />
                    Upload File
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                <textarea
                  rows={5}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  className="w-full p-3 font-mono text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {importing ? 'Processing Statement...' : 'Import Statement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
