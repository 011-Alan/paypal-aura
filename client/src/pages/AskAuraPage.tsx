import React, { useEffect, useState, useRef } from 'react';
import {
  Sparkles,
  Bot,
  User,
  Send,
  Calendar,
  PieChart,
  ShoppingBag,
  CreditCard,
  Target,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  Clock,
  Compass,
} from 'lucide-react';
import { apiRequest, formatInr, formatDateShort } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

interface Message {
  id: string;
  sender: 'user' | 'aura';
  text: string;
  timestamp: string;
  toolAction?: {
    type: string;
    title: string;
    status: string;
    requiresUserPaymentApproval?: boolean;
    details?: any;
  };
  suggestedNextPrompts?: string[];
}

const CONVERSATION_STARTERS = [
  { label: 'Financial Health', prompt: 'How am I doing financially overall?' },
  { label: 'Purchase Affordability', prompt: 'Can I afford a laptop for ₹55,000?' },
  { label: 'Schedule Reminder', prompt: 'Schedule my electricity bill reminder for the 10th of every month.' },
  { label: 'Create Savings Plan', prompt: 'I want to save ₹30,000 over the next six months. Create a plan.' },
  { label: 'Monthly Planning', prompt: 'Help me plan my expenses for this month.' },
  { label: 'Compounding Interest', prompt: 'What is compounding interest and how does it help me save?' },
  { label: 'Move Goal Deadline', prompt: 'Move my savings goal deadline to December.' },
  { label: 'Inflation Impact', prompt: 'How does inflation affect my fixed deposits and purchasing power?' },
];

