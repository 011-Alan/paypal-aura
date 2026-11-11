import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Sparkles,
  X,
  Maximize2,
  Plus,
  Send,
  User,
  Mic,
  MicOff,
  GripHorizontal,
} from 'lucide-react';
import { useAskAura } from '../context/AskAuraContext';
import { ConversationalResponseRenderer } from './ConversationalResponseRenderer';

// Requirement 3: Strictly enforced minimum dimensions
const MIN_WIDTH = 340;
const MIN_HEIGHT = 420;
const DEFAULT_WIDTH = 384;
const DEFAULT_HEIGHT = 580;
const STORAGE_KEY = 'aura_chat_panel_bounds';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface PanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
    activeConvTitle,
    activeTab,
    isListening,
    toggleSpeechRecognition,
    voiceNotice,
    attachedSelectionContext,
    clearSelectionContext,
  } = useAskAura();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Dragging and Resizing State
  const [isDragging, setIsDragging] = useState(false);
  const [activeResizeDir, setActiveResizeDir] = useState<ResizeDirection | null>(null);

  // Compute initial default bounds safely within viewport
  const getInitialBounds = useCallback((): PanelBounds => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

    // Try reading saved bounds from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          typeof parsed.width === 'number' &&
          typeof parsed.height === 'number' &&
          typeof parsed.x === 'number' &&
          typeof parsed.y === 'number'
        ) {
          const effMinWidth = Math.min(MIN_WIDTH, vw - 16);
          const effMinHeight = Math.min(MIN_HEIGHT, vh - 16);
          const width = Math.max(effMinWidth, Math.min(vw - 16, parsed.width));
          const height = Math.max(effMinHeight, Math.min(vh - 16, parsed.height));
          const x = Math.max(8, Math.min(vw - width - 8, parsed.x));
          const y = Math.max(8, Math.min(vh - height - 8, parsed.y));
          return { x, y, width, height };
        }
      }
    } catch {
      // localStorage may fail or be empty
    }

    // Default position: bottom-right (above bottom navigation bar)
    const effMinWidth = Math.min(MIN_WIDTH, vw - 16);
    const effMinHeight = Math.min(MIN_HEIGHT, vh - 16);
    const width = Math.max(effMinWidth, Math.min(vw - 24, DEFAULT_WIDTH));
    const height = Math.max(effMinHeight, Math.min(vh - 32, DEFAULT_HEIGHT));
    const x = Math.max(8, vw - width - 24);
    const y = Math.max(8, vh - height - 88);

    return { x, y, width, height };
  }, []);

  const [bounds, setBounds] = useState<PanelBounds>(getInitialBounds);

  // Keep ref to bounds for event handlers without re-attaching listeners
  const boundsRef = useRef<PanelBounds>(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  // Save bounds to localStorage when modified
  const saveBounds = useCallback((newBounds: PanelBounds) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newBounds));
    } catch {
      // ignore
    }
  }, []);

  // Window resize handler: ensure panel stays within visible viewport
  useEffect(() => {
    const handleWindowResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setBounds((prev) => {
        const effMinWidth = Math.min(MIN_WIDTH, vw - 16);
        const effMinHeight = Math.min(MIN_HEIGHT, vh - 16);
        const width = Math.max(effMinWidth, Math.min(vw - 16, prev.width));
        const height = Math.max(effMinHeight, Math.min(vh - 16, prev.height));
        const x = Math.max(8, Math.min(vw - width - 8, prev.x));
        const y = Math.max(8, Math.min(vh - height - 8, prev.y));
        const adjusted = { x, y, width, height };
        saveBounds(adjusted);
        return adjusted;
      });
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [saveBounds]);

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

  // -------------------------------------------------------------
  // Dragging Implementation (Header Pointer Events)
  // -------------------------------------------------------------
  const dragStartRef = useRef<{ startPointerX: number; startPointerY: number; startX: number; startY: number } | null>(null);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Requirement 1: Do not initiate dragging on buttons or interactive controls
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) {
      return;
    }
    // Only primary button
    if (e.button !== 0) return;

    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    setIsDragging(true);
    dragStartRef.current = {
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startX: boundsRef.current.x,
      startY: boundsRef.current.y,
    };
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.preventDefault();

    const deltaX = e.clientX - dragStartRef.current.startPointerX;
    const deltaY = e.clientY - dragStartRef.current.startPointerY;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const currentW = boundsRef.current.width;
    const currentH = boundsRef.current.height;

    // Requirement 1 & 5: Keep panel within viewport & header accessible
    const minX = 8;
    const maxX = Math.max(minX, vw - currentW - 8);
    const minY = 8;
    const maxY = Math.max(minY, vh - currentH - 8);

    const nextX = Math.max(minX, Math.min(maxX, dragStartRef.current.startX + deltaX));
    const nextY = Math.max(minY, Math.min(maxY, dragStartRef.current.startY + deltaY));

    setBounds((prev) => ({
      ...prev,
      x: nextX,
      y: nextY,
    }));
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStartRef.current = null;
    setIsDragging(false);
    saveBounds(boundsRef.current);
  };

  // -------------------------------------------------------------
  // Resizing Implementation (Edge & Corner Pointer Events)
  // -------------------------------------------------------------
  const resizeStartRef = useRef<{
    startPointerX: number;
    startPointerY: number;
    startBounds: PanelBounds;
    direction: ResizeDirection;
  } | null>(null);

  const startResize = (direction: ResizeDirection, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    setActiveResizeDir(direction);
    resizeStartRef.current = {
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startBounds: { ...boundsRef.current },
      direction,
    };

    // Set cursor on document body during resize to avoid cursor flickering
    const cursorMap: Record<ResizeDirection, string> = {
      n: 'ns-resize',
      s: 'ns-resize',
      e: 'ew-resize',
      w: 'ew-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
      nw: 'nwse-resize',
      se: 'nwse-resize',
    };
    document.body.style.cursor = cursorMap[direction];
    document.body.style.userSelect = 'none';
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current) return;
    e.preventDefault();

    const { startPointerX, startPointerY, startBounds, direction } = resizeStartRef.current;
    const deltaX = e.clientX - startPointerX;
    const deltaY = e.clientY - startPointerY;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Requirement 3: Enforce strict minimum dimensions
    const effMinWidth = Math.min(MIN_WIDTH, vw - 16);
    const effMinHeight = Math.min(MIN_HEIGHT, vh - 16);
    const maxW = Math.max(effMinWidth, vw - 16);
    const maxH = Math.max(effMinHeight, vh - 16);

    let nextX = startBounds.x;
    let nextY = startBounds.y;
    let nextW = startBounds.width;
    let nextH = startBounds.height;

    // 1. Horizontal adjustments
    if (direction.includes('e')) {
      // Dragging right edge: expand width to the right
      nextW = Math.max(effMinWidth, Math.min(maxW, startBounds.width + deltaX));
      // Clamp so right edge doesn't push beyond viewport
      if (nextX + nextW > vw - 8) {
        nextW = Math.max(effMinWidth, vw - 8 - nextX);
      }
    } else if (direction.includes('w')) {
      // Dragging left edge: expand width to the left
      const potentialW = startBounds.width - deltaX;
      nextW = Math.max(effMinWidth, Math.min(maxW, potentialW));
      nextX = startBounds.x + (startBounds.width - nextW);
      // Clamp left edge
      if (nextX < 8) {
        nextX = 8;
        nextW = startBounds.x + startBounds.width - 8;
      }
    }

    // 2. Vertical adjustments
    if (direction.includes('s')) {
      // Dragging bottom edge: expand height downward
      nextH = Math.max(effMinHeight, Math.min(maxH, startBounds.height + deltaY));
      // Clamp so bottom edge doesn't push beyond viewport
      if (nextY + nextH > vh - 8) {
        nextH = Math.max(effMinHeight, vh - 8 - nextY);
      }
    } else if (direction.includes('n')) {
      // Dragging top edge: expand height upward
      const potentialH = startBounds.height - deltaY;
      nextH = Math.max(effMinHeight, Math.min(maxH, potentialH));
      nextY = startBounds.y + (startBounds.height - nextH);
      // Clamp top edge
      if (nextY < 8) {
        nextY = 8;
        nextH = startBounds.y + startBounds.height - 8;
      }
    }

    setBounds({
      x: nextX,
      y: nextY,
      width: nextW,
      height: nextH,
    });
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    resizeStartRef.current = null;
    setActiveResizeDir(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveBounds(boundsRef.current);
  };

  // Only render if open and NOT on full Ask AURA page (Requirement 7 & 12)
  if (!isFloatingOpen || activeTab === 'ask-aura') {
    return null;
  }

  const isInteracting = isDragging || activeResizeDir !== null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Ask AURA floating assistant"
      style={{
        position: 'fixed',
        left: `${bounds.x}px`,
        top: `${bounds.y}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        zIndex: 50,
      }}
      className={`flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl backdrop-blur-md overflow-hidden ${
        isInteracting
          ? 'select-none ring-2 ring-blue-500/50 shadow-blue-500/10'
          : 'transition-[box-shadow] duration-200'
      }`}
    >
      {/* --------------------------------------------------------- */}
      {/* 8 Resize Handles: Edges and Corners (Requirement 2 & 3)    */}
      {/* --------------------------------------------------------- */}

      {/* Top Edge */}
      <div
        onPointerDown={(e) => startResize('n', e)}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute top-0 left-3 right-3 h-2 cursor-ns-resize z-20 hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors"
        title="Resize vertically"
      />

      {/* Bottom Edge */}
      <div
        onPointerDown={(e) => startResize('s', e)}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute bottom-0 left-3 right-3 h-2 cursor-ns-resize z-20 hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors"
        title="Resize vertically"
      />

      {/* Left Edge */}
      <div
        onPointerDown={(e) => startResize('w', e)}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute top-3 bottom-3 left-0 w-2 cursor-ew-resize z-20 hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors"
        title="Resize horizontally"
      />

      {/* Right Edge */}
      <div
        onPointerDown={(e) => startResize('e', e)}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute top-3 bottom-3 right-0 w-2 cursor-ew-resize z-20 hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors"
        title="Resize horizontally"
      />

      {/* Top-Left Corner */}
      <div
        onPointerDown={(e) => startResize('nw', e)}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize z-30 hover:bg-blue-500/30 active:bg-blue-500/40 rounded-tl-3xl transition-colors"
        title="Resize diagonally"
      />

      {/* Top-Right Corner */}
      <div
        onPointerDown={(e) => startResize('ne', e)}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize z-30 hover:bg-blue-500/30 active:bg-blue-500/40 rounded-tr-3xl transition-colors"
        title="Resize diagonally"
      />

      {/* Bottom-Left Corner */}
      <div
        onPointerDown={(e) => startResize('sw', e)}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize z-30 hover:bg-blue-500/30 active:bg-blue-500/40 rounded-bl-3xl transition-colors"
        title="Resize diagonally"
      />

      {/* Bottom-Right Corner (with subtle visual grip affordance) */}
      <div
        onPointerDown={(e) => startResize('se', e)}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        className="group/grip absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-30 flex items-end justify-end p-1 hover:bg-blue-500/30 active:bg-blue-500/40 rounded-br-3xl transition-colors"
        title="Resize diagonally"
      >
        <svg
          className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500 group-hover/grip:text-blue-500 transition-colors pointer-events-none"
          viewBox="0 0 6 6"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5 1L1 5M5 3.5L3.5 5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </div>

      {/* --------------------------------------------------------- */}
      {/* Draggable Header (Requirement 1)                         */}
      {/* --------------------------------------------------------- */}
      <div
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        className={`h-14 px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/90 flex items-center justify-between shrink-0 cursor-grab active:cursor-grabbing select-none ${
          isDragging ? 'bg-blue-50/40 dark:bg-blue-950/40' : ''
        }`}
        title="Click and drag to reposition panel"
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2 pointer-events-none">
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
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
              {activeConvTitle || 'Financial Companion'}
            </div>
          </div>
        </div>

        {/* Drag Handle Indicator */}
        <div className="hidden sm:flex items-center justify-center text-slate-300 dark:text-slate-600 pointer-events-none">
          <GripHorizontal className="w-4 h-4" />
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
        <div className="bg-blue-50 dark:bg-blue-950 px-3 py-1.5 text-[11px] font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5 border-b border-blue-100 dark:border-blue-900 shrink-0">
          <Mic className="w-3 h-3 text-blue-600 dark:text-blue-400 animate-pulse" />
          <span className="truncate">{voiceNotice}</span>
        </div>
      )}

      {/* Scrollable Message Thread */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs min-h-0">
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
        {attachedSelectionContext && (
          <div className="mb-2 px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 flex items-center justify-between text-xs animate-in fade-in">
            <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-medium truncate">
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="truncate">Attached: {attachedSelectionContext.previewText || `${attachedSelectionContext.count} selected ${attachedSelectionContext.source}`}</span>
            </div>
            <button
              type="button"
              onClick={clearSelectionContext}
              className="p-0.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-500 dark:text-blue-400"
              title="Remove attached selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
