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
  Sun,
  Moon,
  Monitor,
  Palette,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatInr } from '../lib/api';
import { Tooltip } from '../components/Tooltip';
import { ConnectedPayPalAccount } from '../components/ConnectedPayPalAccount';
import { PayPalSandboxBusinessReporting } from '../components/PayPalSandboxBusinessReporting';
import { AccountTypeVerificationSection } from '../components/AccountTypeVerificationSection';
import { AccountTypeSelectorSection } from '../components/AccountTypeSelectorSection';
import { FEATURE_FLAGS } from '../config/features';
import { pageActionDispatcher } from '../lib/pageActionDispatcher';

export const SettingsPage: React.FC = () => {
  const { user, refreshUser, logout, theme, setTheme } = useAuth();

  // Profile fields
  const [name, setName] = useState('');
  const [riskTolerance, setRiskTolerance] = useState<'conservative' | 'balanced' | 'growth'>('balanced');

  // Financial Profile fields (Section 11)
  const [monthlyIncome, setMonthlyIncome] = useState('5000');
  const [incomeType, setIncomeType] = useState<'salary' | 'freelance' | 'business' | 'pension' | 'other'>('salary');
  const [incomeFrequency, setIncomeFrequency] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');
  const [expectedIncomeDate, setExpectedIncomeDate] = useState('1');
  const [additionalIncome, setAdditionalIncome] = useState('0');
  const [incomeStatus, setIncomeStatus] = useState<'user_estimate' | 'imported_record' | 'verified'>('user_estimate');
  const [preferredCurrency, setPreferredCurrency] = useState('USD');

  // Policy limits
  const [singleLimit, setSingleLimit] = useState('2500');
  const [dailyLimit, setDailyLimit] = useState('5000');
  const [discretionaryCap, setDiscretionaryCap] = useState('1200');
  const [pinThreshold, setPinThreshold] = useState('200');
  const [allowFamilySharedView, setAllowFamilySharedView] = useState(true);

  // PIN rotation
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [rotatingPin, setRotatingPin] = useState(false);
  const [linkingPayPal, setLinkingPayPal] = useState(false);

  const handleLinkPayPal = async () => {
    setMsg('');
    setErr('');
    setLinkingPayPal(true);
    try {
      const res = await apiRequest('/auth/paypal/authorize');
      if (res.url) {
        window.location.href = res.url;
      } else {
        setErr('Failed to obtain PayPal authorization URL.');
        setLinkingPayPal(false);
      }
    } catch (error: any) {
      setErr(error?.message || 'Failed to start PayPal account linking.');
      setLinkingPayPal(false);
    }
  };

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
          setPreferredCurrency(res.profile.preferredCurrency || user?.preferredCurrency || 'USD');
        }
      } catch {
        if (user?.monthlyIncome) setMonthlyIncome(String(user.monthlyIncome));
        if (user?.preferredCurrency) setPreferredCurrency(user.preferredCurrency);
      }
    };

    loadFinancialProfile();
  }, [user]);

  useEffect(() => {
    pageActionDispatcher.setPageReady('settings', true);
    const unregister = pageActionDispatcher.registerPage('settings', {
      executeAction: async () => true,
      isReady: () => true,
    });
    return () => {
      unregister();
      pageActionDispatcher.setPageReady('settings', false);
    };
  }, []);

  const handleSaveFinancialProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setSavingProfile(true);
    try {
      // 1. Update personal identity & preferred currency
      await apiRequest('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          monthlyIncome: Number(monthlyIncome),
          preferredCurrency,
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
      window.dispatchEvent(new CustomEvent('aura-state-changed'));
      setMsg('Financial profile and currency settings updated successfully.');
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
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white tracking-tight">Account &amp; Financial Settings</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your appearance, financial profile, Financial Guardian spending rules, and payment security PIN.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 self-start sm:self-center">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          Server-Enforced Guardian
        </span>
      </div>

      {msg && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 text-xs sm:text-sm text-emerald-900 dark:text-emerald-300 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {msg}
        </div>
      )}

      {err && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-xs sm:text-sm text-rose-800 dark:text-rose-300 font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          {err}
        </div>
      )}

      {/* 0. Appearance & Theme Settings (Light / Dark / System) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-navy-900 dark:text-white">Appearance &amp; Display</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Personalize theme preference and high-contrast readability</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-3 transition ${
              theme === 'light'
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-xs ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <Sun className="w-5 h-5 text-amber-500" />
              {theme === 'light' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
            </div>
            <div>
              <div className="text-sm font-bold">Light Mode</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Crisp, clean daytime theme</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-3 transition ${
              theme === 'dark'
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-xs ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <Moon className="w-5 h-5 text-indigo-400" />
              {theme === 'dark' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
            </div>
            <div>
              <div className="text-sm font-bold">Dark Mode</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Comfortable low-light viewing</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme('system')}
            className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-3 transition ${
              theme === 'system'
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-xs ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <Monitor className="w-5 h-5 text-slate-500" />
              {theme === 'system' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
            </div>
            <div>
              <div className="text-sm font-bold">System Default</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Match your operating system</div>
            </div>
          </button>
        </div>
      </div>

      {/* 1. Financial Profile & Baseline Income (Section 11) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-900 dark:text-white">Financial Profile</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Income source parameters and currency preferences</p>
            </div>
          </div>

          {/* Income Source Distinction Badge */}
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-auto ${
              incomeStatus === 'verified'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                : incomeStatus === 'imported_record'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
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
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                Primary Monthly Income
                <Tooltip content="Baseline amount used to calculate budget allocations and affordability" />
              </label>
              <input
                type="number"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Income Type</label>
              <select
                value={incomeType}
                onChange={(e) => setIncomeType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="salary">Salaried Employment</option>
                <option value="freelance">Freelance / Consulting</option>
                <option value="business">Business / Self-Employed</option>
                <option value="pension">Pension / Annuity</option>
                <option value="other">Other / Mixed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Income Frequency</label>
              <select
                value={incomeFrequency}
                onChange={(e) => setIncomeFrequency(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Bi-Weekly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Expected Income Date (Day of Month)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={expectedIncomeDate}
                onChange={(e) => setExpectedIncomeDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Additional / Variable Monthly Income
              </label>
              <input
                type="number"
                value={additionalIncome}
                onChange={(e) => setAdditionalIncome(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Preferred Currency</label>
              <select
                value={preferredCurrency}
                onChange={(e) => setPreferredCurrency(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="USD">USD ($) — US Dollar</option>
                <option value="EUR">EUR (€) — Euro</option>
                <option value="GBP">GBP (£) — British Pound</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <span>
              Updating your monthly income recalibrates future financial projections and savings recommendations.
              Historical transaction statements remain immutable and unmodified.
            </span>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {savingProfile ? 'Saving...' : 'Save Financial Profile'}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Financial Guardian Policy Boundaries */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-900 dark:text-white">Financial Guardian Spending Safeguards</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Autonomous protection rules that prevent unauthorized outflows</p>
            </div>
          </div>
          <Tooltip content="Rules enforced deterministically before any payment can be prepared or executed." />
        </div>

        <form onSubmit={handleSavePolicy} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                Single Transaction Limit
                <Tooltip content="Maximum amount allowed for an individual transaction." />
              </label>
              <input
                type="number"
                value={singleLimit}
                onChange={(e) => setSingleLimit(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                Daily Spending Cap
                <Tooltip content="Total cumulative outflow allowed in a 24-hour day." />
              </label>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                Discretionary Monthly Budget Cap
                <Tooltip content="Maximum allowance for dining, entertainment, and non-essential shopping." />
              </label>
              <input
                type="number"
                value={discretionaryCap}
                onChange={(e) => setDiscretionaryCap(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                Require PIN Verification Above
                <Tooltip content="Transactions exceeding this threshold require your security PIN." />
              </label>
              <input
                type="number"
                value={pinThreshold}
                onChange={(e) => setPinThreshold(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label htmlFor="familyShared" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Share aggregate budget health with family members (Personal account balances stay private)
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingPolicy}
              className="px-5 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {savingPolicy ? 'Updating...' : 'Save Guardian Policies'}
            </button>
          </div>
        </form>
      </div>

      {/* 3. Payment Security PIN Management */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-navy-900 dark:text-white">Payment Security PIN</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Encrypted security PIN required to authorize and execute payments.
            </p>
          </div>
        </div>

        <form onSubmit={handleRotatePin} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Current PIN</label>
              <input
                type="password"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                placeholder="4 to 6 digits"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">New PIN</label>
              <input
                type="password"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="4 to 6 digits"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* 4. Account Type Selection (Personal vs Business Operating Mode) */}
      <AccountTypeSelectorSection />

      {/* 4b. Account Type & Business Verification Section */}
      <AccountTypeVerificationSection />

      {/* 5. PayPal Identity & Connected Account Section (Personal) */}
      <ConnectedPayPalAccount />

      {/* Optional Merchant Reporting (Exclusively for verified Business merchants) */}
      {FEATURE_FLAGS.ENABLE_MERCHANT_REPORTING_SECTION && user?.merchantAccessEnabled && (
        <PayPalSandboxBusinessReporting />
      )}

      {/* 5. Session Sign Out Card (Prominent & Clear) */}
      <div className="bg-rose-50/60 dark:bg-rose-950/40 rounded-3xl p-6 border border-rose-200 dark:border-rose-900/60 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors">
        <div>
          <h4 className="text-base font-bold text-rose-950 dark:text-rose-200">Sign Out of AURA</h4>
          <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5">
            End your authenticated session. Your financial records and security policies will remain securely stored.
          </p>
        </div>

        <button
          onClick={() => logout()}
          className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-xs transition flex items-center justify-center gap-2 self-start sm:self-auto shrink-0"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out Now</span>
        </button>
      </div>
    </div>
  );
};