export const AskAuraPage: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { user, balancesVisible } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'aura',
      text: `Hello ${
        user?.name || 'there'
      }! I am AURA, your intelligent financial companion. You can ask me general questions about the world, seek financial explanations, plan upcoming budgets, create structured savings goals, schedule bill reminders, or evaluate potential purchases. How can I assist you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedNextPrompts: [
        'How am I doing financially overall?',
        'Can I afford a laptop for ₹55,000?',
        'Schedule electricity bill reminder for 10th',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || busy) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setBusy(true);

    try {
      const res = await apiRequest('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ prompt: query, includeKernelResearch: true }),
      });

      const auraMsg: Message = {
        id: `aura-${Date.now()}`,
        sender: 'aura',
        text: res.explanation || 'I have analyzed your request based on verified data.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolAction: res.toolAction,
        suggestedNextPrompts: res.suggestedNextPrompts || [],
      };

      setMessages((prev) => [...prev, auraMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `aura-err-${Date.now()}`,
        sender: 'aura',
        text: `I encountered an issue processing your request: ${err?.message || 'Please try again.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setBusy(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'aura',
        text: `Conversation refreshed. How can I help you today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedNextPrompts: [
          'How am I doing financially overall?',
          'Help me plan my expenses for this month',
          'Can I afford a laptop for ₹55,000?',
        ],
      },
    ]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-5xl mx-auto space-y-4">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-navy-900 tracking-tight flex items-center gap-2">
              Ask AURA
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Gemini Conversational Intelligence
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Natural conversation for general questions, financial planning, scheduling, and smart evaluations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearChat}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            title="Clear Chat Conversation"
            aria-label="Clear Chat"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Stream Container */}
      <div className="flex-1 overflow-y-auto bg-white rounded-3xl p-5 lg:p-6 border border-slate-200 shadow-xs space-y-5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3.5 max-w-3xl ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                msg.sender === 'user'
                  ? 'bg-navy-900 text-white'
                  : 'bg-blue-600 text-white shadow-2xs'
              }`}
            >
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Content Bubble */}
            <div className={`space-y-3 ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
              <div
                className={`inline-block p-4 rounded-3xl text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                    : 'bg-slate-50 text-navy-900 border border-slate-200/80 rounded-tl-xs whitespace-pre-wrap'
                }`}
              >
                {msg.text}
              </div>

              {/* Interactive Tool Action Cards (Only for Assistant messages) */}
              {msg.toolAction && msg.sender === 'aura' && (
                <div className="text-left w-full max-w-md">
                  {/* Card 1: Payment Prepared -> NON-NEGOTIABLE USER AUTHORITY */}
                  {msg.toolAction.type === 'payment_prepared' && (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5" />
                          Payment Authorization Card
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                          Awaiting Explicit Approval
                        </span>
                      </div>
                      <div className="text-xs text-amber-950 font-medium leading-relaxed">
                        {msg.toolAction.details?.recipientName && (
                          <div>Recipient: <strong>{msg.toolAction.details.recipientName}</strong></div>
                        )}
                        {msg.toolAction.details?.amountInr && (
                          <div>
                            Amount: <strong>{formatInr(msg.toolAction.details.amountInr, !balancesVisible)}</strong> ($
                            {msg.toolAction.details.amountUsd?.toFixed(2)} USD)
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-amber-900/80 leading-relaxed border-t border-amber-200/70 pt-2">
                        Financial Guardian has prepared this transaction. No money has moved. You must confirm and enter your PIN in Payments.
                      </p>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('payments')}
                          className="w-full py-2 px-3 rounded-xl bg-amber-900 hover:bg-amber-950 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-1.5"
                        >
                          Review &amp; Authorize in Payments <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Card 2: Calendar Reminder Scheduled */}
                  {msg.toolAction.type === 'reminder_scheduled' && (
                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-blue-800 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          Financial Life Calendar Synced
                        </span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <div className="text-xs font-semibold text-navy-900">{msg.toolAction.title}</div>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('calendar')}
                          className="text-xs text-blue-600 hover:underline font-bold inline-flex items-center gap-1 pt-1"
                        >
                          View in Financial Calendar →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Card 3: Savings Goal Created or Updated */}
                  {(msg.toolAction.type === 'goal_created' || msg.toolAction.type === 'goal_updated') && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-emerald-800 flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5" />
                          Goal Portfolio Updated
                        </span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="text-xs font-semibold text-navy-900">{msg.toolAction.title}</div>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('financial-planning')}
                          className="text-xs text-emerald-700 hover:underline font-bold inline-flex items-center gap-1 pt-1"
                        >
                          View in Financial Planning →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Card 4: Purchase Evaluated */}
                  {msg.toolAction.type === 'purchase_evaluated' && (
                    <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-indigo-800 flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5" />
                          7-Factor Affordability Checked
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-navy-900">{msg.toolAction.title}</div>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('smart-purchases')}
                          className="text-xs text-indigo-700 hover:underline font-bold inline-flex items-center gap-1 pt-1"
                        >
                          Open Smart Purchase Companion →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Card 5: Plan Generated */}
                  {msg.toolAction.type === 'plan_generated' && (
                    <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase text-slate-700 flex items-center gap-1.5">
                          <PieChart className="w-3.5 h-3.5" />
                          Monthly Budget Plan
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-navy-900">{msg.toolAction.title}</div>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('financial-planning')}
                          className="text-xs text-blue-600 hover:underline font-bold inline-flex items-center gap-1 pt-1"
                        >
                          Inspect Allocations &amp; Buffers →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Follow-up Prompt Suggestions */}
              {msg.suggestedNextPrompts && msg.suggestedNextPrompts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.suggestedNextPrompts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(p)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 text-[11px] font-medium text-slate-600 transition"
                    >
                      “{p}”
                    </button>
                  ))}
                </div>
              )}

              <div className="text-[10px] text-slate-400 px-1">{msg.timestamp}</div>
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-3 text-xs text-slate-500 py-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-bounce"></span>
              <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]"></span>
              <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]"></span>
              <span>AURA is reasoning and consulting your financial records...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Starter Prompts Carousel */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 text-xs">
        <span className="text-[11px] font-bold uppercase text-slate-400 shrink-0 flex items-center gap-1">
          <Compass className="w-3.5 h-3.5" /> Suggested:
        </span>
        {CONVERSATION_STARTERS.map((s, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(s.prompt)}
            disabled={busy}
            className="px-3 py-1.5 rounded-full bg-white hover:bg-blue-50 hover:text-blue-700 border border-slate-200 text-slate-700 font-medium whitespace-nowrap shadow-2xs transition"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2.5 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Ask AURA anything — e.g. "Can I afford a laptop for ₹55,000?" or "What is inflation?"'
          className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
