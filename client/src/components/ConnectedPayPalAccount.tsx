import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  MapPin,
  Mail,
  User,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Lock,
  Clock,
  ArrowUpRight,
  Info,
} from 'lucide-react';
import { apiRequest, setActiveCurrency } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from './Tooltip';

export interface ConnectedAccountData {
  linked: boolean;
  profile: {
    name: string;
    firstName?: string;
    lastName?: string;
    email: string;
    address: {
      streetAddress?: string;
      locality?: string;
      region?: string;
      postalCode?: string;
      country?: string;
      formatted?: string;
    } | null;
    paypalAccountId: string;
    accountVerificationStatus: {
      verified: boolean;
      statusText: 'Verified' | 'Unverified';
    };
    accountType?: string;
    lastSyncAt: string;
    isCachedFallback?: boolean;
  } | null;
  balance: {
    available: boolean;
    balance: number | null;
    currency: string | null;
    statusMessage: string;
    details?: string;
    lastSyncAt: string | null;
  };
  transactions: {
    available: boolean;
    transactions: Array<{
      id: string;
      date: string;
      amount: number;
      currency: string;
      status: string;
      type: string;
      description: string;
      senderOrRecipient?: string;
      fee?: number;
    }>;
    totalCount: number;
    statusMessage: string;
    details?: string;
    lastSyncAt: string | null;
  };
  lastSynchronized: string | null;
  mode?: 'sandbox' | 'live';
}

