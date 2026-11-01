import React, { useEffect, useState } from 'react';
import { Sparkles, Bot, ShieldCheck, Send, Cpu, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../lib/api';

const WORKFLOW_PROMPTS = [
  {
    code: 'Workflow A',
    title: 'Can I afford this laptop?',
    prompt: 'Can I afford a laptop for ₹55,000?',
  },
  {
    code: 'Workflow B',
    title: 'Monthly Financial Planning',
    prompt: 'Create my financial plan for next month.',
  },
  {
    code: 'Workflow C',
    title: 'Unusual Spending Analysis',
    prompt: 'Show my unusual spending patterns and dining expenditure over the last three months.',
  },
  {
    code: 'Workflow D',
    title: 'Upcoming Commitments',
    prompt: 'What payments are coming up next week?',
  },
  {
    code: 'Workflow E',
    title: 'Controlled PayPal Payment',
    prompt: 'Prepare a payment of ₹5,000 to Greenwood Residency Landlords.',
  },
  {
    code: 'Workflow F',
    title: 'Financial Recovery Plan',
    prompt: 'I overspent on dining this month. Recommend a realistic financial recovery plan.',
  },
];

export const AskAuraPage: React.FC = () => {
  const [agentsInfo, setAgentsInfo] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [conversation, setConversation] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadAgents = async () => {
    const res = await apiRequest('/ai/agents');
    setAgentsInfo(res);
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const runPrompt = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await apiRequest('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ prompt: text, includeKernelResearch: true }),
      });
      setConversation((prev) => [res, ...prev]);
      setPrompt('');
      await loadAgents();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
          <Sparkles className="w-3.5 h-3.5" />
          Google Gemini Conversational AI + Astropods 6-Agent Orchestration
        </span>
        <h2 className="text-xl font-bold text-navy-900 mt-2">
          Ask AURA — Your Supportive, Non-Judgmental Financial Companion
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Coordinates 6 specialised Astropods financial agents with MongoDB, Elastic Financial Memory, Python Analytics, AG Grid, Bryntum, Channel3, and PayPal Sandbox.
        </p>

        {/* 6 Connected Hackathon Workflows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-4">
          {WORKFLOW_PROMPTS.map((wf) => (
            <button
              key={wf.code}
              onClick={() => runPrompt(wf.prompt)}
              disabled={busy}
              className="text-left p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition"
            >
              <div className="text-[11px] font-bold uppercase text-blue-600">{wf.code}: {wf.title}</div>
              <div className="text-xs text-navy-900 font-medium mt-0.5">“{wf.prompt}”</div>
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runPrompt(prompt);
          }}
          className="mt-4 flex gap-2.5"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask AURA any financial question..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            {busy ? 'Coordinating Agents...' : 'Send'}
          </button>
        </form>
      </div>

      {/* Conversation Responses & Multi-Agent Traces */}
      {conversation.map((turn, idx) => (
        <div key={idx} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="text-sm font-bold text-navy-900">You asked: “{turn.prompt}”</div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 uppercase">
              Workflow: {turn.workflowType.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 text-sm text-navy-900 leading-relaxed">
            {turn.explanation}
          </div>

          {/* Astropods Agent Execution Trace */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-600" />
              Astropods Multi-Agent Execution Trace ({turn.astropodsOrchestration?.workflowId} · {turn.astropodsOrchestration?.executionMode})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {(turn.astropodsOrchestration?.steps || []).map((step: any, sIdx: number) => (
                <div key={sIdx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div className="font-bold text-navy-900 flex items-center justify-between">
                    <span>{step.agentName} ({step.blueprintName || step.agentId})</span>
                    <span className="text-[10px] font-mono text-slate-500">{step.durationMs}ms · {step.transport || 'remote'}</span>
                  </div>
                  <div className="text-slate-600 mt-1">{step.summary}</div>
                  {step.correlationId && (
                    <div className="text-[10px] font-mono text-slate-400 mt-1">
                      Trace ID: {step.correlationId} {step.conversationId ? `· Conv: ${step.conversationId}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Registered Astropods Agents Directory */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-600" />
              Astropods Registered Financial Agents (6 Specialised Pods)
            </h3>
            <p className="text-xs text-slate-500">
              All agents share authorised backend context. None are permitted to execute payments independently.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(agentsInfo?.agents || []).map((ag: any) => (
            <div key={ag.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-navy-900">{ag.name}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" /> {ag.status}
                </span>
              </div>
              <div className="text-[11px] font-medium text-blue-700">
                {ag.role} {ag.blueprintName ? `· ${ag.blueprintName}` : ''}
              </div>
              <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside">
                {(ag.responsibilities || []).slice(0, 3).map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Independent Payment Authority: <strong>False (Backend Enforced)</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
