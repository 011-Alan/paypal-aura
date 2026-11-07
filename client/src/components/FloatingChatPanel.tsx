import React, { useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Maximize2,
  Plus,
  Send,
  User,
  Mic,
  MicOff,
  RotateCcw,
} from 'lucide-react';
import { useAskAura } from '../context/AskAuraContext';
import { ConversationalResponseRenderer } from './ConversationalResponseRenderer';

export const FloatingChatPanel: React.FC = () => {
  const {
    isFloatingOpen,
    closeFloatingChat,
    openFullPageChat,
    handleCreateNewChat,
    messages,
    input,
    setInput,
    busy,
    handleSendMessage,
    handleRegenerateLast,
    activeConvTitle,
    activeTab,
    isListening,
    toggleSpeechRecognition,
    voiceNotice,
  } = useAskAura();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages or busy state
  useEffect(() => {
    if (isFloatingOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, busy, isFloatingOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (isFloatingOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isFloatingOpen]);

  // Only render if open and NOT on full Ask AURA page (Requirement 7 & 12)
  if (!isFloatingOpen || activeTab === 'ask-aura') {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Ask AURA floating assistant"
      className="fixed inset-x-3 bottom-20 top-20 sm:inset-auto sm:bottom-24 sm:right-6 sm:w-96 sm:h-[580px] max-w-full z-50 flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl backdrop-blur-md overflow-hidden transition-all duration-200 animate-in fade-in slide-in-from-bottom-3"
    >
      {/* Compact Header with Actions */}
      <div className="h-14 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-navy-900 dark:text-white flex items-center gap-1.5 truncate">
              <span>Ask AURA</span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                AI
              </span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
              {activeConvTitle || 'Financial Companion'}
            </div>
          </div>
        </div>

        {/* Action Buttons: New Chat, Open in Ask AURA, Close */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Action A: New Chat (Requirement 4A) */}
          <button
            type="button"
            onClick={handleCreateNewChat}
            disabled={busy}
            title="Start New Chat"
            aria-label="Start New Chat"
            className="p-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Action B: Open in Full Ask AURA Page (Requirement 4B & 5) */}
          <button
            type="button"
            onClick={openFullPageChat}
            title="Open in Ask AURA (Full Page)"
            aria-label="Open in Ask AURA"
            className="p-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Action C: Close Panel (Requirement 2 & 7) */}
          <button
            type="button"
            onClick={closeFloatingChat}
            title="Close Chat Panel"
            aria-label="Close Chat Panel"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Voice notice if active */}
      {voiceNotice && (
        <div className="bg-blue-50 dark:bg-blue-950 px-3 py-1.5 text-[11px] font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5 border-b border-blue-100 dark:border-blue-900">
          <Mic className="w-3 h-3 text-blue-600 dark:text-blue-400 animate-pulse" />
          <span className="truncate">{voiceNotice}</span>
        </div>
      )}

      {/* Scrollable Message Thread */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user' || msg.sender === 'user';
          const msgContent = msg.content || msg.text || '';
          const msgId = msg._id || msg.id || `float-msg-${idx}`;

          return (
            <div
              key={msgId}
              className={`flex gap-2.5 max-w-[92%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              {/* Avatar */}
              <div
                className={`w-6 h-6 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-bold shadow-2xs ${
                  isUser
                    ? 'bg-navy-900 dark:bg-slate-700 text-white'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {isUser ? <User className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
              </div>

              {/* Message Bubble */}
              <div className={`space-y-1.5 min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-3 rounded-2xl leading-relaxed ${
                    isUser
                      ? 'bg-blue-600 text-white rounded-tr-xs shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800/90 text-navy-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-tl-xs shadow-2xs'
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{msgContent}</div>
                  ) : (
                    <ConversationalResponseRenderer
                      content={msgContent}
                      toolAction={msg.toolAction}
                      purchaseCompanion={msg.purchaseCompanion}
                    />
                  )}
                </div>

                {/* Suggestions Chips in Floating Panel */}
                {!isUser && msg.suggestedNextPrompts && msg.suggestedNextPrompts.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {msg.suggestedNextPrompts.slice(0, 3).map((chip, cIdx) => (
                      <button
                        key={cIdx}
                        type="button"
                        onClick={() => handleSendMessage(chip)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 text-[11px] border border-slate-200/70 dark:border-slate-700 transition"
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

        {/* Loading Indicator */}
        {busy && (
          <div className="flex gap-2 max-w-[90%] mr-auto items-center">
            <div className="w-6 h-6 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 animate-spin" />
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium animate-pulse">
              AURA is reasoning...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Area */}
      <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && input.trim()) {
              handleSendMessage();
            }
          }}
          className="flex items-center gap-1.5"
        >
          {/* Microphone Voice Toggle */}
          <button
            type="button"
            onClick={toggleSpeechRecognition}
            aria-label="Microphone Voice Input"
            title={isListening ? 'Stop listening' : 'Voice input'}
            className={`p-2 rounded-xl transition border shrink-0 ${
              isListening
                ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? 'Listening...' : 'Ask AURA anything...'}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-navy-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Send message"
            title="Send"
            className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 transition shadow-xs shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
