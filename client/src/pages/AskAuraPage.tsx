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
  RotateCcw,
  ShieldCheck,
  Clock,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Plus,
  Search,
  Trash2,
  Edit2,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Compass,
  ArrowRight,
  CheckCheck,
} from 'lucide-react';
import { apiRequest, formatDateShort } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';
import { ConversationalResponseRenderer } from '../components/ConversationalResponseRenderer';

interface Message {
  _id?: string;
  id?: string;
  sender?: 'user' | 'aura';
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  text?: string;
  createdAt?: string;
  timestamp?: string;
  toolAction?: {
    type: string;
    title: string;
    status: string;
    navTarget?: string;
    requiresUserPaymentApproval?: boolean;
    details?: any;
  };
  suggestedNextPrompts?: string[];
  purchaseCompanion?: any;
}

interface ConversationSummary {
  _id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

const STARTER_PROMPTS = [
  { label: 'Financial Health', prompt: 'How am I doing financially overall?' },
  { label: 'Sneakers Search', prompt: 'I need to buy sneakers.' },
  { label: 'Purchase Affordability', prompt: 'Can I afford a laptop for ₹55,000?' },
  { label: 'Schedule Reminder', prompt: 'Schedule my electricity bill reminder for the 10th of every month.' },
  { label: 'Currency to INR', prompt: 'Change my preferred currency to INR.' },
  { label: 'Take me to Accounts', prompt: 'Take me to my accounts.' },
  { label: 'Create Savings Plan', prompt: 'I want to save ₹30,000 over the next six months. Create a plan.' },
  { label: 'Compounding Interest', prompt: 'What is compounding interest and how does it help me save?' },
];

export const AskAuraPage: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { user, formatMoney } = useAuth();

