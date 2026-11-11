import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { apiRequest, getApiBase, getStoredToken } from '../lib/api';
import { useAuth } from './AuthContext';
import { NavTabId } from '../components/AppShell';
import { gridStateManager, GridSelectionContext } from '../lib/gridStateManager';

export interface Message {
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

export interface ConversationSummary {
  _id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface AskAuraContextValue {
  conversations: ConversationSummary[];
  activeConvId: string | null;
  activeConvTitle: string;
  messages: Message[];
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  busy: boolean;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  isFloatingOpen: boolean;
  setIsFloatingOpen: React.Dispatch<React.SetStateAction<boolean>>;
  voiceOutputEnabled: boolean;
  setVoiceOutputEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  isListening: boolean;
  speechSupported: boolean;
  voiceNotice: string;
  isSpeakingId: string | null;
  copiedId: string | null;
  loadConversations: (q?: string) => Promise<void>;
  selectConversation: (id: string, title?: string) => Promise<void>;
  handleCreateNewChat: () => Promise<void>;
  handleDeleteConversation: (id: string, e?: React.MouseEvent) => Promise<void>;
  handleRenameConversation: (id: string, e?: React.MouseEvent) => Promise<void>;
  handleSendMessage: (textToSend?: string) => Promise<void>;
  handleCopyText: (text: string, id: string) => void;
  handleRegenerateLast: () => void;
  toggleSpeechRecognition: () => void;
  speakText: (text: string, msgId: string) => void;
  openFloatingChat: () => void;
  closeFloatingChat: () => void;
  popOutToFloatingChat: (targetTab?: NavTabId) => void;
  openFullPageChat: () => void;
  activeTab: NavTabId;
  attachedSelectionContext: GridSelectionContext | null;
  attachSelectionContext: (ctx: GridSelectionContext) => void;
  clearSelectionContext: () => void;
}

const AskAuraContext = createContext<AskAuraContextValue | undefined>(undefined);

export const AskAuraProvider: React.FC<{
  children: React.ReactNode;
  activeTab: NavTabId;
  onNavigate: (tab: NavTabId) => void;
}> = ({ children, activeTab, onNavigate }) => {
  const { user } = useAuth();

  // Conversation list & active conversation
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('aura_active_conv_id') || null;
    } catch {
      return null;
    }
  });
  const [activeConvTitle, setActiveConvTitle] = useState('New Conversation');
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Floating Chat State
  const [isFloatingOpen, setIsFloatingOpen] = useState(false);

  // AG Grid Context Selection
  const [attachedSelectionContext, setAttachedSelectionContext] = useState<GridSelectionContext | null>(null);
  const attachSelectionContext = useCallback((ctx: GridSelectionContext) => {
    setAttachedSelectionContext(ctx);
  }, []);
  const clearSelectionContext = useCallback(() => {
    setAttachedSelectionContext(null);
  }, []);

  // Voice Interaction state
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [isSpeakingId, setIsSpeakingId] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const activeTabRef = useRef<NavTabId>(activeTab);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Check speech recognition support
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
    }
  }, []);

  const initDefaultWelcome = useCallback(() => {
    setActiveConvId(null);
    try {
      localStorage.removeItem('aura_active_conv_id');
    } catch {
      // ignore
    }
    setActiveConvTitle('New Conversation');
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Hello ${
          user?.name || 'there'
        }! I am AURA, your intelligent financial companion. You can ask me general questions, explore financial ideas, plan budgets, schedule bill reminders, or discover products. What would you like to explore today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedNextPrompts: [
          'How am I doing financially overall?',
          'I need to buy sneakers.',
          'Schedule electricity bill reminder for 10th',
          'Take me to my accounts',
        ],
      },
    ]);
  }, [user?.name]);

  const selectConversation = useCallback(async (id: string, title?: string) => {
    try {
      setBusy(true);
      setActiveConvId(id);
      try {
        localStorage.setItem('aura_active_conv_id', id);
      } catch {
        // ignore
      }
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
    } catch {
      initDefaultWelcome();
    } finally {
      setBusy(false);
    }
  }, [initDefaultWelcome]);

  const loadConversations = useCallback(async (q?: string) => {
    try {
      const endpoint = q ? `/conversations?q=${encodeURIComponent(q)}` : '/conversations';
      const res = await apiRequest(endpoint);
      const convList: ConversationSummary[] = res.conversations || [];
      setConversations(convList);

      const savedConvId = localStorage.getItem('aura_active_conv_id');
      if (savedConvId && convList.some((c) => c._id === savedConvId) && !q) {
        selectConversation(savedConvId);
      } else if (convList.length > 0 && !q && !activeConvId) {
        selectConversation(convList[0]._id, convList[0].title);
      } else if (convList.length === 0 && !activeConvId) {
        initDefaultWelcome();
      }
    } catch {
      initDefaultWelcome();
    }
  }, [activeConvId, selectConversation, initDefaultWelcome]);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  const handleCreateNewChat = useCallback(async () => {
    try {
      setBusy(true);
      const res = await apiRequest('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Conversation' }),
      });
      const newConv: ConversationSummary = res.conversation;
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(newConv._id);
      try {
        localStorage.setItem('aura_active_conv_id', newConv._id);
      } catch {
        // ignore
      }
      setActiveConvTitle(newConv.title);
      setMessages([
        {
          id: 'welcome-new',
          role: 'assistant',
          content: `Started a new conversation. Ask me any question, request a financial calculation, explore products, or ask me to navigate to any screen.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestedNextPrompts: [
            'How am I doing financially overall?',
            'I need to buy sneakers.',
            'Help me plan my expenses for this month',
            'Take me to Settings',
          ],
        },
      ]);
    } catch {
      initDefaultWelcome();
    } finally {
      setBusy(false);
    }
  }, [initDefaultWelcome]);

  const handleDeleteConversation = useCallback(async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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
  }, [activeConvId, initDefaultWelcome]);

  const handleRenameConversation = useCallback(async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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
  }, [conversations, activeConvId]);

  // Voice Text-To-Speech
  const speakText = useCallback((text: string, msgId: string) => {
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
  }, [isSpeakingId]);

  // Speech-To-Text (Voice Recognition)
  const toggleSpeechRecognition = useCallback(() => {
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
  }, [speechSupported, isListening]);

  // Process Tool Action Effects
  const triggerToolEffects = useCallback((action: any) => {
    if (!action) return;

    // 1. Navigation effect
    const targetPage = action.navTarget || (action.type === 'navigation' ? action.details?.targetTab : null);
    if (targetPage) {
      if (targetPage === 'ask-aura') {
        setIsFloatingOpen(false);
      } else if (activeTabRef.current === 'ask-aura') {
        // If transitioning out from full Ask AURA page, open floating panel to preserve the conversation
        setIsFloatingOpen(true);
      }
      if (action.details?.searchQuery) {
        try {
          sessionStorage.setItem('aura_commerce_search_query', action.details.searchQuery);
        } catch {}
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('aura-commerce-search', { detail: { query: action.details.searchQuery } })
          );
        }, 150);
      }
      if (action.type === 'product_filtered' && action.details) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('aura-commerce-filter', { detail: action.details })
          );
        }, 150);
      }
      onNavigate(targetPage as NavTabId);
      window.dispatchEvent(new CustomEvent('aura-navigate', { detail: { page: targetPage } }));
    }

    // 2. Theme control effect
    if (action.type === 'theme_changed' && action.details?.theme) {
      const newTheme = action.details.theme;
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(newTheme);
      }
      try {
        localStorage.setItem('aura_theme', newTheme);
      } catch {}
      window.dispatchEvent(new CustomEvent('aura-theme-changed', { detail: { theme: newTheme } }));
    }

    // 3. Sidebar control effect
    if (action.type === 'sidebar_toggled') {
      window.dispatchEvent(new CustomEvent('aura-sidebar-toggle', { detail: action.details }));
    }

    // 4. Secure Logout effect
    if (action.type === 'logout') {
      apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
      try {
        localStorage.removeItem('aura_auth_token');
        localStorage.removeItem('token');
      } catch {}
      window.location.href = '/login';
      return;
    }

    // 5. Safe External Link
    if (action.type === 'external_link' && action.details?.url) {
      window.open(action.details.url, '_blank', 'noopener,noreferrer');
    }

    // 6. Application state changes (Currency, Income, Goals, Reminders, Orders, Payments)
    if (
      action.type === 'currency_updated' ||
      action.type === 'profile_updated' ||
      action.type === 'income_updated' ||
      action.type === 'reminder_scheduled' ||
      action.type === 'reminder_cancelled' ||
      action.type === 'goal_created' ||
      action.type === 'goal_updated' ||
      action.type === 'order_prepared' ||
      action.type === 'payment_prepared'
    ) {
      window.dispatchEvent(new CustomEvent('aura-state-changed', { detail: action }));
    }

    // 7. AG Grid Actions
    if (action.type === 'grid_action' && action.details) {
      gridStateManager.handleAction(action.details);
      window.dispatchEvent(new CustomEvent('aura-grid-action', { detail: action.details }));
    }
  }, [onNavigate]);

  // Send Message with SSE Token Streaming Support & Duplicate Request Protection
  const handleSendMessage = useCallback(async (textToSend?: string) => {
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
        if (targetConvId) {
          try {
            localStorage.setItem('aura_active_conv_id', targetConvId);
          } catch {
            // ignore
          }
        }
        setActiveConvTitle(createRes.conversation.title);
        setConversations((prev) => [createRes.conversation, ...prev]);
      }

      // Try SSE streaming for real-time token reveal
      const token = getStoredToken();
      const streamRes = await fetch(`${getApiBase()}/conversations/${targetConvId}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: query, gridSelectionContext: attachedSelectionContext }),
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
          body: JSON.stringify({ content: query, includeKernelResearch: true, gridSelectionContext: attachedSelectionContext }),
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
  }, [input, busy, isListening, activeConvId, voiceOutputEnabled, speakText, triggerToolEffects]);

  const handleCopyText = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleRegenerateLast = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg && (lastUserMsg.content || lastUserMsg.text)) {
      handleSendMessage(lastUserMsg.content || lastUserMsg.text);
    }
  }, [messages, handleSendMessage]);

  const openFloatingChat = useCallback(() => {
    setIsFloatingOpen(true);
  }, []);

  const closeFloatingChat = useCallback(() => {
    setIsFloatingOpen(false);
  }, []);

  const popOutToFloatingChat = useCallback((targetTab: NavTabId = 'overview') => {
    setIsFloatingOpen(true);
    onNavigate(targetTab);
  }, [onNavigate]);

  const openFullPageChat = useCallback(() => {
    setIsFloatingOpen(false);
    onNavigate('ask-aura');
  }, [onNavigate]);

  return (
    <AskAuraContext.Provider
      value={{
        conversations,
        activeConvId,
        activeConvTitle,
        messages,
        input,
        setInput,
        busy,
        searchQuery,
        setSearchQuery,
        isFloatingOpen,
        setIsFloatingOpen,
        voiceOutputEnabled,
        setVoiceOutputEnabled,
        isListening,
        speechSupported,
        voiceNotice,
        isSpeakingId,
        copiedId,
        loadConversations,
        selectConversation,
        handleCreateNewChat,
        handleDeleteConversation,
        handleRenameConversation,
        handleSendMessage,
        handleCopyText,
        handleRegenerateLast,
        toggleSpeechRecognition,
        speakText,
        openFloatingChat,
        closeFloatingChat,
        popOutToFloatingChat,
        openFullPageChat,
        activeTab,
        attachedSelectionContext,
        attachSelectionContext,
        clearSelectionContext,
      }}
    >
      {children}
    </AskAuraContext.Provider>
  );
};

export const useAskAura = (): AskAuraContextValue => {
  const context = useContext(AskAuraContext);
  if (!context) {
    throw new Error('useAskAura must be used within an AskAuraProvider');
  }
  return context;
};
