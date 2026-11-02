import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Sliders,
  CheckCircle2,
  AlertCircle,
  User,
  LogOut,
  Save,
  Briefcase,
  Calendar,
  DollarSign,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatInr } from '../lib/api';
import { Tooltip } from '../components/Tooltip';

export const SettingsPage: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();

  // Profile fields
  const [name, setName] = useState('');
  const [riskTolerance, setRiskTolerance] = useState<'conservative' | 'balanced' | 'growth'>('balanced');

  // Financial Profile fields (Section 11)
  const [monthlyIncome, setMonthlyIncome] = useState('95000');
  const [incomeType, setIncomeType] = useState<'salary' | 'freelance' | 'business' | 'pension' | 'other'>('salary');
  const [incomeFrequency, setIncomeFrequency] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');
  const [expectedIncomeDate, setExpectedIncomeDate] = useState('1');
  const [additionalIncome, setAdditionalIncome] = useState('0');
  const [incomeStatus, setIncomeStatus] = useState<'user_estimate' | 'imported_record' | 'verified'>('user_estimate');
  const [preferredCurrency, setPreferredCurrency] = useState('INR');

  // Policy limits
  const [singleLimit, setSingleLimit] = useState('75000');
  const [dailyLimit, setDailyLimit] = useState('100000');
  const [discretionaryCap, setDiscretionaryCap] = useState('18000');
  const [pinThreshold, setPinThreshold] = useState('1000');
  const [allowFamilySharedView, setAllowFamilySharedView] = useState(true);

  // PIN rotation
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [rotatingPin, setRotatingPin] = useState(false);

  // Load user data and financial profile
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setRiskTolerance(user.spendingPreferences?.riskTolerance || 'balanced');
      setSingleLimit(String(user.financialPolicy?.singleTransactionLimit || '75000'));
      setDailyLimit(String(user.financialPolicy?.dailySpendingLimit || '100000'));
      setDiscretionaryCap(String(user.financialPolicy?.discretionaryMonthlyCap || '18000'));
      setPinThreshold(String(user.financialPolicy?.requirePinAboveAmount || '1000'));
      setAllowFamilySharedView(user.financialPolicy?.allowFamilySharedView !== false);
    }

    const loadFinancialProfile = async () => {
      try {
        const res = await apiRequest('/user/financial-profile');
        if (res.profile) {
          setMonthlyIncome(String(res.profile.monthlyIncome || '95000'));
          setIncomeType(res.profile.incomeType || 'salary');
          setIncomeFrequency(res.profile.incomeFrequency || 'monthly');
          setExpectedIncomeDate(String(res.profile.expectedIncomeDate || '1'));
          setAdditionalIncome(String(res.profile.additionalIncome || '0'));
          setIncomeStatus(res.profile.incomeStatus || 'user_estimate');
          setPreferredCurrency(res.profile.preferredCurrency || 'INR');
        }
      } catch {
        // Fallback to user.monthlyIncome
        if (user?.monthlyIncome) setMonthlyIncome(String(user.monthlyIncome));
      }
    };

    loadFinancialProfile();
  }, [user]);

  const handleSaveFinancialProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setSavingProfile(true);
    try {
      // 1. Update personal identity
      await apiRequest('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          monthlyIncome: Number(monthlyIncome),
          spendingPreferences: {
            ...user?.spendingPreferences,
            riskTolerance,
          },
        }),
      });

      // 2. Update comprehensive financial profile
      await apiRequest('/user/financial-profile', {
        method: 'PUT',
        body: JSON.stringify({
          monthlyIncome: Number(monthlyIncome),
          incomeType,
          incomeFrequency,
          expectedIncomeDate: Number(expectedIncomeDate),
          additionalIncome: Number(additionalIncome),
          incomeStatus,
          preferredCurrency,
        }),
      });

      await refreshUser();
      setMsg('Financial profile updated successfully. Future financial plans have been recalibrated.');
    } catch (error: any) {
      setErr(error?.message || 'Failed to update financial profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setSavingPolicy(true);
    try {
      await apiRequest('/profile/policy', {
        method: 'PUT',
        body: JSON.stringify({
          singleTransactionLimit: Number(singleLimit),
          dailySpendingLimit: Number(dailyLimit),
          discretionaryMonthlyCap: Number(discretionaryCap),
          requirePinAboveAmount: Number(pinThreshold),
          allowFamilySharedView,
        }),
      });
      await refreshUser();
      setMsg('Financial Guardian policies updated. All payment workflows will enforce these caps.');
    } catch (error: any) {
      setErr(error?.message || 'Failed to update financial policies');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleRotatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setRotatingPin(true);
    try {
      const res = await apiRequest('/profile/pin', {
        method: 'PUT',
        body: JSON.stringify({ currentPin, newPin }),
      });
      setCurrentPin('');
      setNewPin('');
      setMsg(res.message || 'Security PIN rotated successfully.');
      await refreshUser();
    } catch (error: any) {
      setErr(error?.message || 'Failed to rotate PIN');
    } finally {
      setRotatingPin(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 tracking-tight">Account &amp; Financial Settings</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage your financial profile, Financial Guardian spending rules, and payment security PIN.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-center">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Server-Enforced Guardian
        </span>
      </div>

      {msg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-900 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {msg}
        </div>
      )}

      {err && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-800 font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          {err}
        </div>
      )}

      {/* 1. Financial Profile & Baseline Income (Section 11) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-900">Financial Profile</h3>
              <p className="text-xs text-slate-500">Income source parameters and estimation levels</p>
            </div>
          </div>

          {/* Income Source Distinction Badge */}
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-auto ${
              incomeStatus === 'verified'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : incomeStatus === 'imported_record'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            {incomeStatus === 'verified'
              ? 'Verified Income Source'
              : incomeStatus === 'imported_record'
              ? 'Imported Financial Record'
              : 'User-Entered Estimate'}
          </span>
        </div>

        <form onSubmit={handleSaveFinancialProfile} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                Primary Monthly Income (INR)
                <Tooltip content="Baseline amount used to calculate 50/30/20 budget allocations and affordability" />
              </label>
              <input
                type="number"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-navy-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Income Type</label>
              <select
                value={incomeType}
                onChange={(e) => setIncomeType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="salary">Salaried Employment</option>
                <option value="freelance">Freelance / Consulting</option>
                <option value="business">Business / Self-Employed</option>
                <option value="pension">Pension / Annuity</option>
                <option value="other">Other / Mixed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Income Frequency</label>
              <select
                value={incomeFrequency}
                onChange={(e) => setIncomeFrequency(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Bi-Weekly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Expected Income Date (Day of Month)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={expectedIncomeDate}
                onChange={(e) => setExpectedIncomeDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Additional / Variable Monthly Income (INR)
              </label>
              <input
                type="number"
                value={additionalIncome}
                onChange={(e) => setAdditionalIncome(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Currency</label>
              <select
                value={preferredCurrency}
                onChange={(e) => setPreferredCurrency(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="INR">INR (₹) — Indian Rupee</option>
                <option value="USD">USD ($) — US Dollar</option>
                <option value="EUR">EUR (€) — Euro</option>
                <option value="GBP">GBP (£) — British Pound</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-start gap-2.5 text-xs text-slate-600">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Updating your monthly income recalibrates future financial projections and savings recommendations.
              Historical transaction statements remain immutable and unmodified.
            </span>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {savingProfile ? 'Saving...' : 'Save Financial Profile'}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Financial Guardian Policy Boundaries */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-900">Financial Guardian Spending Safeguards</h3>
              <p className="text-xs text-slate-500">Autonomous protection rules that prevent unauthorized outflows</p>
            </div>
          </div>
          <Tooltip content="Rules enforced deterministically before any payment can be prepared or executed." />
        </div>

        <form onSubmit={handleSavePolicy} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                Single Transaction Limit (INR)
                <Tooltip content="Maximum amount allowed for an individual transaction." />
              </label>
              <input
                type="number"
                value={singleLimit}
                onChange={(e) => setSingleLimit(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                Daily Spending Cap (INR)
                <Tooltip content="Total cumulative outflow allowed in a 24-hour day." />
              </label>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                Discretionary Monthly Budget Cap (INR)
                <Tooltip content="Maximum allowance for dining, entertainment, and non-essential shopping." />
              </label>
              <input
                type="number"
                value={discretionaryCap}
                onChange={(e) => setDiscretionaryCap(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                Require PIN Verification Above (INR)
                <Tooltip content="Transactions exceeding this threshold require explicit Argon2id PIN verification." />
              </label>
              <input
                type="number"
                value={pinThreshold}
                onChange={(e) => setPinThreshold(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="familyShared"
              checked={allowFamilySharedView}
              onChange={(e) => setAllowFamilySharedView(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="familyShared" className="text-xs font-medium text-slate-700">
              Share aggregate budget health with family members (Personal account balances stay private)
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingPolicy}
              className="px-5 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs sm:text-sm font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {savingPolicy ? 'Updating...' : 'Save Guardian Policies'}
            </button>
          </div>
        </form>
      </div>

      {/* 3. Payment Security PIN Management (Argon2id) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-navy-900">Payment Security PIN</h3>
            <p className="text-xs text-slate-500">
              Protected with Argon2id cryptographic hashing. Required to authorize payments.
            </p>
          </div>
        </div>

        <form onSubmit={handleRotatePin} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Current PIN</label>
              <input
                type="password"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                placeholder="4 to 6 digits"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New PIN</label>
              <input
                type="password"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="4 to 6 digits"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={rotatingPin}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition"
            >
              {rotatingPin ? 'Rotating...' : 'Rotate Security PIN'}
            </button>
          </div>
        </form>
      </div>

      {/* 4. Session Sign Out Card (Prominent & Clear) */}
      <div className="bg-rose-50/60 rounded-3xl p-6 border border-rose-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h4 className="text-base font-bold text-rose-950">Sign Out of AURA</h4>
          <p className="text-xs text-rose-700 mt-0.5">
            End your authenticated session. Your financial records and security policies will remain securely stored.
          </p>
        </div>

        <button
          onClick={logout}
          className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-xs transition flex items-center justify-center gap-2 self-start sm:self-auto shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out Now</span>
        </button>
      </div>
    </div>
  );
};
