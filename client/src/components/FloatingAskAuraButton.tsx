import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { useAskAura } from '../context/AskAuraContext';

const FULL_LABEL = 'Ask AURA';
const LETTER_INTERVAL_MS = 28; // Fast, crisp typing (~220ms total)

export const FloatingAskAuraButton: React.FC = () => {
  const { isFloatingOpen, openFloatingChat, activeTab } = useAskAura();
  const [isHovered, setIsHovered] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const typingTimerRef = useRef<any>(null);

  // Requirement:
  // - If on full Ask AURA page: HIDDEN
  // - If floating chat panel is OPEN: HIDDEN
  // - Normal page and panel CLOSED: VISIBLE
  const isVisible = activeTab !== 'ask-aura' && !isFloatingOpen;

  // Whenever the panel opens or visibility is lost, strictly reset hover & text state
  useEffect(() => {
    if (!isVisible || isFloatingOpen) {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      setIsHovered(false);
      setDisplayedText('');
    }
  }, [isVisible, isFloatingOpen]);

  // Letter-by-letter reveal animation while hovered
  useEffect(() => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    if (isHovered && isVisible) {
      let currentIdx = 0;
      setDisplayedText('');
      typingTimerRef.current = setInterval(() => {
        currentIdx += 1;
        if (currentIdx <= FULL_LABEL.length) {
          setDisplayedText(FULL_LABEL.slice(0, currentIdx));
        } else {
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
        }
      }, LETTER_INTERVAL_MS);
    } else {
      setDisplayedText('');
    }

    return () => {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, [isHovered, isVisible]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setIsHovered(false);
    setDisplayedText('');
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      setIsHovered(false);
      setDisplayedText('');
      try {
        e.currentTarget.blur();
      } catch {
        // ignore
      }
      openFloatingChat();
    },
    [openFloatingChat]
  );

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-40 select-none"
      style={{ direction: 'rtl' }} // Expands horizontally towards the left
    >
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerLeave={handleMouseLeave}
        onBlur={handleMouseLeave}
        aria-label="Ask AURA financial assistant"
        title="Ask AURA (AI Companion)"
        style={{ direction: 'ltr' }}
        className={`group relative flex items-center h-14 rounded-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 text-white shadow-xl shadow-blue-600/30 hover:shadow-2xl hover:shadow-blue-600/40 border border-white/20 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/50 transition-all duration-300 ease-out cursor-pointer ${
          isHovered ? 'w-44 px-4' : 'w-14 justify-center'
        }`}
      >
        {/* Glow effect on hover */}
        <span
          className={`absolute inset-0 rounded-full bg-blue-400/20 blur-md transition-opacity duration-300 pointer-events-none ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />

        {/* Existing Ask AURA star symbol (Sparkles), kept towards the left inside the expanded button */}
        <div className="relative flex items-center justify-center shrink-0 w-6 h-6 transition-transform duration-300 group-hover:scale-110">
          <Sparkles className="w-5 h-5 text-white animate-pulse" />
        </div>

        {/* Letter-by-letter animated text on hover */}
        <div
          className={`overflow-hidden transition-all duration-300 flex items-center whitespace-nowrap ${
            isHovered ? 'opacity-100 ml-2.5 max-w-[120px]' : 'opacity-0 max-w-0 ml-0'
          }`}
        >
          <span className="text-sm font-bold tracking-wide text-white drop-shadow-xs">
            {displayedText}
          </span>
          {/* Subtle cursor blink during letter reveal */}
          {isHovered && displayedText.length < FULL_LABEL.length && (
            <span className="inline-block w-1 h-3.5 bg-white/80 ml-0.5 animate-pulse rounded-xs" />
          )}
        </div>
      </button>
    </div>
  );
};