export const ConnectedPayPalAccount: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<ConnectedAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const res = await apiRequest('/paypal/connected-account');
      setData(res);
      if (res?.balance?.currency) {
        setActiveCurrency(res.balance.currency);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load connected PayPal account.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      const res = await apiRequest('/paypal/sync', { method: 'POST' });
      setData(res);
      if (res?.balance?.currency) {
        setActiveCurrency(res.balance.currency);
      }
      window.dispatchEvent(new CustomEvent('aura-state-changed'));
    } catch (err: any) {
      setError(err?.message || 'Manual synchronization failed.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return 'Not yet synchronized';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
      {/* 1. Header with PayPal Dual-Tone Branding & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#003087]/10 dark:bg-blue-950/60 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/60">
            {/* Official PayPal "P" Dual-Tone Logo */}
            <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none">
              <path
                d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 2.47a.82.82 0 0 1 .81-.693h7.195c2.955 0 5.176.713 6.098 2.651.464.975.526 2.057.258 3.428-.48 2.454-2.14 4.544-4.8 5.446l-.378.115-.494 2.502-.387 1.961a.64.64 0 0 1-.632.518H8.874l-1.798 2.839z"
                fill="#0079C1"
              />
              <path
                d="M19.307 7.856c-.48 2.454-2.14 4.544-4.8 5.446l-.378.115-.881 4.463a.64.64 0 0 1-.632.518H9.08l-.133.673a.641.641 0 0 0 .633.74h4.152a.82.82 0 0 0 .81-.693l.034-.176.643-4.081.042-.224a.82.82 0 0 1 .81-.693h.512c3.418 0 6.094-1.388 6.877-5.385.328-1.67.143-3.078-.66-4.04-.616.924-1.492 1.692-2.593 2.14z"
                fill="#00457C"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-navy-900 dark:text-white tracking-tight">
                Connected PayPal Account
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 uppercase tracking-wider">
                {data?.mode === 'live' ? 'Live' : 'Sandbox'}
              </span>
              <Tooltip content="Read-only personal profile & authorized financial data retrieved directly from PayPal Identity OpenID Connect." />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Verified identity link with official PayPal Identity and OpenID Connect protocols.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {data?.linked && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition disabled:opacity-50"
              title="Synchronize latest information from PayPal"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-600' : ''}`} />
              <span>{syncing ? 'Synchronizing...' : 'Refresh'}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center text-xs text-slate-500 space-y-2">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
          <span>Retrieving verified PayPal account information...</span>
        </div>
      ) : !data?.linked ? (
        <div className="py-8 px-4 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-navy-900 dark:text-white">No PayPal Account Connected</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Connect your PayPal account via standard OpenID Connect to securely verify your personal identity, address, and account status.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 2. Profile Information Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                Verified PayPal Profile
              </h4>
              {data.profile?.accountVerificationStatus && (
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                    data.profile.accountVerificationStatus.verified
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-800'
                      : 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/60 dark:border-amber-800'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {data.profile.accountVerificationStatus.statusText}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Name */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 block mb-1">
                  Full Name / Business Name
                </span>
                <span className="text-sm font-bold text-navy-900 dark:text-white block truncate">
                  {(data.profile?.name && data.profile.name !== 'PayPal User' && data.profile.name !== 'Denied Scopes User')
                    ? data.profile.name
                    : (user?.name && user.name !== 'PayPal User' && user.name !== 'Denied Scopes User'
                        ? user.name
                        : (data.profile?.name || user?.name || '-'))}
                </span>
                {data.profile?.firstName && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    Given: {data.profile.firstName} {data.profile.lastName || ''}
                  </span>
                )}
              </div>

              {/* Email */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 block mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> PayPal Email
                </span>
                <span className="text-sm font-semibold text-navy-900 dark:text-white block truncate">
                  {data.profile?.email && !data.profile.email.includes('@user.aura')
                    ? data.profile.email
                    : (user?.email && !user.email.includes('@user.aura')
                        ? user.email
                        : (data.profile?.email || '-'))}
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block mt-0.5 font-medium">
                  Identity Consent Confirmed
                </span>
              </div>

              {/* Account ID / Payer ID */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 block mb-1">
                  PayPal Account ID
                </span>
                <span className="text-xs font-mono font-semibold text-navy-900 dark:text-white block truncate">
                  {data.profile?.paypalAccountId || '-'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  Unique Immutable Reference
                </span>
              </div>

              {/* Address */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 block mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-blue-500" /> Registered Address
                </span>
                <span className="text-xs text-navy-900 dark:text-white block leading-relaxed line-clamp-2">
                  {data.profile?.address?.formatted ||
                    data.profile?.address?.locality ||
                    'Address not shared in consent'}
                </span>
                {data.profile?.address?.country && (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 block mt-0.5">
                    Country: {data.profile.address.country}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 3. PayPal Balance Section */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              PayPal Balance
            </h4>

            {data.balance?.available && data.balance.balance !== null ? (
              <div className="p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/60 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Verified Wallet Balance
                  </span>
                  <div className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                    {data.balance.currency} {data.balance.balance.toFixed(2)}
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                    {data.balance.statusMessage}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100/60 px-3 py-1 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Live
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <span className="text-xs font-bold text-navy-900 dark:text-white block">
                    PayPal balance access is not currently available.
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {data.balance?.details ||
                      'Retrieving an individual customer wallet balance requires specialized PayPal Partner or Reporting API permissions (reporting/balances/read) that are not granted to standard OpenID Connect applications.'}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 italic pt-0.5">
                    AURA strictly displays verified balances and never substitutes estimated or fabricated wallet values.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 4. PayPal Transactions Section */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              PayPal Transaction History
            </h4>

            {data.transactions?.available && data.transactions.transactions?.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Sender / Recipient</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.transactions.transactions.map((txn) => (
                      <tr key={txn.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{txn.date.slice(0, 10)}</td>
                        <td className="py-2.5 px-3 font-semibold text-navy-900 dark:text-white">{txn.description}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {txn.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{txn.senderOrRecipient || '-'}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-navy-900 dark:text-white">
                          {txn.currency} {txn.amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <span className="text-xs font-bold text-navy-900 dark:text-white block">
                    PayPal transaction-history access requires additional PayPal permissions or approval.
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {data.transactions?.details ||
                      'Third-party account transaction search requires the https://uri.paypal.com/services/reporting/search/read scope and PayPal Partner authorization.'}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 italic pt-0.5">
                    AURA adheres to strict read-only security and will only display transactions directly confirmed by PayPal's API.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 5. Read-Only Security Disclosures & Sync Status */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-slate-400 gap-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-600" /> Strictly Read-Only Security
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-blue-500" /> Zero Fund Movement Rights
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Clock className="w-3 h-3" />
              <span>Last synchronized: {formatTimestamp(data.lastSynchronized || data.profile?.lastSyncAt)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
