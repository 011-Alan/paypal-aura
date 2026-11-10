import React, { useMemo } from 'react';
import { marked } from 'marked';
import { CodeBlock } from './CodeBlock';
import { EmailDraftCard } from './EmailDraftCard';
import { ProductRecommendationCard, ProductItem } from './ProductRecommendationCard';
import { FinancialSummaryCard } from './FinancialSummaryCard';

// Configure marked with GitHub flavored markdown & linebreaks
marked.setOptions({
  gfm: true,
  breaks: true,
});

interface ConversationalResponseRendererProps {
  content: string;
  className?: string;
  onNavigate?: (tab: string) => void;
  toolAction?: any;
  purchaseCompanion?: any;
}

interface ContentSegment {
  type: 'markdown' | 'code' | 'email_draft' | 'products' | 'financial_summary';
  content?: string;
  lang?: string;
  title?: string;
  data?: any;
}

/**
 * Universal Conversational Response Renderer for AURA.
 * Parses Gemini assistant messages, separating:
 * 1. Fenced Code Blocks (```lang ... ```) -> Interactive Syntax Highlighted CodeBlock with Copy & Collapse
 * 2. Structured Email Drafts -> EmailDraftCard with in-place editable subject/body & copy
 * 3. Tables, Blockquotes, Lists, Bold, Links, Mathematical formulas -> Rich Tailwind Typography
 * 4. Product recommendations & Financial snapshots -> Specialized native UI cards
 */
export const ConversationalResponseRenderer: React.FC<ConversationalResponseRendererProps> = ({
  content,
  className = '',
  onNavigate,
  toolAction,
  purchaseCompanion,
}) => {
  const segments = useMemo(() => {
    if (!content) return [];

    // Clean stray escaped markdown slashes while preserving ₹ (INR) and $ (USD) currencies
    const normalized = content
      .replace(/\\\*/g, '*')
      .replace(/\\_/g, '_')
      .replace(/\\`/g, '`')
      .replace(/\\#/g, '#');

    const result: ContentSegment[] = [];

    // Check for Email Draft format: e.g. "Subject: ...\n\nDear ...\nBest regards..."
    const emailMatch = normalized.match(
      /(?:Subject|Email Subject):\s*([^\n]+)\n\n([\s\S]+?)(?:\n\n(?:Best regards|Warm regards|Sincerely|Thanks),?\s*([^\n]+))?$/i
    );

    // Regex to split code blocks: ```lang\ncode\n```
    const codeBlockRegex = /```([a-zA-Z0-9_\-+]*)\n([\s\S]*?)```/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(normalized)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        const textBefore = normalized.substring(lastIndex, matchIndex).trim();
        if (textBefore) {
          result.push({ type: 'markdown', content: textBefore });
        }
      }

      const lang = match[1]?.trim() || 'text';
      const code = match[2]?.trim() || '';
      result.push({ type: 'code', lang, content: code });

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < normalized.length) {
      const remainingText = normalized.substring(lastIndex).trim();
      if (remainingText) {
        // If the remaining text is formatted strictly as an email draft and not already caught
        if (emailMatch && remainingText.includes(emailMatch[1])) {
          result.push({
            type: 'email_draft',
            data: {
              subject: emailMatch[1]?.trim(),
              body: emailMatch[2]?.trim(),
              senderName: emailMatch[3]?.trim() || 'AURA User',
            },
          });
        } else {
          result.push({ type: 'markdown', content: remainingText });
        }
      }
    }

    return result;
  }, [content]);

  // Extract products if present in purchaseCompanion
  const companionProducts: ProductItem[] = useMemo(() => {
    if (purchaseCompanion?.evaluatedProducts && Array.isArray(purchaseCompanion.evaluatedProducts)) {
      return purchaseCompanion.evaluatedProducts.map((opt: any) => ({
        ...opt.product,
        guidanceCategory: opt.evaluation?.guidanceCategory,
        affordabilityScore: opt.evaluation?.affordabilityScore,
        impactPercent: opt.evaluation?.impactOnDiscretionaryPercent,
        explanation: opt.evaluation?.explanation,
      }));
    }
    return [];
  }, [purchaseCompanion]);

  if (!content && companionProducts.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Action Status Indicator pill (Section 15) */}
      {toolAction?.title && (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/60 text-xs font-semibold text-blue-700 dark:text-blue-300 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span>{toolAction.title}</span>
        </div>
      )}

      {segments.map((seg, idx) => {
        if (seg.type === 'code') {
          return (
            <CodeBlock
              key={`seg-code-${idx}`}
              code={seg.content || ''}
              language={seg.lang || 'text'}
            />
          );
        }

        if (seg.type === 'email_draft') {
          return (
            <EmailDraftCard
              key={`seg-email-${idx}`}
              subject={seg.data?.subject}
              body={seg.data?.body}
              senderName={seg.data?.senderName}
            />
          );
        }

        // Markdown segment
        const parsedHtml = marked.parse(seg.content || '') as string;
        return (
          <div
            key={`seg-md-${idx}`}
            className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed
              prose-p:my-2 prose-p:leading-relaxed
              prose-headings:my-2.5 prose-headings:font-bold prose-headings:text-navy-950 dark:prose-headings:text-white
              prose-ul:my-2 prose-ul:pl-5 prose-ul:list-disc
              prose-ol:my-2 prose-ol:pl-5 prose-ol:list-decimal
              prose-li:my-0.5
              prose-strong:font-semibold prose-strong:text-navy-950 dark:prose-strong:text-white
              prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:pl-3.5 prose-blockquote:italic prose-blockquote:my-2.5 prose-blockquote:text-slate-600 dark:prose-blockquote:text-slate-300
              prose-code:px-1.5 prose-code:py-0.5 prose-code:bg-slate-200/70 dark:prose-code:bg-slate-700/70 prose-code:rounded prose-code:text-xs prose-code:font-mono
              prose-table:my-3 prose-table:w-full prose-table:border-collapse prose-table:text-xs
              prose-th:border prose-th:border-slate-300 dark:prose-th:border-slate-700 prose-th:p-2 prose-th:bg-slate-100 dark:prose-th:bg-slate-800 prose-th:font-semibold prose-th:text-left
              prose-td:border prose-td:border-slate-300 dark:prose-td:border-slate-700 prose-td:p-2"
            dangerouslySetInnerHTML={{ __html: parsedHtml }}
          />
        );
      })}

      {/* Render Product Cards if purchase companion products are attached */}
      {companionProducts.length > 0 && (
        <div className="pt-2 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pl-1">
            Verified Retailer Options
          </div>
          <div className="grid grid-cols-1 gap-3">
            {companionProducts.slice(0, 3).map((prod: any) => (
              <ProductRecommendationCard
                key={prod.id}
                product={prod}
                guidanceCategory={prod.guidanceCategory}
                affordabilityScore={prod.affordabilityScore}
                impactPercent={prod.impactPercent}
                explanation={prod.explanation}
                onSelectAction={() => onNavigate?.('smart-purchases')}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
