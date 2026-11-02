import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  User,
  Lock,
  LogOut,
  Save,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatInr } from '../lib/api';
import { Tooltip } from '../components/Tooltip';

export const SettingsPage: React.FC = () => {
  const { user, refreshUser, balancesVisible, toggleBalancesVisible, logout } = useAuth();

  // Profile fields
  const [name, setName] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [riskTolerance, setRiskTolerance] = useState<'conservative' | 'balanced' | 'growth'>('balanced');

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
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [rotatingPin, setRotatingPin] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setMonthlyIncome(String(user.monthlyIncome || '85000'));
      setRiskTolerance(user.spendingPreferences?.riskTolerance || 'balanced');
      setSingleLimit(String(user.financialPolicy?.singleTransactionLimit || '75000'));
      setDailyLimit(String(user.financialPolicy?.dailySpendingLimit || '100000'));
      setDiscretionaryCap(String(user.financialPolicy?.discretionaryMonthlyCap || '18000'));
      setPinThreshold(String(user.financialPolicy?.requirePinAboveAmount || '1000'));
      setAllowFamilySharedView(user.financialPolicy?.allowFamilySharedView !== false);
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
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
      await refreshUser();
      setMsg('Personal profile and cashflow baselines updated successfully.');
    } catch (error: any) {
      setErr(error?.message || 'Failed to update profile');
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
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-navy-900 tracking-tight">Account &amp; Security Settings</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage your personal profile, Financial Guardian policy boundaries, and Argon2id payment PIN.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-center">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Server-Enforced Guardian
        </span>
      </div>

      {msg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {msg}
        </div>
      )}

      {err && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          {err}
        </div>
      )}

      {/* 1. Profile & Income Baseline */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-navy-900">Personal Profile &amp; Financial Baseline</h3>
            <p className="text-xs text-slate-500">Your identity and verified income parameters</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Verified Monthly Income (INR)
              </label>
              <input
                type="number"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Risk Tolerance Preference
              </label>
              <select
                value={riskTolerance}
                onChange={(e) => setRiskTolerance(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="conservative">Conservative (Prioritize Emergency &amp; Capital Protection)</option>
                <option value="balanced">Balanced (50/30/20 Disciplined Savings &amp; Growth)</option>
                <option value="growth">Growth (Aggressive Goal Funding &amp; Discretionary Flex)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Save Profile Changes
            </button>
          </div>
        </form>
      </div>

      {/* 2. Financial Guardian Policy Boundaries */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-navy-900">Financial Guardian Spending Safeguards</h3>
              <p className="text-xs text-slate-500">Autonomous protection rules that prevent unauthorized outflows</p>
            </div>
          </div>
          <Tooltip content="Rules enforced deterministically before any payment can be prepared or executed." />
        </div>

        <form onSubmit={handleSavePolicy} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                Single Transaction Limit (INR)
                <Tooltip content="The maximum amount allowed for an individual payment request." />
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
                <Tooltip content="Total cumulative outflow allowed in a single 24-hour calendar day." />
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
                <Tooltip content="Amount allocated for flexible, non-essential spending per month." />
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
                <Tooltip content="Transactions above this amount require entering your Argon2id security PIN." />
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
              Share aggregated budget overview with household family members (Personal accounts remain private)
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingPolicy}
              className="px-5 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {savingPolicy ? 'Updating...' : 'Save Guardian Policies'}
            </button>
          </div>
        </form>
      </div>

      {/* 3. Payment Security PIN Management (Argon2id) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-navy-900">Payment Security PIN Management</h3>
            <p className="text-xs text-slate-500">
              Protected with Argon2id cryptographic hashing. Required to authorize PayPal checkout orders.
            </p>
          </div>
        </div>

        <form onSubmit={handleRotatePin} className="space-y-4 pt-2">
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
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition"
            >
              {rotatingPin ? 'Rotating...' : 'Rotate Security PIN'}
            </button>
          </div>
        </form>
      </div>

      {/* 4. Privacy & Balance Controls */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-navy-900">Financial Privacy &amp; Balance Masking</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Hide liquid balances and sensitive amounts by default on all screens.
          </p>
        </div>
        <button
          onClick={toggleBalancesVisible}
          className={`px-4 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-2 ${
            balancesVisible
              ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
          }`}
        >
          {balancesVisible ? <EyeOff className="w-3.5 h-3.5 text-amber-700" /> : <Eye className="w-3.5 h-3.5 text-slate-600" />}
          <span>{balancesVisible ? 'Balances Unmasked' : 'Balances Masked'}</span>
        </button>
      </div>

      {/* 5. Session Sign Out */}
      <div className="pt-2 flex justify-between items-center text-xs text-slate-500">
        <span>AURA Security Model: Zero secret exposure to client • Argon2id protected</span>
        <button
          onClick={logout}
          className="text-xs text-rose-600 hover:underline font-semibold flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out of Account
        </button>
      </div>
    </div>
  );
};
