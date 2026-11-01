import React, { useEffect, useState } from 'react';
import { Zap, ShieldCheck, Play, CheckCircle2, Clock } from 'lucide-react';
import { apiRequest } from '../lib/api';

export const AutomationsPage: React.FC = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [zapierStatus, setZapierStatus] = useState<any>(null);
  const [notice, setNotice] = useState('');

  const loadAutomations = async () => {
    const res = await apiRequest('/automations');
    setRules(res.rules || []);
    setExecutions(res.recentExecutions || []);
    setZapierStatus(res.zapierStatus || null);
  };

  useEffect(() => {
    loadAutomations();
  }, []);

  const handleToggleRule = async (rule: any) => {
    await apiRequest(`/automations/${rule._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    await loadAutomations();
  };

  const handleTestTrigger = async (rule: any) => {
    const res = await apiRequest(`/automations/${rule._id}/test`, { method: 'POST' });
    setNotice(
      `Triggered "${rule.name}" (${res.status}). Check your Notification bell or execution log below!`
    );
    await loadAutomations();
  };

  const handleRunDailyWorker = async () => {
    const res = await apiRequest('/workers/run-daily', { method: 'POST' });
    setNotice(
      `Executed Render Daily Background Workflow: Checked ${res.workerRun?.details?.totalCheckedMandates || 0} mandates and synced calendar reminders.`
    );
    await loadAutomations();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
            <Zap className="w-3.5 h-3.5" />
            AURA Automation Centre • Zapier MCP &amp; Render Background Workflows
          </span>
          <h2 className="text-xl font-bold text-navy-900 mt-2">
            Authorised Financial Workflow Automations
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {zapierStatus?.securityPolicy}
          </p>
        </div>

        <button
          onClick={handleRunDailyWorker}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold shrink-0"
        >
          <Clock className="w-3.5 h-3.5" />
          Run Render Daily Commitment Job Now
        </button>
      </div>

      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {notice}
          </span>
          <button onClick={() => setNotice('')} className="font-bold">
            OK
          </button>
        </div>
      )}

      {/* 5 Core Automations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((rule) => (
          <div
            key={rule._id}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-4"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 uppercase">
                  Channel: {rule.channel}
                </span>
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={() => handleToggleRule(rule)}
                    className="rounded border-slate-300"
                  />
                  <span className={rule.enabled ? 'text-emerald-700' : 'text-slate-400'}>
                    {rule.enabled ? 'Active' : 'Revoked / Paused'}
                  </span>
                </label>
              </div>
              <h3 className="text-base font-bold text-navy-900">{rule.name}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{rule.description}</p>
              <div className="text-[11px] text-slate-500 pt-1">
                <div><strong>Trigger:</strong> {rule.triggerDescription}</div>
                <div><strong>Action:</strong> {rule.actionDescription} ({rule.targetDestination})</div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Executed {rule.executionCount || 0} time(s)
              </span>
              <button
                onClick={() => handleTestTrigger(rule)}
                disabled={!rule.enabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-semibold"
              >
                <Play className="w-3 h-3" /> Test Automation
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Execution History Log */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-navy-900">Zapier MCP &amp; Notification Execution Log</h3>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" /> Zero Sensitive PII Dispatched
          </span>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {executions.length === 0 ? (
            <div className="py-4 text-slate-500">No external executions recorded in this session yet.</div>
          ) : (
            executions.map((ex) => (
              <div key={ex.executionId} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-navy-900">{ex.sanitizedPayloadSummary}</span>
                  <span className="text-slate-400 ml-2">({ex.automationType})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                    {ex.status}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {new Date(ex.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
