import React, { useState } from 'react';
import {
  Briefcase,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Lock,
  ExternalLink,
  Store,
  Unlink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { Tooltip } from './Tooltip';

export const AccountTypeVerificationSection: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'info' | 'warning' | 'error'; text: string } | null>(null);

  const isPayPalLinked = Boolean(user?.paypalAccountLinked && user?.paypalUserId);
  const paypalAccountType = user?.paypalAccountType || (user?.accountType === 'business' ? 'BUSINESS' : 'PERSONAL');
  const auraAccountType = user?.auraAccountType || (user?.accountType === 'business' ? 'BUSINESS' : 'PERSONAL');
  const verificationStatus = user?.merchantVerificationStatus || (user?.merchantAccessEnabled ? 'VERIFIED' : 'NOT_STARTED');
  const merchantAccessEnabled = Boolean(user?.merchantAccessEnabled);

  // Format verification status for friendly display
  const getVerificationStatusLabel = () => {
    switch (verificationStatus) {
      case 'VERIFIED':
        return { label: 'Verified', color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
      case 'REJECTED':
        return { label: 'Not eligible', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
      case 'PENDING':
        return { label: 'Pending', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
      case 'NOT_STARTED':
        return { label: 'Not Started', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
      case 'UNVERIFIED':
      default:
        return { label: 'Unable to verify', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
    }
  };

  const getAuraAccountTypeLabel = () => {
    switch (auraAccountType) {
      case 'BUSINESS':
        return { label: 'Business', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
      case 'PERSONAL':
        return { label: 'Personal', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
      case 'UNVERIFIED':
      default:
        return { label: 'Unverified', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
    }
  };

  const getPaypalAccountTypeLabel = () => {
    if (!isPayPalLinked) {
      return { label: 'Disconnected', color: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
    }
    switch (paypalAccountType) {
      case 'BUSINESS':
        return { label: 'Business', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
      case 'PERSONAL':
        return { label: 'Personal', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
      case 'UNKNOWN':
      default:
        return { label: 'Unknown', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
    }
  };

  // Authoritative check business eligibility workflow
  const handleCheckEligibility = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const res = await apiRequest<{
        success: boolean;
        eligibility: {
          auraAccountType: string;
          paypalAccountType: string;
          merchantVerificationStatus: string;
          merchantAccessEnabled: boolean;
          explanation: string;
          verificationMethod: string | null;
        };
      }>('/merchant/check-eligibility', { method: 'POST' });

      await refreshUser();
      window.dispatchEvent(new CustomEvent('aura-state-changed'));

      if (res.eligibility.merchantAccessEnabled) {
        setMessage({
          type: 'success',
          text: res.eligibility.explanation || 'Verified! Your PayPal Business account is verified and Merchant Hub access is enabled.',
        });
      } else {
        setMessage({
          type: 'info',
          text: res.eligibility.explanation || 'Eligibility evaluation completed.',
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Failed to verify business eligibility. Please try again.',
      });
    } finally {
      setChecking(false);
    }
  };

  // Disconnect PayPal workflow
  const handleDisconnectPayPal = async () => {
    if (!window.confirm('Are you sure you want to disconnect PayPal? Merchant Hub privileges will be immediately revoked. Your historical orders, transactions, and goals will be safely preserved.')) {
      return;
    }

    setDisconnecting(true);
    setMessage(null);
    try {
      await apiRequest('/paypal/disconnect', { method: 'POST' });
      await refreshUser();
      window.dispatchEvent(new CustomEvent('aura-state-changed'));
      setMessage({
        type: 'info',
        text: 'PayPal account disconnected. Merchant Hub access has been safely revoked.',
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Failed to disconnect PayPal account.',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const vStatus = getVerificationStatusLabel();
  const aStatus = getAuraAccountTypeLabel();
  const pStatus = getPaypalAccountTypeLabel();

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/60">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-navy-900 dark:text-white tracking-tight">
                Account Type &amp; Business Verification
              </h3>
              <Tooltip content="Merchant Hub is exclusively available to verified PayPal Business accounts with authentic seller credentials." />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Authoritative server-side merchant classification and entitlement controls.
            </p>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleCheckEligibility}
            disabled={checking || disconnecting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-xs transition disabled:opacity-50"
            title="Initiate server-side business verification"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>{checking ? 'Evaluating Eligibility...' : 'Check Business Eligibility'}</span>
          </button>
        </div>
      </div>

      {/* Outcome Alert Message */}
      {message && (
        <div
          className={`p-4 rounded-2xl text-xs font-medium flex items-start gap-3 border ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : message.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
              : 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : message.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed">{message.text}</span>
        </div>
      )}

      {/* Status Matrix Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Connected PayPal */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Connected PayPal Account
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-navy-900 dark:text-white truncate">
              {isPayPalLinked ? user?.paypalEmail || 'Connected' : 'Not Connected'}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                isPayPalLinked
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {isPayPalLinked ? 'Linked' : 'None'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {isPayPalLinked ? `Payer ID: ${user?.paypalPayerId || 'Verified'}` : 'Connect PayPal below'}
          </div>
        </div>

        {/* Card 2: PayPal Account Type */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            PayPal Account Type
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-navy-900 dark:text-white">
              {pStatus.label}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${pStatus.color}`}>
              {pStatus.label}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {paypalAccountType === 'BUSINESS'
              ? 'Commercial business facilitator'
              : paypalAccountType === 'PERSONAL'
              ? 'Personal consumer account'
              : 'Identity type not yet established'}
          </div>
        </div>

        {/* Card 3: AURA Account Type */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            AURA Account Type
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-navy-900 dark:text-white">
              {aStatus.label}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${aStatus.color}`}>
              {aStatus.label}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {auraAccountType === 'BUSINESS' ? 'Business Operations' : 'Personal Finance'}
          </div>
        </div>

        {/* Card 4: Business Verification Status */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Business Verification
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-navy-900 dark:text-white">
              {vStatus.label}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${vStatus.color}`}>
              {vStatus.label}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {verificationStatus === 'VERIFIED'
              ? 'Authenticated seller verification'
              : verificationStatus === 'REJECTED'
              ? 'Personal account (not eligible)'
              : 'Requires verified business identity'}
          </div>
        </div>

        {/* Card 5: Merchant Hub Access Status */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Merchant Hub Access
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
              {merchantAccessEnabled ? (
                <>
                  <Store className="w-4 h-4 text-emerald-600" />
                  <span>Available</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span>Unavailable</span>
                </>
              )}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                merchantAccessEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {merchantAccessEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {merchantAccessEnabled ? 'Visible in sidebar navigation' : 'Restricted to verified merchants'}
          </div>
        </div>

        {/* Card 6: Method & Timestamp */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Verification Method
          </div>
          <div className="text-sm font-bold text-navy-900 dark:text-white truncate">
            {user?.verificationMethod || 'Not evaluated'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {user?.verificationUpdatedAt
              ? `Evaluated: ${new Date(user.verificationUpdatedAt).toLocaleDateString()}`
              : 'Click Check Eligibility to evaluate'}
          </div>
        </div>
      </div>

      {/* Explanatory Context Footer */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            {merchantAccessEnabled
              ? 'Your account is authorized for Merchant Hub. You can manage store inventory, track customer orders, and view merchant settlements.'
              : paypalAccountType === 'PERSONAL'
              ? 'Your account is classified as Personal. Personal accounts enjoy full access to banking, bill reminders, savings goals, and smart purchases.'
              : 'Merchant Hub access requires a verified PayPal Business account.'}
          </span>
        </div>

        {isPayPalLinked && (
          <button
            type="button"
            onClick={handleDisconnectPayPal}
            disabled={disconnecting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0 disabled:opacity-50"
          >
            <Unlink className="w-3.5 h-3.5" />
            <span>{disconnecting ? 'Disconnecting...' : 'Disconnect PayPal'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
