import React, { useState } from 'react';
import { ShieldCheck, Sparkles, ArrowRight, Lock, UserPlus, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AuthPage: React.FC = () => {
  const { loginWithCredentials, registerAccount, loginAsDemoAlex } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('Alex Sharma');
  const [email, setEmail] = useState('alex@aura-demo.finance');
  const [password, setPassword] = useState('AuraDemo#2026');
  const [pin, setPin] = useState('4826');
  const [monthlyIncome, setMonthlyIncome] = useState('95000');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await loginWithCredentials(email, password);
      } else {
        await registerAccount({
          name,
          email,
          password,
          pin,
          monthlyIncome: Number(monthlyIncome || 85000),
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = async () => {
    setError('');
    setBusy(true);
    try {
      await loginAsDemoAlex();
    } catch (err: any) {
      setError(err?.message || 'Demo login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xl">
            A
          </div>
          <div>
            <h1 className="text-xl font-bold text-navy-900">PROJECT AURA</h1>
            <p className="text-xs text-slate-500">Your Money. Your Goals. Your Future.</p>
          </div>
        </div>

        <div className="mb-6 p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-700">
            <span className="font-semibold text-navy-900 block">Hackathon Demo Story: Alex Sharma</span>
            Pre-loaded with 3 accounts, recurring mandates, goals & PayPal Sandbox PIN <code className="font-mono font-bold text-blue-700">4826</code>
          </div>
          <button
            type="button"
            onClick={handleDemo}
            disabled={busy}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Enter as Alex
          </button>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 mb-5">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === 'login' ? 'bg-white text-navy-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === 'register' ? 'bg-white text-navy-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Create Account
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
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
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">4-Digit Security PIN</label>
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Income (₹)</label>
                <input
                  type="number"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition"
          >
            <span>{busy ? 'Authenticating...' : mode === 'login' ? 'Sign In to AURA' : 'Create AURA Account'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            Argon2id Password & PIN Hashing
          </span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Financial Guardian Active
          </span>
        </div>
      </div>
    </div>
  );
};
