import React, { useEffect, useState } from 'react';
import { Wallet, Plus, Upload, CheckCircle2, Building2, RefreshCw } from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';

const SAMPLE_CSV = `date,merchant,description,category,type,amount,paymentMethod,isRecurring
2026-11-01,FreshMart Organic,Weekly Organic Groceries,Groceries,expense,2450,upi,false
2026-11-02,Apollo Pharmacy,Monthly Family Vitamins & Health,Healthcare,expense,1180,card,true
2026-11-03,Luxury Watch Boutique,Impulse Designer Watch Purchase,Shopping,expense,14500,card,false`;

export const MyMoneyPage: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Add account state
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState('checking');
  const [balance, setBalance] = useState('');
  const [isShared, setIsShared] = useState(false);

  // CSV Import state
  const [csvContent, setCsvContent] = useState(SAMPLE_CSV);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  // Manual transaction state
  const [txMerchant, setTxMerchant] = useState('');
  const [txCategory, setTxCategory] = useState('Dining');
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');

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
    await loadAccounts();
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txMerchant || !txAmount) return;
    await apiRequest('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        accountId: selectedAccountId || undefined,
        merchant: txMerchant,
        category: txCategory,
        amount: Number(txAmount),
        type: txType,
      }),
    });
    setTxMerchant('');
    setTxAmount('');
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
      {/* Summary Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-navy-900">My Financial Accounts &amp; Statement Import</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage bank accounts, wallets, manual entries, and automated CSV bank statement pipelines.
          </p>
        </div>
        <div className="bg-blue-50 px-4 py-2.5 rounded-xl border border-blue-100 text-right">
          <div className="text-[11px] text-blue-700 font-semibold uppercase">Combined Account Liquidity</div>
          <div className="text-xl font-bold text-navy-900">{formatInr(totalBalance)}</div>
        </div>
      </div>

      {/* Account Cards */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading accounts...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <div key={acc._id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 uppercase">
                    {acc.type}
                  </span>
                  {acc.isSharedWithFamily && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      Family Shared
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-navy-900 mt-3">{acc.name}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {acc.institution} ({acc.accountNumberMasked})
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-baseline justify-between">
                <span className="text-xs text-slate-500">Available Balance</span>
                <span className="text-xl font-bold text-navy-900">{formatInr(acc.balance)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add Account & Quick Transaction */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2 mb-4">
              <Wallet className="w-4 h-4 text-blue-600" />
              Link or Create Financial Account
            </h3>
            <form onSubmit={handleAddAccount} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Account Name (e.g. SBI Savings)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
                <input
                  type="text"
                  placeholder="Institution (e.g. State Bank of India)"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  required
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  <option value="checking">Checking / Salary Account</option>
                  <option value="savings">High-Yield Savings</option>
                  <option value="wallet">PayPal / Digital Wallet</option>
                  <option value="investment">Investment Portfolio</option>
                </select>
                <input
                  type="number"
                  placeholder="Opening Balance (₹)"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  required
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Include in Family Shared Summary View
              </label>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add Account
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-navy-900 mb-4">Record Instant Income or Expense</h3>
            <form onSubmit={handleAddTransaction} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Merchant / Description"
                  value={txMerchant}
                  onChange={(e) => setTxMerchant(e.target.value)}
                  required
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  <option value="Dining">Dining</option>
                  <option value="Groceries">Groceries</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Travel">Travel</option>
                  <option value="Electricity">Electricity</option>
                  <option value="Internet">Internet</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Salary">Salary / Income</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as any)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  <option value="expense">Expense (-)</option>
                  <option value="income">Income (+)</option>
                </select>
                <input
                  type="number"
                  placeholder="Amount in ₹"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  required
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                Save Transaction &amp; Sync to Elastic
              </button>
            </form>
          </div>
        </div>

        {/* CSV Import Pipeline */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-600" />
                CSV Bank Statement Import Pipeline
              </h3>
              <label className="text-xs text-blue-600 hover:underline cursor-pointer font-medium">
                Upload .CSV File
                <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Automatically validates records, updates MongoDB, triggers Python anomaly detection, detects recurring mandates, and synchronises with Elastic Financial Memory.
            </p>

            <form onSubmit={handleCsvImport} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Account</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name} ({formatInr(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">CSV Statement Rows</label>
                <textarea
                  rows={6}
                  value={csvContent}
                  onChange={(e) => setCsvContent(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={importing}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
              >
                {importing ? 'Running Import & Analytics Pipeline...' : 'Import CSV & Run Background Analysis'}
              </button>
            </form>
          </div>

          {importResult && (
            <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                CSV Pipeline Completed Successfully
              </div>
              <div>• Imported Transactions: <strong>{importResult.importedCount}</strong></div>
              <div>• Unusual Spend Flagged: <strong>{importResult.unusualDetectedCount}</strong></div>
              <div>• Recurring Mandates Inferred: <strong>{importResult.inferredMandatesCount}</strong></div>
              <div>• Background Worker Status: <strong>{importResult.backgroundWorkerPipeline?.status}</strong></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
