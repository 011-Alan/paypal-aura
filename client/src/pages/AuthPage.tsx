import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  UserPlus,
  LogIn,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

export const AuthPage: React.FC = () => {
  const { loginWithCredentials, registerAccount } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register form
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('85000');

  // Forgot password modal
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotPin, setForgotPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotErr, setForgotErr] = useState('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paypalBusy, setPaypalBusy] = useState(false);

  // Check URL parameters for PayPal authentication feedback
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const authStatus = params.get('auth');
      const errorMsg = params.get('message');
      if (authStatus === 'not_registered') {
        setMode('register');
        setError(
          decodeURIComponent(
            errorMsg ||
              'Your PayPal account was verified, but no AURA account was found for this identity. Click "Sign up with PayPal" below to complete registration.'
          )
        );
        params.delete('auth');
        params.delete('message');
        const remaining = params.toString();
        const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : '');
        window.history.replaceState({}, document.title, cleanUrl);
      } else if (authStatus === 'paypal_error' && errorMsg) {
        setError(decodeURIComponent(errorMsg));
        params.delete('auth');
        params.delete('message');
        const remaining = params.toString();
        const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : '');
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
  }, []);

  const handlePayPalAuth = async () => {
    setError('');
    setPaypalBusy(true);
    try {
      const action = mode === 'register' ? 'register' : 'login';
      const res = await apiRequest(`/auth/paypal/authorize?action=${action}`);
      if (res.url) {
        window.location.href = res.url;
      } else {
        setError('Failed to obtain PayPal authorization URL.');
        setPaypalBusy(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to start Log in with PayPal.');
      setPaypalBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        if (!email || !password) {
          setError('Please provide both email and password.');
          return;
        }
        await loginWithCredentials(email, password);
      } else {
        if (!name || !email || !password) {
          setError('Please fill in all required fields.');
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          return;
        }
        if (!/^\d{4,6}$/.test(pin)) {
          setError('Security PIN must be 4 to 6 digits.');
          return;
        }
        await registerAccount({
          name,
          email,
          password,
          pin,
          monthlyIncome: Number(monthlyIncome || 85000),
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMsg('');
    setForgotErr('');
    try {
      const res = await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotEmail,
          pin: forgotPin,
          newPassword,
        }),
      });
      setForgotMsg(res.message);
      setTimeout(() => {
        setForgotModalOpen(false);
        setEmail(forgotEmail);
        setPassword(newPassword);
        setMode('login');
      }, 1500);
    } catch (err: any) {
      setForgotErr(err?.message || 'Password reset failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
        {/* Brand Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-2xl shadow-sm">
              A
            </div>
            <div>
              <h1 className="text-2xl font-bold text-navy-900 tracking-tight">PROJECT AURA</h1>
              <p className="text-sm text-slate-500">Your Financial Life Companion</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Argon2id Secure
          </span>
        </div>

        {/* Mode Switcher */}
        <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === 'login' ? 'bg-white text-navy-900 shadow-xs' : 'text-slate-600 hover:text-navy-900'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
              mode === 'register' ? 'bg-white text-navy-900 shadow-xs' : 'text-slate-600 hover:text-navy-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Create Account
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
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
                placeholder="e.g. Rachel Green"
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
              placeholder="you@example.com"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Password</label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotModalOpen(true);
                  }}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Security PIN (4 to 6 Digits)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="e.g. 4826"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Used by Financial Guardian to authorize sensitive financial transactions.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Estimated Monthly Income (INR)
                </label>
                <input
                  type="number"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  placeholder="85000"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-xs transition flex items-center justify-center gap-2 mt-2"
          >
            {busy ? (
              'Authenticating...'
            ) : mode === 'login' ? (
              <>
                Sign In to AURA <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                Create Account <UserPlus className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* PayPal Authentication Option */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-400 font-medium tracking-wide">
              or continue with
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePayPalAuth}
          disabled={busy || paypalBusy}
          className="w-full py-2.5 px-4 rounded-xl bg-[#003087] hover:bg-[#00256c] text-white font-semibold text-xs shadow-xs transition flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          {/* Official PayPal "P" Dual-Tone Logo */}
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <path
              d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 2.47a.82.82 0 0 1 .81-.693h7.195c2.955 0 5.176.713 6.098 2.651.464.975.526 2.057.258 3.428-.48 2.454-2.14 4.544-4.8 5.446l-.378.115-.494 2.502-.387 1.961a.64.64 0 0 1-.632.518H8.874l-1.798 2.839z"
              fill="#0079C1"
            />
            <path
              d="M19.307 7.856c-.48 2.454-2.14 4.544-4.8 5.446l-.378.115-.881 4.463a.64.64 0 0 1-.632.518H9.08l-.133.673a.641.641 0 0 0 .633.74h4.152a.82.82 0 0 0 .81-.693l.034-.176.643-4.081.042-.224a.82.82 0 0 1 .81-.693h.512c3.418 0 6.094-1.388 6.877-5.385.328-1.67.143-3.078-.66-4.04-.616.924-1.492 1.692-2.593 2.14z"
              fill="#00457C"
            />
          </svg>
          <span>
            {paypalBusy
              ? 'Redirecting to PayPal...'
              : mode === 'login'
              ? 'Log in with PayPal'
              : 'Sign up with PayPal'}
          </span>
        </button>

        {/* Security Disclosures */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-slate-400" /> Server-side encrypted
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <KeyRound className="w-3 h-3 text-slate-400" /> Zero credential leakage
          </span>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-navy-900 mb-1">Reset Account Password</h3>
            <p className="text-xs text-slate-500 mb-4">
              Confirm your registered email and your 4-digit security PIN to establish a new password.
            </p>

            {forgotMsg && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {forgotMsg}
              </div>
            )}
            {forgotErr && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
                {forgotErr}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Security PIN</label>
                <input
                  type="password"
                  maxLength={6}
                  value={forgotPin}
                  onChange={(e) => setForgotPin(e.target.value)}
                  placeholder="4-digit PIN"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
                >
                  Confirm Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
