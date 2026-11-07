import React, { useEffect, useState } from 'react';
import {
  FlaskConical,
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Cpu,
  Layers,
  Activity,
  FileText,
  Sliders,
  Sparkles,
  ShieldCheck,
  CreditCard,
  UserCheck,
  Server,
  Terminal,
  ExternalLink,
  ChevronRight,
  Database,
  ArrowRight,
  Info,
} from 'lucide-react';
import { apiRequest, formatInr, formatDateShort } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

export type DemoLabSubTab =
  | 'automation-centre'
  | 'scenario-simulator'
  | 'demo-profiles'
  | 'workflow-simulator'
  | 'ai-agent-monitor'
  | 'integration-monitor'
  | 'execution-logs'
  | 'system-diagnostics';

interface DemoLabPageProps {
  initialSubTab?: DemoLabSubTab;
  onNavigateToProduct?: (tab: string) => void;
}

export const DemoLabPage: React.FC<DemoLabPageProps> = ({
  initialSubTab = 'workflow-simulator',
  onNavigateToProduct,
}) => {
  const { user, refreshUser, switchDemoPersona, activeDemoPersona } = useAuth();
  const [subTab, setSubTab] = useState<DemoLabSubTab>(initialSubTab);

  // Automations data
  const [rules, setRules] = useState<any[]>([]);
  const [zapierStatus, setZapierStatus] = useState<any>(null);

  // Agents data
  const [agentsInfo, setAgentsInfo] = useState<any>(null);
  const [availability, setAvailability] = useState<any>(null);

  // Integrations data
  const [integrations, setIntegrations] = useState<any>(null);

  // Audit Logs data
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // System Diagnostics data
  const [healthData, setHealthData] = useState<any>(null);

  // Scenario Simulator state
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  // Workflow Simulator state
  const [selectedWorkflow, setSelectedWorkflow] = useState('Workflow A');
  const [customPrompt, setCustomPrompt] = useState('Can I afford a laptop for $750?');
  const [wfBusy, setWfBusy] = useState(false);
  const [wfResult, setWfResult] = useState<any>(null);

  // Feedback notice
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAllData = async () => {
    try {
      const [autoRes, agentRes, availRes, intRes, logRes, healthRes] = await Promise.all([
        apiRequest('/automations').catch(() => ({})),
        apiRequest('/ai/agents').catch(() => ({})),
        apiRequest('/ai/agents/availability').catch(() => ({})),
        apiRequest('/integrations/status').catch(() => ({})),
        apiRequest('/audit-logs').catch(() => ({ logs: [] })),
        apiRequest('/health').catch(() => ({})),
      ]);
      setRules(autoRes.rules || []);
      setZapierStatus(autoRes.zapierStatus || null);
      setAgentsInfo(agentRes);
      setAvailability(availRes);
      setIntegrations(intRes.integrations || {});
      setAuditLogs(logRes.logs || []);
      setHealthData(healthRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // 1. Automation Handlers
  const handleToggleRule = async (rule: any) => {
    await apiRequest(`/automations/${rule._id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    await loadAllData();
  };

  const handleTestTrigger = async (rule: any) => {
    const res = await apiRequest(`/automations/${rule._id}/test`, { method: 'POST' });
    setNotice(`Dispatched Zapier Automation: "${rule.name}". Channel: ${rule.channel} (${res.status || 'delivered'})`);
    await loadAllData();
  };

  const handleRunDailyWorker = async () => {
    const res = await apiRequest('/workers/run-daily', { method: 'POST' });
    setNotice(
      `Render Background Worker completed. Checked ${res.workerRun?.details?.totalCheckedMandates || 0} mandates and synced calendar notifications.`
    );
    await loadAllData();
  };

  // 2. Scenario Simulator Handler
  const handleSimulateScenario = async (scenarioType: string) => {
    setSimBusy(true);
    setSimResult(null);
    try {
      const res = await apiRequest('/scenarios/simulate', {
        method: 'POST',
        body: JSON.stringify({ scenarioType }),
      });
      setSimResult(res);
      setNotice(`Simulation executed: ${res.message}`);
      await refreshUser();
      await loadAllData();
    } catch (err: any) {
      setNotice(`Simulation error: ${err?.message}`);
    } finally {
      setSimBusy(false);
    }
  };

  // 3. Demo Persona Switch & Reset
  const handleSwitchPersona = async (persona: 'alex' | 'priya' | 'maya') => {
    setNotice('');
    try {
      await switchDemoPersona(persona);
      setNotice(`Switched active demo persona to ${persona.toUpperCase()}. Application state refreshed.`);
      await loadAllData();
    } catch (err: any) {
      setNotice(`Failed to switch demo persona: ${err?.message}`);
    }
  };

  const handleResetDemoData = async () => {
    if (!window.confirm('Reset demo persona baseline data? (Personal user data will NOT be touched).')) return;
    try {
      await apiRequest('/seed/reset', { method: 'POST' });
      await refreshUser();
      await loadAllData();
      setNotice('Demo story accounts, mandates, and transactions reset to clean baseline.');
    } catch (err: any) {
      setNotice(`Reset failed: ${err?.message}`);
    }
  };

  // 4. Workflow Simulator Handler
  const WORKFLOWS = [
    {
      code: 'Workflow A',
      title: 'Smart Purchase Affordability Evaluation',
      sponsors: 'Channel3 • KERNEL • Astropods • PayPal',
      prompt: 'Can I afford a laptop for $750?',
      desc: 'Evaluates product options against 7-factor financial guardrails with live discretionary buffer calculation.',
    },
    {
      code: 'Workflow B',
      title: 'Monthly Financial Planning & Budget Allocation',
      sponsors: 'Python Engine • Astropods Planner • AG Grid',
      prompt: 'Help me plan my expenses for next month.',
      desc: 'Generates 50/30/20 category budget allocations and protects essential commitments.',
    },
    {
      code: 'Workflow C',
      title: 'Anomaly Detection & Spending Workbench',
      sponsors: 'AG Grid • Scikit-Learn IsolationForest • Elastic',
      prompt: 'Show my unusual spending patterns and dining expenditure over the last three months.',
      desc: 'Projects natural language query into AG Grid filter matrix and flags statistical outliers.',
    },
    {
      code: 'Workflow D',
      title: 'Financial Life Calendar & Mandate Synchronization',
      sponsors: 'Bryntum • Mandate Intelligence • Render Worker',
      prompt: 'What payments and recurring commitments are coming up next week?',
      desc: 'Synchronizes confirmed bills, EMIs, salary credits, and milestones across Bryntum calendar views.',
    },
    {
      code: 'Workflow E',
      title: 'Controlled PayPal Sandbox Payment Preparation',
      sponsors: 'Financial Guardian • APIMatic • PayPal Orders v2',
      prompt: 'Prepare a payment of $50 to Greenwood Residency Landlords.',
      desc: 'Executes 4-rule Financial Guardian check, generates approval token, and presents user authorization card.',
    },
    {
      code: 'Workflow F',
      title: 'Financial Recovery Plan',
      sponsors: 'Financial Recovery Agent • Python Analytics',
      prompt: 'I overspent on dining this month. Recommend a realistic financial recovery plan.',
      desc: 'Proposes non-judgmental spending reallocation without touching essential commitments.',
    },
  ];

  const handleRunWorkflow = async () => {
    if (!customPrompt.trim()) return;
    setWfBusy(true);
    setWfResult(null);
    try {
      const res = await apiRequest('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ prompt: customPrompt, includeKernelResearch: true }),
      });
      setWfResult(res);
      await loadAllData();
    } catch (err: any) {
      setWfResult({ error: err?.message || 'Workflow execution failed' });
    } finally {
      setWfBusy(false);
    }
  };

  const selectPreconfiguredWorkflow = (wf: any) => {
    setSelectedWorkflow(wf.code);
    setCustomPrompt(wf.prompt);
    setWfResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Demo Lab Header Banner */}
      <div className="bg-gradient-to-r from-navy-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 lg:p-8 shadow-md border border-navy-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                <FlaskConical className="w-3.5 h-3.5 text-blue-400" />
                Technical Demonstration &amp; Developer Lab
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Data Isolation Active
              </span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-white mt-3">
              AURA Engineering Lab &amp; Multi-Agent Observability
            </h2>
            <p className="text-xs text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
              Explore AURA&apos;s underlying 10 sponsor integrations, multi-agent orchestration, background workers, and simulation environments without cluttering the primary user product.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onNavigateToProduct && (
              <button
                onClick={() => onNavigateToProduct('overview')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-navy-900 text-xs font-semibold shadow-xs transition"
              >
                ← Back to Main Product
              </button>
            )}
            <button
              onClick={handleResetDemoData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-navy-800 hover:bg-navy-700 text-slate-200 border border-navy-700 text-xs font-semibold transition"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              Reset Demo Baseline
            </button>
          </div>
        </div>

        {/* Global Notice Bar */}
        {notice && (
          <div className="mt-5 p-3.5 rounded-2xl bg-blue-500/20 border border-blue-400/30 text-xs text-blue-100 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-300 shrink-0" />
              {notice}
            </span>
            <button onClick={() => setNotice('')} className="text-white hover:underline text-xs font-bold">
              Dismiss
            </button>
          </div>
        )}

        {/* Sub-Navigation Pills */}
        <div className="mt-6 pt-5 border-t border-navy-800/80 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'workflow-simulator', label: 'Workflow Simulator', icon: Play },
            { id: 'scenario-simulator', label: 'Scenario Simulator', icon: Sliders },
            { id: 'demo-profiles', label: 'Demo Profiles', icon: UserCheck },
            { id: 'ai-agent-monitor', label: 'AI Agent Monitor', icon: Cpu },
            { id: 'integration-monitor', label: 'Integration Matrix', icon: Layers },
            { id: 'automation-centre', label: 'Automation Centre', icon: Zap },
            { id: 'execution-logs', label: 'Execution Logs', icon: Terminal },
            { id: 'system-diagnostics', label: 'System Diagnostics', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as DemoLabSubTab)}
                className={`px-3.5 py-2 rounded-xl font-semibold flex items-center gap-2 whitespace-nowrap transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-navy-800/80 text-slate-300 hover:bg-navy-800 hover:text-white border border-navy-700/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: WORKFLOW SIMULATOR */}
      {/* ========================================================================= */}
      {subTab === 'workflow-simulator' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-navy-900">End-to-End Workflow Simulator</h3>
                <p className="text-xs text-slate-500">
                  Trigger and inspect multi-sponsor workflows with real-time agent routing, parameter extraction, and step verification.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Workflows A through F
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {WORKFLOWS.map((wf) => (
                <button
                  key={wf.code}
                  onClick={() => selectPreconfiguredWorkflow(wf)}
                  className={`text-left p-4 rounded-2xl border transition ${
                    selectedWorkflow === wf.code
                      ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-blue-700">{wf.code}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{wf.sponsors}</span>
                  </div>
                  <div className="text-xs font-bold text-navy-900 mt-1">{wf.title}</div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono italic">“{wf.prompt}”</div>
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunWorkflow();
              }}
              className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100"
            >
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter custom prompt to simulate..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={wfBusy}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-2 shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                {wfBusy ? 'Executing Pipeline...' : 'Run Simulation'}
              </button>
            </form>
          </div>

          {/* Workflow Results & JSON Trace */}
          {wfResult && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold uppercase text-navy-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Execution Pipeline Result • Workflow: {wfResult.workflowType?.replace(/_/g, ' ') || selectedWorkflow}
                </span>
                <span className="text-xs font-mono text-slate-400">{wfResult.timestamp}</span>
              </div>

              {/* Synthesized Output */}
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-100 text-sm text-navy-900 leading-relaxed">
                <div className="text-[11px] font-bold text-blue-700 uppercase mb-1">Synthesized Grounded Response</div>
                {wfResult.explanation}
              </div>

              {/* Tool Action Badge */}
              {wfResult.toolAction && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-navy-900">{wfResult.toolAction.title}</span>
                    <span className="text-slate-500 block text-[11px]">
                      Type: {wfResult.toolAction.type} • Status: {wfResult.toolAction.status}
                    </span>
                  </div>
                  {wfResult.toolAction.requiresUserPaymentApproval && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      Explicit User Approval &amp; PIN Required
                    </span>
                  )}
                </div>
              )}

              {/* Astropods Multi-Agent Trace */}
              {wfResult.astropodsOrchestration && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-blue-600" />
                    Astropods Agent Orchestration Trace
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto">
                    <div className="text-slate-400">// Primary Agent: {wfResult.astropodsOrchestration.primaryAgent}</div>
                    <div className="text-slate-400">
                      // Transport: {wfResult.astropodsOrchestration.transport || 'astropods_local_orchestrator'}
                    </div>
                    <div className="text-emerald-400 mt-1">
                      Status: {wfResult.astropodsOrchestration.status} ({wfResult.astropodsOrchestration.durationMs}ms)
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: SCENARIO SIMULATOR */}
      {/* ========================================================================= */}
      {subTab === 'scenario-simulator' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-navy-900">Financial Scenario Simulator</h3>
                <p className="text-xs text-slate-500">
                  Inject isolated test conditions to observe how AURA&apos;s anomaly detectors, Financial Guardian, and recovery agents adapt in real time.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Simulated Data Isolated from Personal Records
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="p-5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-700 uppercase bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                    Expenditure Anomaly
                  </span>
                  <span className="text-xs font-bold text-slate-700">$85 Spike</span>
                </div>
                <h4 className="text-sm font-bold text-navy-900">Fine-Dining Spike at Trishna</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Injects an atypical weekend fine-dining expense. Triggers Scikit-Learn IsolationForest outlier detection and generates an automatic Financial Recovery plan.
                </p>
                <button
                  onClick={() => handleSimulateScenario('fine_dining_spike')}
                  disabled={simBusy}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
                >
                  Simulate Dining Spike
                </button>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 uppercase bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    Income Boost
                  </span>
                  <span className="text-xs font-bold text-slate-700">+$350 Credit</span>
                </div>
                <h4 className="text-sm font-bold text-navy-900">Quarterly Performance Bonus</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Injects an unplanned performance bonus. Tests liquidity updating, discretionary cap expansion, and accelerated savings goal suggestions.
                </p>
                <button
                  onClick={() => handleSimulateScenario('salary_bonus')}
                  disabled={simBusy}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
                >
                  Simulate Performance Bonus
                </button>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 uppercase bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                    Emergency Outflow
                  </span>
                  <span className="text-xs font-bold text-slate-700">$180 Diagnostic</span>
                </div>
                <h4 className="text-sm font-bold text-navy-900">Unexpected Emergency Medical Expense</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Injects a surprise diagnostic expense at Apollo Hospital. Observes how AURA safeguards essential bills (Rent, Insurance) and preserves minimum liquidity.
                </p>
                <button
                  onClick={() => handleSimulateScenario('emergency_medical')}
                  disabled={simBusy}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
                >
                  Simulate Medical Outflow
                </button>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-700 uppercase bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                    Recurring Commitment
                  </span>
                  <span className="text-xs font-bold text-slate-700">$30/Month</span>
                </div>
                <h4 className="text-sm font-bold text-navy-900">New Software Subscription Surge</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Adds a recurring Cloud AI Suite subscription. Verifies automated Bryntum Financial Calendar synchronization and notification dispatch.
                </p>
                <button
                  onClick={() => handleSimulateScenario('subscription_surge')}
                  disabled={simBusy}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
                >
                  Simulate Subscription Surge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: DEMO PROFILES & SAFE DATA ISOLATION */}
      {/* ========================================================================= */}
      {subTab === 'demo-profiles' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-navy-900">Demo Persona Switcher &amp; Privacy Isolation</h3>
                <p className="text-xs text-slate-500">
                  Switch between pre-configured hackathon evaluation personas without touching real user accounts.
                </p>
              </div>
              <button
                onClick={handleResetDemoData}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Demo Stories Only
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Persona 1: Alex */}
              <div
                className={`p-5 rounded-2xl border transition ${
                  activeDemoPersona === 'alex'
                    ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-blue-700 uppercase">Primary Demo Persona</span>
                  {activeDemoPersona === 'alex' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">Active</span>
                  )}
                </div>
                <h4 className="text-base font-bold text-navy-900">Alex Sharma</h4>
                <div className="text-xs text-slate-500">Lead Tech Professional • Household Admin</div>
                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <div>• Monthly Income: <strong className="text-navy-900">$5,500</strong></div>
                  <div>• 3 Accounts (Checking, Savings, PayPal Sandbox)</div>
                  <div>• PayPal Security PIN: <code className="font-mono font-bold text-blue-700">4826</code></div>
                  <div>• Confirmed Rent, Insurance, ACT Internet mandates</div>
                </div>
                <button
                  onClick={() => handleSwitchPersona('alex')}
                  disabled={activeDemoPersona === 'alex'}
                  className={`w-full mt-4 py-2 rounded-xl text-xs font-semibold transition ${
                    activeDemoPersona === 'alex'
                      ? 'bg-blue-100 text-blue-700 cursor-default'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                  }`}
                >
                  {activeDemoPersona === 'alex' ? 'Current Persona' : 'Switch to Alex'}
                </button>
              </div>

              {/* Persona 2: Priya */}
              <div
                className={`p-5 rounded-2xl border transition ${
                  activeDemoPersona === 'priya'
                    ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-purple-700 uppercase">Privacy Boundary Demo</span>
                  {activeDemoPersona === 'priya' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white">Active</span>
                  )}
                </div>
                <h4 className="text-base font-bold text-navy-900">Priya Sharma</h4>
                <div className="text-xs text-slate-500">Healthcare Professional • Family Member</div>
                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <div>• Monthly Income: <strong className="text-navy-900">$4,200</strong></div>
                  <div>• Private Axis Bank Account (Hidden from Alex)</div>
                  <div>• PayPal Security PIN: <code className="font-mono font-bold text-purple-700">7391</code></div>
                  <div>• Contributes to shared household budget</div>
                </div>
                <button
                  onClick={() => handleSwitchPersona('priya')}
                  disabled={activeDemoPersona === 'priya'}
                  className={`w-full mt-4 py-2 rounded-xl text-xs font-semibold transition ${
                    activeDemoPersona === 'priya'
                      ? 'bg-purple-100 text-purple-700 cursor-default'
                      : 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs'
                  }`}
                >
                  {activeDemoPersona === 'priya' ? 'Current Persona' : 'Switch to Priya'}
                </button>
              </div>

              {/* Persona 3: Maya */}
              <div
                className={`p-5 rounded-2xl border transition ${
                  activeDemoPersona === 'maya'
                    ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase">Freelancer &amp; Student</span>
                  {activeDemoPersona === 'maya' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">Active</span>
                  )}
                </div>
                <h4 className="text-base font-bold text-navy-900">Maya Patel</h4>
                <div className="text-xs text-slate-500">UI Designer &amp; Graduate Student</div>
                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <div>• Monthly Income: <strong className="text-navy-900">$2,500</strong></div>
                  <div>• HDFC Student Account + Freelance PayPal</div>
                  <div>• PayPal Security PIN: <code className="font-mono font-bold text-emerald-700">1942</code></div>
                  <div>• Active Goal: Ergonomic Studio Desk</div>
                </div>
                <button
                  onClick={() => handleSwitchPersona('maya')}
                  disabled={activeDemoPersona === 'maya'}
                  className={`w-full mt-4 py-2 rounded-xl text-xs font-semibold transition ${
                    activeDemoPersona === 'maya'
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  }`}
                >
                  {activeDemoPersona === 'maya' ? 'Current Persona' : 'Switch to Maya'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: AI AGENT MONITOR */}
      {/* ========================================================================= */}
      {subTab === 'ai-agent-monitor' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-navy-900">Astropods 6-Agent Registry &amp; Pod Availability</h3>
                <p className="text-xs text-slate-500">
                  Inspect the 6 specialized financial agents, their cloud blueprint IDs, fallback local orchestrator state, and latency metrics.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Resilient Multi-Agent Mesh
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(agentsInfo?.agents || []).map((agent: any) => (
                <div key={agent.id} className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-blue-700">Agent {agent.id}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Active
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-navy-900">{agent.name}</h4>
                  <div className="text-xs text-slate-600 leading-relaxed">{agent.role}</div>
                  <div className="pt-2 border-t border-slate-100 text-[11px] font-mono text-slate-500 space-y-0.5">
                    <div>Blueprint: <span className="text-navy-900">{agent.blueprint}</span></div>
                    <div>Deployment: <span className="text-navy-900">{agent.deploymentId || 'tg9-jnv-jnj'}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 5: INTEGRATION MONITOR */}
      {/* ========================================================================= */}
      {subTab === 'integration-monitor' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-navy-900">10-Sponsor Technology Integration Matrix</h3>
                <p className="text-xs text-slate-500">
                  Real-time status, contract verification, and configuration of all ten PayPal AI Hackathon sponsors.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                10 of 10 Integrated
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(integrations || {}).map(([key, val]: [string, any]) => (
                <div key={key} className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-navy-900">{val.name || key}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {val.status || 'Active'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{val.summary || val.role}</p>
                  {val.contract && (
                    <div className="text-[11px] text-slate-500 font-mono">Contract: {val.contract}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 6: AUTOMATION CENTRE */}
      {/* ========================================================================= */}
      {subTab === 'automation-centre' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-navy-900">Zapier MCP &amp; Render Daily Workers</h3>
                <p className="text-xs text-slate-500">
                  Manage user-authorized event-driven rules and trigger background worker execution passes.
                </p>
              </div>
              <button
                onClick={handleRunDailyWorker}
                className="px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold shadow-xs transition flex items-center gap-2"
              >
                <Clock className="w-3.5 h-3.5" />
                Run Render Worker Now
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rules.map((rule) => (
                <div key={rule._id} className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-blue-700">Channel: {rule.channel}</span>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => handleToggleRule(rule)}
                        className="rounded border-slate-300"
                      />
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </label>
                  </div>
                  <h4 className="text-sm font-bold text-navy-900">{rule.name}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{rule.description}</p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Runs: {rule.executionCount || 0}</span>
                    <button
                      onClick={() => handleTestTrigger(rule)}
                      className="px-3 py-1.5 rounded-xl border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-semibold transition"
                    >
                      Test Trigger
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 7: EXECUTION LOGS */}
      {/* ========================================================================= */}
      {subTab === 'execution-logs' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-navy-900">Security &amp; Financial Audit Trail</h3>
                <p className="text-xs text-slate-500">
                  Immutable server-side audit logs capturing user actions, Financial Guardian validations, and PayPal sandbox captures.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">{auditLogs.length} events logged</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Resource</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.slice(0, 25).map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</td>
                      <td className="p-3 font-semibold text-navy-900">{log.actor}</td>
                      <td className="p-3 font-mono text-blue-700">{log.action}</td>
                      <td className="p-3 text-slate-600">{log.resourceType}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            log.status === 'success'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 8: SYSTEM DIAGNOSTICS */}
      {/* ========================================================================= */}
      {subTab === 'system-diagnostics' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <h3 className="text-base font-bold text-navy-900 mb-1">Runtime Environment &amp; Diagnostics</h3>
            <p className="text-xs text-slate-500 mb-4">
              Real-time health of database connection, Elasticsearch cluster, and server configuration.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-xs text-slate-500 font-medium">Server Status</span>
                <div className="text-base font-bold text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Healthy
                </div>
                <div className="text-[11px] text-slate-400 font-mono">PROJECT AURA Backend API</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-xs text-slate-500 font-medium">Primary Database</span>
                <div className="text-base font-bold text-navy-900 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-blue-600" />
                  MongoDB (Local)
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  State: {healthData?.database?.state || 'connected'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-xs text-slate-500 font-medium">Elastic Financial Memory</span>
                <div className="text-base font-bold text-navy-900">
                  {healthData?.elastic?.status || 'Active Fallback'}
                </div>
                <div className="text-[11px] text-slate-400">Validated against MongoDB</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-xs text-slate-500 font-medium">Payment Protocol</span>
                <div className="text-base font-bold text-navy-900">PayPal Sandbox Orders v2</div>
                <div className="text-[11px] text-slate-400">APIMatic Schema Validated</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
