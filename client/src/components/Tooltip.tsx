import React, { useState, useRef } from 'react';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const show = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setIsVisible(true);
  };

  const hide = () => {
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <button
        type="button"
        className="inline-flex items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none focus:text-blue-600 rounded transition p-0.5"
        aria-label={`More info: ${content}`}
        tabIndex={0}
      >
        {children || <Info className="w-3.5 h-3.5" />}
      </button>

      {isVisible && (
        <span
          role="tooltip"
          className={`absolute z-50 pointer-events-none w-max max-w-xs px-2.5 py-1.5 rounded-lg bg-navy-900 text-white text-xs font-normal shadow-lg transition-opacity duration-150 leading-tight ${positionClasses[position]}`}
        >
          {content}
        </span>
      )}
    </span>
  );
};
