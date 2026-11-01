import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Server,
  RotateCcw,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatInr } from '../lib/api';

export const SettingsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [integrations, setIntegrations] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Policy state
  const [singleLimit, setSingleLimit] = useState('75000');
  const [dailyLimit, setDailyLimit] = useState('100000');
  const [discretionaryCap, setDiscretionaryCap] = useState('18000');
  const [pinThreshold, setPinThreshold] = useState('1000');

  // PIN rotation
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadSettingsData = async () => {
    const [intRes, auditRes] = await Promise.all([
      apiRequest('/integrations/status'),
      apiRequest('/audit-logs'),
    ]);
    setIntegrations(intRes.integrations || {});
    setAuditLogs(auditRes.logs || []);
  };

  useEffect(() => {
    if (user) {
      setSingleLimit(String(user.financialPolicy.singleTransactionLimit));
      setDailyLimit(String(user.financialPolicy.dailySpendingLimit));
      setDiscretionaryCap(String(user.financialPolicy.discretionaryMonthlyCap));
      setPinThreshold(String(user.financialPolicy.requirePinAboveAmount));
    }
    loadSettingsData();
  }, [user]);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiRequest('/profile/policy', {
        method: 'PUT',
        body: JSON.stringify({
          singleTransactionLimit: Number(singleLimit),
          dailySpendingLimit: Number(dailyLimit),
          discretionaryMonthlyCap: Number(discretionaryCap),
          requirePinAboveAmount: Number(pinThreshold),
        }),
      });
      await refreshUser();
      await loadSettingsData();
      setMsg('Financial Permission Policy updated and enforced by Financial Guardian.');
    } catch (error: any) {
      setErr(error?.message || 'Failed to update policy');
    }
  };

  const handleRotatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      const res = await apiRequest('/profile/pin', {
        method: 'PUT',
        body: JSON.stringify({ currentPin, newPin }),
      });
      setCurrentPin('');
      setNewPin('');
      setMsg(res.message);
      await loadSettingsData();
    } catch (error: any) {
      setErr(error?.message || 'Failed to rotate PIN');
    }
  };

  const handleResetDemo = async () => {
    await apiRequest('/seed/reset', { method: 'POST' });
    await refreshUser();
    await loadSettingsData();
    setMsg('Demo user Alex Sharma & family baseline data restored.');
  };

  const integrationList = integrations
    ? [
        integrations.agGrid,
        integrations.apimatic,
        integrations.astropods,
        integrations.bryntum,
        integrations.channel3,
        integrations.elastic,
        integrations.kernel,
        integrations.paypal,
        integrations.render,
        integrations.zapier,
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-navy-900">
            Security Policies, Argon2id PIN &amp; Ecosystem Status
          </h2>
          <p className="text-xs text-slate-500">
            Configure your Financial Guardian permission boundaries, rotate your payment PIN, and inspect integration health.
          </p>
        </div>
        <button
          onClick={handleResetDemo}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Alex Demo Story Data
        </button>
      </div>

      {msg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-semibold">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financial Permission Policy */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Financial Guardian Permission Policy
          </h3>
          <form onSubmit={handleSavePolicy} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Single Transaction Limit (₹)</label>
                <input
                  type="number"
                  value={singleLimit}
                  onChange={(e) => setSingleLimit(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Daily Spending Cap (₹)</label>
                <input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Monthly Discretionary Cap (₹)</label>
                <input
                  type="number"
                  value={discretionaryCap}
                  onChange={(e) => setDiscretionaryCap(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Require PIN Above (₹)</label>
                <input
                  type="number"
                  value={pinThreshold}
                  onChange={(e) => setPinThreshold(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              Save Financial Permission Policy
            </button>
          </form>
        </div>

        {/* Argon2id Security PIN Rotation */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-600" />
            Rotate Argon2id Payment Security PIN
          </h3>
          <p className="text-xs text-slate-500">
            Your payment PIN is hashed with Argon2id (19 MiB memory cost) and is never stored in plaintext or sent to AI models.
          </p>
          <form onSubmit={handleRotatePin} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Current PIN (Default: 4826)</label>
                <input
                  type="password"
                  maxLength={6}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">New 4–6 Digit PIN</label>
                <input
                  type="password"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white font-semibold"
            >
              Rotate Security PIN
            </button>
          </form>
        </div>
      </div>

      {/* Live Sponsor & Ecosystem Integration Status Matrix */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-600" />
              AURA Integration Layer Health &amp; Responsibility Matrix
            </h3>
            <p className="text-xs text-slate-500">
              Live status of all 10 sponsor technologies and PayPal Sandbox execution layer
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {integrationList.map((item: any, idx: number) => (
            <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-navy-900">{item?.technology}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              </div>
              <div className="text-slate-600">{item?.intendedResponsibility}</div>
              <div className="text-[11px] text-blue-700 font-mono">{item?.status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Audit Log */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          Recent Security &amp; Financial Guardian Audit Log
        </h3>
        <div className="divide-y divide-slate-100 text-xs max-h-72 overflow-y-auto">
          {auditLogs.map((log) => (
            <div key={log._id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold text-navy-900">{log.action}</span>
                <span className="text-slate-500 ml-2">
                  Actor: {log.actor} • Resource: {log.resourceType}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    log.status === 'blocked'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {log.status}
                </span>
                <span className="text-slate-400 font-mono">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
