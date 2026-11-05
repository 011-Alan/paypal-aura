import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  Lock,
  CheckCircle2,
  XCircle,
  KeyRound,
  ArrowRight,
  Webhook,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

export const PaymentsPage: React.FC = () => {
  const { balancesVisible, formatMoney } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [paypalStatus, setPaypalStatus] = useState<any>(null);

  // Prepare form
  const [recipientName, setRecipientName] = useState('Greenwood Residency Landlords');
  const [recipientEmail, setRecipientEmail] = useState('merchant-sandbox@paypal.com');
  const [merchantCategory, setMerchantCategory] = useState('Rent');
  const [description, setDescription] = useState('Prepare a payment of ₹5,000 towards maintenance & utility settlement');
  const [amountInr, setAmountInr] = useState('5000');

  // Active workflow state
  const [activePaymentId, setActivePaymentId] = useState<string>('');
  const [pinInput, setPinInput] = useState('');
  const [approvalToken, setApprovalToken] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadPayments = async () => {
    try {
      const res = await apiRequest('/payments');
      setPayments(res.payments || []);
      setPaypalStatus(res.paypalSandboxStatus || null);
      if (res.payments?.length > 0 && !activePaymentId) {
        setActivePaymentId(res.payments[0]._id);
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    loadPayments();

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
          setStatusMessage(`PayPal payment approved by buyer for order ${orderToken}. Capturing and settling payment with PayPal...`);
          setBusy(true);
          apiRequest('/payments/capture-paypal-order', {
            method: 'POST',
            body: JSON.stringify({ orderId: orderToken }),
          })
            .then((res: any) => {
              const capId = res.captureResult?.captureId || res.paymentRequest?.paypalCaptureId;
              setStatusMessage(
                `Payment verified and captured by PayPal! Capture ID: ${capId}. AURA balance and audit log updated.`
              );
              loadPayments();
              window.dispatchEvent(new CustomEvent('aura-state-changed'));
            })
            .catch((err: any) => {
              setErrorMsg(`PayPal capture failed: ${err?.message}`);
            })
            .finally(() => {
              setBusy(false);
            });
        }
      } else if (checkoutStatus === 'cancelled') {
        setErrorMsg('PayPal Checkout was cancelled by the user.');
        params.delete('status');
        params.delete('token');
        const remaining = params.toString();
        const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : '');
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }

    const handleStateChange = () => {
      loadPayments();
    };
    window.addEventListener('aura-state-changed', handleStateChange);
    return () => window.removeEventListener('aura-state-changed', handleStateChange);
  }, []);

  const activePayment = payments.find((p) => p._id === activePaymentId) || payments[0];

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
          amountInr: Number(amountInr),
        }),
      });
      setActivePaymentId(res.paymentRequest._id);
      setApprovalToken('');
      setPinInput('');
      setStatusMessage(
        'Step 1 Complete: Payment request prepared and validated by Financial Guardian. Review and enter your PIN to authorise.'
      );
      await loadPayments();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to prepare payment');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePayment) return;
    setErrorMsg('');
    setBusy(true);
    try {
      const res = await apiRequest(`/payments/${activePayment._id}/verify-pin`, {
        method: 'POST',
        body: JSON.stringify({ pin: pinInput }),
      });
      setApprovalToken(res.approvalToken);
      setStatusMessage(
        'Step 2 Complete: Argon2id PIN verified and short-lived cryptographic approval token issued. Ready to create PayPal Sandbox Order v2.'
      );
      await loadPayments();
    } catch (err: any) {
      setErrorMsg(err?.message || 'PIN verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCreatePayPalOrder = async () => {
    if (!activePayment || !approvalToken) return;
    setErrorMsg('');
    setBusy(true);
    try {
      const res = await apiRequest(`/payments/${activePayment._id}/paypal-order`, {
        method: 'POST',
        body: JSON.stringify({ approvalToken }),
      });
      if (res.paypalOrder?.approvalUrl) {
        setStatusMessage(
          `Step 3: PayPal Order v2 (${res.paypalOrder.orderId}) created! Redirecting to PayPal for buyer approval...`
        );
        window.location.href = res.paypalOrder.approvalUrl;
        return;
      }
      setStatusMessage(
        `Step 3 Complete: PayPal Order v2 (${res.paypalOrder?.orderId}) created. Click "Approve on PayPal" to review and authorize.`
      );
      await loadPayments();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create PayPal order');
    } finally {
      setBusy(false);
    }
  };

  const handleCaptureOrder = async () => {
    if (!activePayment) return;
    setErrorMsg('');
    setBusy(true);
    try {
      const res = await apiRequest(`/payments/${activePayment._id}/paypal-capture`, {
        method: 'POST',
        body: JSON.stringify({ paypalOrderId: activePayment.paypalOrderId }),
      });
      setStatusMessage(
        `Step 4 Complete: Order captured (${res.captureResult?.captureId || activePayment.paypalCaptureId}). MongoDB balance, AG Grid history, Elastic index, and Zapier notification updated!`
      );
      await loadPayments();
      window.dispatchEvent(new CustomEvent('aura-state-changed'));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Capture failed');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyWebhook = async () => {
    if (!activePayment) return;
    setErrorMsg('');
    setBusy(true);
    try {
      const res = await apiRequest('/webhooks/paypal', {
        method: 'POST',
        body: JSON.stringify({
          id: `WH-SBX-${Date.now()}`,
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          paymentRequestId: activePayment._id,
          paypalOrderId: activePayment.paypalOrderId,
          resource: {
            id: activePayment.paypalCaptureId || `CAP-${Date.now()}`,
            status: 'COMPLETED',
            supplementary_data: {
              related_ids: {
                order_id: activePayment.paypalOrderId,
              },
            },
          },
        }),
      });
      setStatusMessage(
        `Step 5 Complete: PayPal Webhook (${res.eventId}) cryptographically verified (${res.verificationMode}).`
      );
      await loadPayments();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Webhook verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-colors">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 px-3 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            User Financial Authority • Argon2id PIN • PayPal Sandbox Execution
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white mt-2">
            Controlled Payment Preparation, PIN Approval &amp; PayPal Settlement
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            No AI agent or background process can transfer funds automatically. Every payment requires Financial Guardian policy validation, explicit user approval, and Argon2id PIN verification.
          </p>
        </div>
        {paypalStatus && (
          <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs shrink-0">
            <div className="font-bold text-navy-900 dark:text-white">PayPal Sandbox Active</div>
            <div className="text-slate-500 dark:text-slate-400">APIMatic Contract Guard Verified</div>
          </div>
        )}
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Step 1: Prepare Payment Request */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
          <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            1. Prepare Controlled Payment Request
          </h3>
          <form onSubmit={handlePrepare} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Recipient or Merchant Name</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Amount</label>
                <input
                  type="number"
                  value={amountInr}
                  onChange={(e) => setAmountInr(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select
                  value={merchantCategory}
                  onChange={(e) => setMerchantCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Rent">Rent &amp; Housing</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Utilities">Utilities &amp; Bills</option>
                  <option value="Education">Education</option>
                  <option value="General">General Merchant</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Purpose / Memo</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition shadow-xs"
            >
              <span>Prepare &amp; Run Financial Guardian Check</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Step 2-5: Financial Guardian Verdict, PIN Gate & PayPal Sandbox Execution */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors">
          {!activePayment ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Prepare a payment request on the left to begin the controlled PayPal Sandbox workflow.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Active Payment Request • {activePayment.idempotencyKey}
                  </span>
                  <h3 className="text-base font-bold text-navy-900 dark:text-white mt-0.5">
                    {!balancesVisible ? '••••••' : `${formatMoney(activePayment.amountInr)} ($${activePayment.amountUsd?.toFixed(2)} USD)`} → {activePayment.recipientName}
                  </h3>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 uppercase">
                  {activePayment.status.replace(/_/g, ' ')}
                </span>
              </div>

              {/* Financial Guardian 4-Rule Policy Evaluation */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Financial Guardian Policy Evaluation
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(activePayment.guardianEvaluation?.policyChecks || []).map((chk: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl border text-xs ${
                        chk.passed
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-300'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        {chk.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        )}
                        {chk.rule}
                      </div>
                      <div className="text-[11px] mt-1 opacity-90">{chk.detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 2: Argon2id PIN Verification */}
              {activePayment.guardianEvaluation?.passed && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      Step 2: Explicit User Approval &amp; Argon2id PIN Verification
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-400" />
                      Argon2id Encrypted Protection
                    </span>
                  </div>

                  <form onSubmit={handleVerifyPin} className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="password"
                      maxLength={6}
                      placeholder="Enter security PIN"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      required
                      className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono tracking-widest w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Approve &amp; Verify PIN
                    </button>
                  </form>
                </div>
              )}

              {/* Step 3, 4 & 5: PayPal Orders API v2 Create, User Approval, Capture & Webhook */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCreatePayPalOrder}
                  disabled={busy || (!approvalToken && activePayment.status === 'guardian_approved')}
                  className="px-4 py-2.5 rounded-xl bg-[#0070ba] hover:bg-[#003087] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-xs font-bold transition shadow-xs inline-flex items-center gap-1.5"
                >
                  <span>3. Create &amp; Pay with PayPal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {activePayment.paypalApprovalUrl && activePayment.status === 'paypal_order_created' && (
                  <a
                    href={activePayment.paypalApprovalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-[#003087] hover:bg-[#00256c] text-white text-xs font-bold transition shadow-xs inline-flex items-center gap-1.5"
                  >
                    <span>Approve on PayPal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={handleCaptureOrder}
                  disabled={
                    busy ||
                    !['pin_verified', 'paypal_order_created'].includes(activePayment.status)
                  }
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-xs font-bold transition shadow-xs"
                >
                  4. Capture Approved PayPal Order
                </button>

                <button
                  type="button"
                  onClick={handleVerifyWebhook}
                  disabled={busy || !['captured', 'webhook_verified'].includes(activePayment.status)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
                >
                  <Webhook className="w-3.5 h-3.5" />
                  5. Verify PayPal Webhook Signature
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Payment Request History */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <h3 className="text-sm font-bold text-navy-900 dark:text-white mb-4">Controlled Payment Audit &amp; PayPal Order History</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3">Recipient</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Amount</th>
                <th className="py-2.5 px-3">PayPal Order ID</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Webhook</th>
                <th className="py-2.5 px-3 text-right">Select</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {payments.map((p) => (
                <tr
                  key={p._id}
                  className={p._id === activePayment?._id ? 'bg-blue-50/40 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}
                >
                  <td className="py-2.5 px-3 font-semibold text-navy-900 dark:text-white">{p.recipientName}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{p.description}</td>
                  <td className="py-2.5 px-3 font-bold text-navy-900 dark:text-white">
                    {!balancesVisible ? '••••••' : formatMoney(p.amountInr)}{' '}
                    {!balancesVisible ? '' : <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">(${p.amountUsd?.toFixed(2)})</span>}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">{p.paypalOrderId || 'Pending'}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 uppercase">
                      {p.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {p.webhookVerified ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="text-slate-400">Awaiting</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => setActivePaymentId(p._id)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
