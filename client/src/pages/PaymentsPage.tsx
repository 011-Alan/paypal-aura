import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  Lock,
  CheckCircle2,
  XCircle,
  KeyRound,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Wallet,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export const PaymentsPage: React.FC = () => {
  const { balancesVisible, formatMoney, user } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  // Form State
  const [recipientName, setRecipientName] = useState('Greenwood Residency Properties');
  const [recipientEmail, setRecipientEmail] = useState('merchant-sandbox@paypal.com');
  const [merchantCategory, setMerchantCategory] = useState('Rent');
  const [description, setDescription] = useState('Monthly maintenance & utilities payment');
  const [amount, setAmount] = useState('50');
  const [sourceAccountId, setSourceAccountId] = useState('');

  // Workflow & Active payment state
  const [activePaymentId, setActivePaymentId] = useState<string>('');
  const [pinInput, setPinInput] = useState('');
  const [approvalToken, setApprovalToken] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);
  const [inspectingPayment, setInspectingPayment] = useState<any | null>(null);

  const loadData = async () => {
    try {
      const [paymentsRes, accountsRes] = await Promise.all([
        apiRequest('/payments'),
        apiRequest('/accounts').catch(() => ({ accounts: [] })),
      ]);

      const loadedPayments = paymentsRes.payments || [];
      setPayments(loadedPayments);
      const loadedAccounts = accountsRes.accounts || [];
      setAccounts(loadedAccounts);

      if (loadedAccounts.length > 0 && !sourceAccountId) {
        setSourceAccountId(loadedAccounts[0]._id);
      }
      if (loadedPayments.length > 0 && !activePaymentId) {
        setActivePaymentId(loadedPayments[0]._id);
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    loadData();

    // Check for PayPal return params
    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const checkoutStatus = params.get('status');
      const orderToken = params.get('token');

      if (checkoutStatus === 'approved') {
        params.delete('status');
        params.delete('token');
        params.delete('PayerID');
        const remaining = params.toString();
        const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : '');
        window.history.replaceState({}, document.title, cleanUrl);

        if (orderToken) {
          setStatusMessage('Payment approved by buyer. Finalizing settlement...');
          setBusy(true);
          apiRequest('/payments/capture-paypal-order', {
            method: 'POST',
            body: JSON.stringify({ orderId: orderToken }),
          })
            .then(() => {
              setStatusMessage('Payment completed successfully. Balances and transaction record updated.');
              loadData();
              window.dispatchEvent(new CustomEvent('aura-state-changed'));
            })
            .catch((err: any) => {
              setErrorMsg(`Settlement processing failed: ${err?.message}`);
            })
            .finally(() => {
              setBusy(false);
            });
        }
      } else if (checkoutStatus === 'cancelled') {
        setErrorMsg('Payment authorization was cancelled.');
        params.delete('status');
        params.delete('token');
        const remaining = params.toString();
        const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : '');
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }

    const handleStateChange = () => {
      loadData();
    };
    window.addEventListener('aura-state-changed', handleStateChange);
    return () => window.removeEventListener('aura-state-changed', handleStateChange);
  }, []);

  const activePayment = payments.find((p) => p._id === activePaymentId) || payments[0];
  const sourceAccount = accounts.find((a) => a._id === sourceAccountId) || accounts[0];

  const handlePrepare = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMessage('');
    setBusy(true);
    try {
      const res = await apiRequest('/payments/prepare', {
        method: 'POST',
        body: JSON.stringify({
          recipientName,
          recipientEmail,
          merchantCategory,
          description,
          amountInr: Number(amount),
        }),
      });
      setActivePaymentId(res.paymentRequest._id);
      setApprovalToken('');
      setPinInput('');
      setStatusMessage('Payment request prepared. Please review details and enter your security PIN to authorize.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to prepare payment');
    } finally {
      setBusy(false);
    }
  };

  const handleAuthorizeAndExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePayment || !pinInput) return;
    setErrorMsg('');
    setStatusMessage('');
    setBusy(true);

    try {
      // Step 1: Verify PIN
      const pinRes = await apiRequest(`/payments/${activePayment._id}/verify-pin`, {
        method: 'POST',
        body: JSON.stringify({ pin: pinInput }),
      });

      const token = pinRes.approvalToken;
      setApprovalToken(token);

      // Step 2: Create payment order with return redirects
      const orderRes = await apiRequest(`/payments/${activePayment._id}/paypal-order`, {
        method: 'POST',
        body: JSON.stringify({
          approvalToken: token,
          customReturnUrl: `${window.location.origin}/payments?status=approved`,
          customCancelUrl: `${window.location.origin}/payments?status=cancelled`,
        }),
      });

      if (orderRes.paypalOrder?.approvalUrl) {
        setStatusMessage('Payment authorized. Redirecting to complete secure buyer confirmation...');
        window.location.href = orderRes.paypalOrder.approvalUrl;
        return;
      }

      setStatusMessage('Payment authorized and ready for settlement.');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authorization failed. Please verify your PIN.');
    } finally {
      setBusy(false);
    }
  };

  const handleCaptureSettlement = async () => {
    if (!activePayment) return;
    setErrorMsg('');
    setBusy(true);
    try {
      await apiRequest(`/payments/${activePayment._id}/paypal-capture`, {
        method: 'POST',
        body: JSON.stringify({ paypalOrderId: activePayment.paypalOrderId }),
      });
      setStatusMessage('Payment completed successfully. Balances and transaction history updated.');
      await loadData();
      window.dispatchEvent(new CustomEvent('aura-state-changed'));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Payment settlement failed.');
    } finally {
      setBusy(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'captured':
      case 'webhook_verified':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case 'paypal_order_created':
      case 'pin_verified':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Clock className="w-3.5 h-3.5" />
            Processing
          </span>
        );
      case 'guardian_approved':
      case 'pending_approval':
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5" />
            Awaiting Approval
          </span>
        );
      case 'failed':
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Refunded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {status?.replace(/_/g, ' ') || 'Pending'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white">
            Payments &amp; Transfers
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Send payments with financial rule validation and security PIN verification.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 self-start sm:self-center">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          Protected by Spending Rules
        </span>
      </div>

      {statusMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 text-xs sm:text-sm text-emerald-900 dark:text-emerald-300 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {statusMessage}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-xs sm:text-sm text-rose-800 dark:text-rose-300 font-medium flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Main Grid: Payment Form (Left) & Review / Security Approval (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* A. Payment Form */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-navy-900 dark:text-white">Send Money</h3>
          </div>

          <form onSubmit={handlePrepare} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Recipient or Merchant Name
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                required
                placeholder="e.g. Greenwood Residency Properties"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                required
                placeholder="merchant@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <select
                  value={merchantCategory}
                  onChange={(e) => setMerchantCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Rent">Rent &amp; Housing</option>
                  <option value="Utilities">Utilities &amp; Bills</option>
                  <option value="Electronics">Electronics &amp; Gear</option>
                  <option value="Education">Education &amp; Tuition</option>
                  <option value="General">General Services</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Source Account
              </label>
              <select
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {accounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.name} ({formatMoney(acc.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Purpose
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                placeholder="What is this payment for?"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition shadow-xs pt-3"
            >
              <span>Review Payment</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* B & C. Payment Review & Security Approval */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
          {!activePayment ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Prepare a payment request on the left to review details and authorize execution.
            </div>
          ) : (
            <>
              {/* Payment Summary */}
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-navy-900 dark:text-white">Payment Review</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Verify transaction details before confirming with your security PIN.
                    </p>
                  </div>
                  <div>{getStatusBadge(activePayment.status)}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium block">Recipient</span>
                    <span className="font-bold text-navy-900 dark:text-white text-sm block truncate">
                      {activePayment.recipientName}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block truncate">
                      {activePayment.recipientEmail}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium block">Source Account</span>
                    <span className="font-bold text-navy-900 dark:text-white text-sm block truncate">
                      {sourceAccount?.name || 'Primary Checking'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      Available: {formatMoney(sourceAccount?.balance)}
                    </span>
                  </div>
                </div>

                {/* Amount Breakdown Table */}
                <div className="mt-3 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Payment Amount:</span>
                    <span className="font-semibold text-navy-900 dark:text-white">
                      {!balancesVisible ? '••••••' : formatMoney(activePayment.amountInr || activePayment.amountUsd)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Processing Fee:</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">$0.00</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-sm font-bold text-navy-900 dark:text-white">
                    <span>Total Payable:</span>
                    <span>
                      {!balancesVisible ? '••••••' : formatMoney(activePayment.amountInr || activePayment.amountUsd)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Policy Evaluation Verdict */}
              {activePayment.guardianEvaluation && (
                <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                        Evaluated by Spending Rules
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 text-[11px] block">
                        Fits within single transaction limit and discretionary budget.
                      </span>
                    </div>
                  </div>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">Passed</span>
                </div>
              )}

              {/* C. Security Approval Panel */}
              {['pending_approval', 'guardian_approved'].includes(activePayment.status) && (
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <h4 className="text-xs font-bold text-navy-900 dark:text-white">Authorize Payment</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Enter your 4-digit security PIN to confirm and execute this transfer.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleAuthorizeAndExecute} className="flex flex-wrap items-center gap-3 pt-1">
                    <input
                      type="password"
                      maxLength={6}
                      placeholder="••••"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      required
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono tracking-widest w-36 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={busy || !pinInput}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-xs transition"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{busy ? 'Authorizing...' : 'Authorize & Pay'}</span>
                    </button>
                  </form>
                </div>
              )}

              {/* Action for order created */}
              {activePayment.status === 'paypal_order_created' && (
                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-blue-900 dark:text-blue-300 block">Buyer Approval Ready</span>
                    <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                      Complete final authorization in the PayPal window or confirm settlement.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activePayment.paypalApprovalUrl && (
                      <a
                        href={activePayment.paypalApprovalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl bg-[#003087] hover:bg-[#00256c] text-white font-bold transition flex items-center gap-1"
                      >
                        <span>Approve via PayPal</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleCaptureSettlement}
                      disabled={busy}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition"
                    >
                      Confirm Settlement
                    </button>
                  </div>
                </div>
              )}

              {/* Expandable Technical Security Details */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSecurityDetails(!showSecurityDetails)}
                  className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white flex items-center gap-1"
                >
                  <span>Security &amp; Audit Details</span>
                  {showSecurityDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {showSecurityDetails && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400 space-y-1 font-mono">
                    <div>Reference ID: {activePayment._id}</div>
                    {activePayment.paypalOrderId && <div>Order ID: {activePayment.paypalOrderId}</div>}
                    {activePayment.paypalCaptureId && <div>Capture ID: {activePayment.paypalCaptureId}</div>}
                    <div>Status: {activePayment.status}</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* D. Payment History Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-navy-900 dark:text-white">Payment History</h3>
          <span className="text-xs text-slate-400">{payments.length} Records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Recipient</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Amount</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {payments.map((p) => (
                <tr
                  key={p._id}
                  onClick={() => setInspectingPayment(p)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                >
                  <td className="py-3 px-3 text-slate-500">
                    {new Date(p.createdAt || Date.now()).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-3 px-3 font-semibold text-navy-900 dark:text-white">
                    {p.recipientName}
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                    {p.description}
                  </td>
                  <td className="py-3 px-3 font-bold text-navy-900 dark:text-white">
                    {!balancesVisible ? '••••••' : formatMoney(p.amountInr || p.amountUsd)}
                  </td>
                  <td className="py-3 px-3">{getStatusBadge(p.status)}</td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectingPayment(p);
                      }}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Inspection Modal */}
      {inspectingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-navy-900 dark:text-white">Transaction Details</h3>
              <button
                type="button"
                onClick={() => setInspectingPayment(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-navy-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Recipient</span>
                <span className="font-bold text-navy-900 dark:text-white">{inspectingPayment.recipientName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Recipient Email</span>
                <span className="text-slate-700 dark:text-slate-300">{inspectingPayment.recipientEmail}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Amount</span>
                <span className="font-bold text-navy-900 dark:text-white">
                  {formatMoney(inspectingPayment.amountInr || inspectingPayment.amountUsd)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Status</span>
                <span>{getStatusBadge(inspectingPayment.status)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Date</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {new Date(inspectingPayment.createdAt).toLocaleString()}
                </span>
              </div>
              {inspectingPayment.description && (
                <div className="py-1">
                  <span className="text-slate-400 block mb-0.5">Memo / Description</span>
                  <span className="text-slate-700 dark:text-slate-300">{inspectingPayment.description}</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingPayment(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
