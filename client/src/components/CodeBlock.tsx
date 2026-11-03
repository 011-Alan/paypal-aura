import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, Code2, Terminal } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup'; // HTML/XML
import 'prismjs/components/prism-markdown';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = 'text', title }) => {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const cleanLang = (language || 'text').toLowerCase().trim();
  const displayLang = cleanLang || 'text';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // Syntax highlight
  let highlightedHtml = '';
  try {
    const grammar = Prism.languages[cleanLang] || Prism.languages.text || Prism.languages.javascript;
    highlightedHtml = Prism.highlight(code, grammar, cleanLang);
  } catch {
    highlightedHtml = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const lineCount = code.split('\n').length;

  return (
    <div className="my-3 rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 text-slate-100 shadow-md">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2 font-mono">
          <Code2 className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
            {displayLang}
          </span>
          {title && <span className="text-slate-400 font-sans truncate">({title})</span>}
          <span className="text-slate-500 text-[10px]">
            • {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Collapse/Expand button */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 hover:text-white px-2 py-0.5 rounded text-[11px] text-slate-400 transition"
            title={isCollapsed ? 'Expand code block' : 'Collapse code block'}
            aria-label={isCollapsed ? 'Expand code block' : 'Collapse code block'}
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Expand</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Collapse</span>
              </>
            )}
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition active:scale-95 border border-slate-700"
            title="Copy code to clipboard"
            aria-label="Copy code to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-semibold text-[11px]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Body */}
      {!isCollapsed && (
        <div className="relative overflow-x-auto p-4 text-xs font-mono leading-relaxed bg-[#0d1117]">
          <pre className="!bg-transparent !p-0 !m-0 font-mono">
            <code
              className={`language-${cleanLang} !bg-transparent font-mono`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        </div>
      )}

      {/* Honesty note on code execution */}
      <div className="px-4 py-1.5 bg-slate-900/50 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <Terminal className="w-3 h-3 text-slate-500" />
          <span>AURA provides code review &amp; design. Live sandbox execution is not enabled.</span>
        </span>
      </div>
    </div>
  );
};