  // Conversation list & active conversation
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConvTitle, setActiveConvTitle] = useState('New Conversation');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Messages in active conversation
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Voice Interaction state
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [isSpeakingId, setIsSpeakingId] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSubmittingRef = useRef<boolean>(false);

  // Check speech recognition support
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy]);

  // Load conversations on mount
  const loadConversations = async (q?: string) => {
    try {
      const endpoint = q ? `/conversations?q=${encodeURIComponent(q)}` : '/conversations';
      const res = await apiRequest(endpoint);
      const convList: ConversationSummary[] = res.conversations || [];
      setConversations(convList);

      if (!activeConvId && convList.length > 0 && !q) {
        selectConversation(convList[0]._id, convList[0].title);
      } else if (convList.length === 0 && !activeConvId) {
        initDefaultWelcome();
      }
    } catch {
      initDefaultWelcome();
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  const initDefaultWelcome = () => {
    setActiveConvId(null);
    setActiveConvTitle('New Conversation');
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Hello ${
          user?.name || 'there'
        }! I am AURA, your intelligent financial companion. You can ask me general questions, explore financial ideas, plan budgets, schedule bill reminders, or discover products. You can also use the microphone to talk with me. What would you like to explore today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedNextPrompts: [
          'How am I doing financially overall?',
          'I need to buy sneakers.',
          'Schedule electricity bill reminder for 10th',
          'Take me to my accounts',
        ],
      },
    ]);
  };

  const selectConversation = async (id: string, title?: string) => {
    try {
      setBusy(true);
      setActiveConvId(id);
      if (title) setActiveConvTitle(title);
      const res = await apiRequest(`/conversations/${id}`);
      setActiveConvTitle(res.conversation?.title || 'Conversation');
      const loaded: Message[] = (res.messages || []).map((m: any) => ({
        _id: m._id,
        id: m._id,
        role: m.role,
        content: m.content,
        toolAction: m.toolAction,
        suggestedNextPrompts: m.suggestedNextPrompts,
        timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));
      setMessages(loaded);
    } catch (err: any) {
      setVoiceNotice(`Failed to load chat: ${err?.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNewChat = async () => {
    try {
      setBusy(true);
      const res = await apiRequest('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Conversation' }),
      });
      const newConv: ConversationSummary = res.conversation;
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(newConv._id);
      setActiveConvTitle(newConv.title);
      setMessages([
        {
          id: 'welcome-new',
          role: 'assistant',
          content: `Started a new conversation. Ask me any question, request a financial calculation, explore products, or speak into the microphone.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestedNextPrompts: [
            'How am I doing financially overall?',
            'I need to buy sneakers.',
            'Help me plan my expenses for this month',
            'Change my preferred currency to INR',
          ],
        },
      ]);
    } catch {
      initDefaultWelcome();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this conversation?')) return;
    try {
      await apiRequest(`/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c._id !== id));
      if (activeConvId === id) {
        initDefaultWelcome();
      }
    } catch (err: any) {
      alert(`Could not delete conversation: ${err?.message}`);
    }
  };

  const handleRenameConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = conversations.find((c) => c._id === id);
    const newTitle = window.prompt('Rename conversation:', current?.title || '');
    if (!newTitle || !newTitle.trim()) return;
    try {
      const res = await apiRequest(`/conversations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      setConversations((prev) =>
        prev.map((c) => (c._id === id ? { ...c, title: res.conversation.title } : c))
      );
      if (activeConvId === id) {
        setActiveConvTitle(res.conversation.title);
      }
    } catch (err: any) {
      alert(`Could not rename conversation: ${err?.message}`);
    }
  };

  // Text-To-Speech
  const speakText = (text: string, msgId: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    if (isSpeakingId === msgId) {
      setIsSpeakingId(null);
      return;
    }

    const cleanText = text.replace(/[*#_`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const englishVoice =
      voices.find((v) => v.lang.includes('en-IN') || v.lang.includes('en-GB') || v.lang.includes('en-US')) ||
      voices[0];
    if (englishVoice) utterance.voice = englishVoice;

    utterance.onend = () => setIsSpeakingId(null);
    utterance.onerror = () => setIsSpeakingId(null);

    setIsSpeakingId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  // Speech-To-Text (Voice Recognition)
  const toggleSpeechRecognition = () => {
    if (!speechSupported) {
      setVoiceNotice('Speech recognition is not supported in this browser. Please use text input.');
      setTimeout(() => setVoiceNotice(''), 4000);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceNotice('Listening... Speak naturally.');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput(transcript);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        setVoiceNotice(`Voice recognition error: ${event.error || 'permission denied'}`);
        setTimeout(() => setVoiceNotice(''), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
        setVoiceNotice('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      setIsListening(false);
      setVoiceNotice(`Could not start microphone: ${err?.message}`);
      setTimeout(() => setVoiceNotice(''), 4000);
    }
  };

  // Process Tool Action Effects
  const triggerToolEffects = (action: any) => {
    if (!action) return;

    // 1. Navigation effect
    const targetPage = action.navTarget || (action.type === 'navigation' ? action.details?.targetTab : null);
    if (targetPage) {
      // Auto-trigger navigation smoothly or allow user to click
      window.dispatchEvent(new CustomEvent('aura-navigate', { detail: { page: targetPage } }));
    }

    // 2. Application state changes (Currency, Income, Goals, Reminders)
    if (
      action.type === 'currency_updated' ||
      action.type === 'profile_updated' ||
      action.type === 'income_updated' ||
      action.type === 'reminder_scheduled' ||
      action.type === 'goal_created' ||
      action.type === 'goal_updated' ||
      action.type === 'payment_prepared'
    ) {
      window.dispatchEvent(new CustomEvent('aura-state-changed', { detail: action }));
    }
  };

  // Send Message with SSE Token Streaming Support & Duplicate Request Protection
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || busy || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const tempUserMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    if (!textToSend) setInput('');
    setBusy(true);

    try {
      let targetConvId = activeConvId;
      if (!targetConvId) {
        const createRes = await apiRequest('/conversations', {
          method: 'POST',
          body: JSON.stringify({
            title: query.length > 36 ? query.slice(0, 36).trim() + '...' : query,
          }),
        });
        targetConvId = createRes.conversation._id;
        setActiveConvId(targetConvId);
        setActiveConvTitle(createRes.conversation.title);
        setConversations((prev) => [createRes.conversation, ...prev]);
      }

      // Try SSE streaming for real-time token reveal
      const token = localStorage.getItem('token');
      const streamRes = await fetch(`/api/conversations/${targetConvId}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: query }),
      });

      if (streamRes.ok && streamRes.body) {
        const assistantMsgId = `aura-stream-${Date.now()}`;
        let streamedContent = '';
        let finalAction: any = null;
        let finalChips: string[] = [];

        // Insert initial streaming message
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const event = JSON.parse(trimmed.slice(6));
                const chunkDelta = event.delta || event.token || event.text || '';
                if (event.type === 'delta' || event.type === 'token' || (chunkDelta && event.type !== 'final')) {
                  streamedContent += chunkDelta;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMsgId ? { ...m, content: streamedContent } : m))
                  );
                } else if (event.type === 'final') {
                  if (event.answer) streamedContent = event.answer;
                  finalAction = event.toolAction;
                  finalChips = event.suggestedNextPrompts || [];
                }
              } catch {
                // Ignore parse errors on individual SSE frames
              }
            }
          }
        }

        // Finalize message with toolAction & suggestedNextPrompts
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: streamedContent || 'Done.',
                  toolAction: finalAction,
                  suggestedNextPrompts: finalChips,
                }
              : m
          )
        );

        if (finalAction) {
          triggerToolEffects(finalAction);
        }

        if (voiceOutputEnabled && streamedContent) {
          speakText(streamedContent, assistantMsgId);
        }
      } else {
        // Fallback to standard request
        const res = await apiRequest(`/conversations/${targetConvId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: query, includeKernelResearch: true }),
        });

        const assistantMsg: Message = {
          _id: res.assistantMessage?._id || `aura-${Date.now()}`,
          id: res.assistantMessage?._id || `aura-${Date.now()}`,
          role: 'assistant',
          content: res.assistantMessage?.content || res.explanation || 'Processed your request.',
          toolAction: res.toolAction,
          suggestedNextPrompts: res.suggestedNextPrompts || [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        if (res.toolAction) {
          triggerToolEffects(res.toolAction);
        }

        if (voiceOutputEnabled && assistantMsg.content) {
          speakText(assistantMsg.content, assistantMsg.id || '');
        }
      }

      // Update sidebar conversation list
      setConversations((prev) =>
        prev.map((c) =>
          c._id === targetConvId
            ? { ...c, lastMessageAt: new Date().toISOString() }
            : c
        )
      );
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `I encountered an issue processing your request: ${err?.message || 'Please try again.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      isSubmittingRef.current = false;
      setBusy(false);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerateLast = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg && (lastUserMsg.content || lastUserMsg.text)) {
      handleSendMessage(lastUserMsg.content || lastUserMsg.text);
    }
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-7.5rem)] max-w-7xl mx-auto gap-4 overflow-hidden">
      {/* Collapsible Left Sidebar: Previous Chats */}
      <aside
        className={`${
          sidebarOpen ? 'w-80 flex' : 'hidden'
        } shrink-0 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex-col overflow-hidden transition-all duration-200`}
      >
        {/* New Chat Button & Search */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <button
            onClick={handleCreateNewChat}
            disabled={busy}
            className="w-full py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold text-sm shadow-xs transition flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                loadConversations(e.target.value);
              }}
              placeholder="Search previous chats..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Recent Conversations
          </div>

          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
              No saved conversations found. Start a new chat to begin.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const active = conv._id === activeConvId;
              return (
                <div
                  key={conv._id}
                  onClick={() => selectConversation(conv._id, conv.title)}
                  className={`group w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-medium cursor-pointer transition ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-semibold border border-blue-100 dark:border-blue-900'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                    <span className="truncate">{conv.title}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => handleRenameConversation(conv._id, e)}
                      title="Rename"
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteConversation(conv._id, e)}
                      title="Delete"
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Conversational Workspace */}
      <section className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col min-w-0 overflow-hidden transition-colors">
        {/* Workspace Header */}
        <div className="h-16 px-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5 truncate">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition border border-slate-200 dark:border-slate-700"
              title={sidebarOpen ? 'Hide Chat Sidebar' : 'Show Chat Sidebar'}
              aria-label="Toggle chat history sidebar"
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <div className="truncate">
              <h2 className="text-sm sm:text-base font-bold text-navy-900 dark:text-white truncate">{activeConvTitle}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                Powered by Google Gemini SDK &amp; Autonomous Application Control
              </p>
            </div>
          </div>

          {/* Action buttons: Clear, Voice Responses Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVoiceOutputEnabled(!voiceOutputEnabled)}
              className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border ${
                voiceOutputEnabled
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
              title={voiceOutputEnabled ? 'Voice responses active (Click to mute)' : 'Enable spoken voice responses'}
            >
              {voiceOutputEnabled ? <Volume2 className="w-4 h-4 text-blue-600 dark:text-blue-400" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden md:inline">{voiceOutputEnabled ? 'Voice On' : 'Voice Off'}</span>
            </button>

            <button
              onClick={handleCreateNewChat}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition border border-slate-200 dark:border-slate-700"
              title="Start a new chat"
              aria-label="New Chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Voice Feedback Banner */}
        {voiceNotice && (
          <div className="bg-blue-50 dark:bg-blue-950 border-b border-blue-100 dark:border-blue-900 px-4 py-2 text-xs font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-2 animate-pulse">
            <Mic className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{voiceNotice}</span>
          </div>
        )}

        {/* Message Thread Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user' || msg.sender === 'user';
            const msgContent = msg.content || msg.text || '';
            const msgId = msg._id || msg.id || `msg-${idx}`;

            return (
              <div
                key={msgId}
                className={`flex gap-3 sm:gap-4 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-xs font-bold shadow-2xs ${
                    isUser
                      ? 'bg-navy-900 dark:bg-slate-700 text-white'
                      : 'bg-blue-600 dark:bg-blue-500 text-white'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </div>

                {/* Message Body */}
                <div className={`space-y-3 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`p-4 sm:p-5 rounded-3xl text-sm leading-relaxed ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/90 text-navy-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-tl-xs'
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-wrap">{msgContent}</div>
                    ) : (
                      <ConversationalResponseRenderer
                        content={msgContent}
                        onNavigate={onNavigate}
                        toolAction={msg.toolAction}
                        purchaseCompanion={msg.purchaseCompanion}
                      />
                    )}
                  </div>

                  {/* Assistant Actions: Audio, Copy, Regenerate — cleanly separated from message content */}
                  {!isUser && msgContent && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 pl-1 pt-1 border-t border-slate-100 dark:border-slate-800/60 mt-1" role="toolbar" aria-label="Message options">
                      <button
                        type="button"
                        onClick={() => speakText(msgContent, msgId)}
                        className={`inline-flex items-center gap-1.5 hover:text-navy-900 dark:hover:text-white px-2 py-1 rounded-lg transition ${
                          isSpeakingId === msgId ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950' : ''
                        }`}
                        title="Listen to this response"
                        aria-label="Listen to this response"
                      >
                        <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{isSpeakingId === msgId ? 'Speaking...' : 'Listen'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyText(msgContent, msgId)}
                        className="inline-flex items-center gap-1.5 hover:text-navy-900 dark:hover:text-white px-2 py-1 rounded-lg transition"
                        title="Copy to clipboard"
                        aria-label="Copy to clipboard"
                      >
                        {copiedId === msgId ? <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                        <span>{copiedId === msgId ? 'Copied' : 'Copy'}</span>
                      </button>

                      {idx === messages.length - 1 && (
                        <button
                          type="button"
                          onClick={handleRegenerateLast}
                          className="inline-flex items-center gap-1.5 hover:text-navy-900 dark:hover:text-white px-2 py-1 rounded-lg transition"
                          title="Regenerate last response"
                          aria-label="Regenerate last response"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Regenerate</span>
                        </button>
                      )}

                      <span className="text-[11px] ml-auto">{msg.timestamp}</span>
                    </div>
                  )}

                  {/* Structured Tool Action Cards */}
                  {msg.toolAction && (
                    <div className="mt-3 space-y-3">
                      {/* 1. Navigation Action Card */}
                      {(msg.toolAction.type === 'navigation' || msg.toolAction.navTarget) && (
                        <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-left space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                              <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              Application Navigation
                            </span>
                            <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full">
                              Target: {msg.toolAction.navTarget || msg.toolAction.details?.targetTab}
                            </span>
                          </div>
                          <p className="text-xs text-indigo-950 dark:text-indigo-200">
                            AURA navigated to your <strong>{msg.toolAction.navTarget || msg.toolAction.details?.targetTab}</strong> screen. Click below to view immediately.
                          </p>
                          <button
                            onClick={() => onNavigate?.(msg.toolAction?.navTarget || msg.toolAction?.details?.targetTab)}
                            className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition flex items-center justify-center gap-1.5"
                          >
                            <span>Open {msg.toolAction.navTarget || msg.toolAction.details?.targetTab} Page Now</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* 2. Payment Authorization Card */}
                      {msg.toolAction.type === 'payment_prepared' && (
                        <div className="p-5 rounded-3xl bg-amber-50/90 dark:bg-amber-950/60 border-2 border-amber-300 dark:border-amber-700 shadow-xs space-y-3.5 text-left">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                              User Payment Authority Required
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                              Prepared Only
                            </span>
                          </div>

                          <p className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed font-medium">
                            AURA has prepared this payment workflow. As a strict non-negotiable security principle,{' '}
                            <strong>AURA cannot transfer funds automatically.</strong> You must review the details and enter your Argon2id security PIN.
                          </p>

                          <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Recipient</span>
                              <span className="font-bold text-navy-900 dark:text-white">{msg.toolAction.details?.recipientName}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400 text-[11px] block">Amount</span>
                              <span className="font-bold text-navy-900 dark:text-white text-sm">
                                {formatMoney(msg.toolAction.details?.amountInr)}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => onNavigate?.('payments')}
                            className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs transition flex items-center justify-center gap-2"
                          >
                            <span>Open Payments Workbench to Verify PIN &amp; Execute</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {/* 3. Multi-Category Channel3 Product Discovery & Affordability */}
                      {msg.toolAction.type === 'purchase_evaluated' && (
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-left space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                              <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              Channel3 Product Discovery &amp; Affordability
                            </span>
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                              {msg.toolAction.details?.verdict || 'Evaluated'}
                            </span>
                          </div>

                          {/* Render product cards if available */}
                          {msg.toolAction.details?.products && msg.toolAction.details.products.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {msg.toolAction.details.products.slice(0, 4).map((prod: any) => (
                                <div
                                  key={prod.id}
                                  className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs flex flex-col justify-between space-y-1.5 shadow-2xs"
                                >
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 tracking-wide">
                                        {prod.category}
                                      </span>
                                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                        {prod.merchant}
                                      </span>
                                    </div>
                                    <div className="font-bold text-navy-900 dark:text-white mt-0.5 line-clamp-1">{prod.title}</div>
                                  </div>
                                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <span className="font-extrabold text-navy-900 dark:text-white text-sm">
                                      {formatMoney(prod.priceInr)}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                      In Stock
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {msg.toolAction.details?.canInitiatePurchase
                              ? 'Fits comfortably in your discretionary monthly pool without compromising rent, bills, or savings.'
                              : 'Recommended to save over planned milestones so essential commitments remain ring-fenced.'}
                          </p>
                          <button
                            onClick={() => onNavigate?.('smart-purchases')}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <span>Explore 7-Factor Affordability Breakdown</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* 4. Calendar Reminder Card */}
                      {msg.toolAction.type === 'reminder_scheduled' && (
                        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-left space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              Calendar Reminder Synchronized
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full">
                              Bryntum Sync
                            </span>
                          </div>
                          <p className="text-xs text-emerald-900 dark:text-emerald-200">
                            Reminder title: <strong>{msg.toolAction.details?.title}</strong> for day{' '}
                            <strong>{msg.toolAction.details?.dueDayOfMonth}</strong> of every month.
                          </p>
                          <button
                            onClick={() => onNavigate?.('calendar')}
                            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            <span>View in Financial Calendar</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* 5. Savings Goal Card */}
                      {(msg.toolAction.type === 'goal_created' || msg.toolAction.type === 'goal_updated') && (
                        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-left space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                              <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              {msg.toolAction.title}
                            </span>
                            <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded-full">
                              Goal Updated
                            </span>
                          </div>
                          <p className="text-xs text-blue-950 dark:text-blue-200">
                            Target: <strong>{formatMoney(msg.toolAction.details?.targetAmount)}</strong> | Monthly contribution:{' '}
                            <strong>{formatMoney(msg.toolAction.details?.monthlyContribution)}</strong>
                          </p>
                          <button
                            onClick={() => onNavigate?.('goals')}
                            className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <span>View Goal Progress</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* 6. Currency / Profile Updated Card */}
                      {(msg.toolAction.type === 'currency_updated' || msg.toolAction.type === 'profile_updated') && (
                        <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-left space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-teal-900 dark:text-teal-300 flex items-center gap-1.5">
                              <CheckCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                              Profile Settings Synchronized
                            </span>
                            <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/60 px-2 py-0.5 rounded-full">
                              State Live
                            </span>
                          </div>
                          <p className="text-xs text-teal-950 dark:text-teal-200">
                            Preferred currency is set to <strong>{msg.toolAction.details?.preferredCurrency || 'INR'}</strong>. All balances across your accounts and overview have been updated.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Suggestion Chips */}
                  {msg.suggestedNextPrompts && msg.suggestedNextPrompts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.suggestedNextPrompts.map((chip, cIdx) => (
                        <button
                          key={cIdx}
                          onClick={() => handleSendMessage(chip)}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 text-xs text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 transition"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {busy && (
            <div className="flex gap-3 max-w-3xl mr-auto items-center">
              <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold animate-pulse flex items-center gap-2">
                <span>AURA is reasoning and checking verified financial context...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Starter Prompts Strip (When 1 welcome message only) */}
        {messages.length <= 1 && (
          <div className="px-4 sm:px-6 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Suggested Prompts
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {STARTER_PROMPTS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(item.prompt)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0 transition"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Input Workspace with Voice Support */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && !isSubmittingRef.current && input.trim()) {
                handleSendMessage();
              }
            }}
            className="flex items-center gap-2"
          >
            {/* Microphone Button */}
            <button
              type="button"
              onClick={toggleSpeechRecognition}
              className={`p-3 rounded-2xl transition border shrink-0 ${
                isListening
                  ? 'bg-rose-600 text-white border-rose-600 shadow-md animate-pulse'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
              }`}
              title={isListening ? 'Click to stop listening' : 'Speak with your microphone'}
              aria-label="Microphone Voice Input"
            >
              {isListening ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Input Bar */}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isListening
                  ? 'Listening... speak clearly now...'
                  : 'Ask anything — general topics, "I need to buy sneakers", "Take me to accounts", "Schedule electricity bill"...'
              }
              disabled={busy}
              className="flex-1 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 text-navy-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="p-3 rounded-2xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-semibold shadow-xs transition shrink-0"
              title="Send message"
              aria-label="Send Message"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};
