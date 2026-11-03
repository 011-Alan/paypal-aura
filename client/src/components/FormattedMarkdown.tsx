import React from 'react';
import { marked } from 'marked';

// Configure marked options: github-flavored markdown, breaks on single newline
marked.setOptions({
  gfm: true,
  breaks: true,
});

interface FormattedMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Safely renders markdown text with formatted lists, bold text, code, and links.
 * Cleans out any stray raw escaped markers (\*\*₹18,000\*\* -> **₹18,000**),
 * and prevents text clustering like 'svgListensvgCopysvgRegenerate'.
 */
export const FormattedMarkdown: React.FC<FormattedMarkdownProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Unescape double-escaped markdown markers if any exist (e.g. \\*\\* -> **)
  const cleanedContent = content
    .replace(/\\\*/g, '*')
    .replace(/\\_/g, '_')
    .replace(/\\`/g, '`')
    .replace(/\\#/g, '#');

  const html = marked.parse(cleanedContent) as string;

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed 
        prose-p:my-2 prose-p:leading-relaxed 
        prose-headings:my-2 prose-headings:font-bold 
        prose-ul:my-2 prose-ul:pl-5 prose-ul:list-disc
        prose-ol:my-2 prose-ol:pl-5 prose-ol:list-decimal
        prose-li:my-0.5
        prose-strong:font-semibold prose-strong:text-navy-950 dark:prose-strong:text-white
        prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:my-2
        prose-code:px-1.5 prose-code:py-0.5 prose-code:bg-slate-200/60 dark:prose-code:bg-slate-700/60 prose-code:rounded prose-code:text-xs
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
