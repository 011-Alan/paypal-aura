import React, { useState } from 'react';
import { Mail, Copy, Check, Edit3, Send, Sparkles } from 'lucide-react';

interface EmailDraftProps {
  recipient?: string;
  subject?: string;
  body: string;
  senderName?: string;
  className?: string;
}

export const EmailDraftCard: React.FC<EmailDraftProps> = ({
  recipient = 'recipient@example.com',
  subject = 'Financial Update',
  body,
  senderName = 'Alex Sharma',
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSubject, setEditedSubject] = useState(subject);
  const [editedBody, setEditedBody] = useState(body);

  const fullEmailText = `To: ${recipient}\nSubject: ${editedSubject}\n\n${editedBody}\n\nBest regards,\n${senderName}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullEmailText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className={`my-4 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-slate-900/90 shadow-sm overflow-hidden text-left ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-blue-100/60 dark:bg-slate-800/80 border-b border-blue-200/80 dark:border-slate-700/80">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-bold text-navy-900 dark:text-white uppercase tracking-wider">
            Email Draft
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-200/80 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-medium">
            Ready to review
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700 transition"
            title={isEditing ? 'Save edits' : 'Edit draft'}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Done' : 'Edit'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition active:scale-95 shadow-xs"
            title="Copy entire email to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Draft</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metadata fields */}
      <div className="p-4 space-y-3 text-xs">
        <div className="flex items-center gap-2 border-b border-blue-100 dark:border-slate-800 pb-2">
          <span className="text-slate-500 dark:text-slate-400 font-semibold w-16 shrink-0">To:</span>
          <span className="font-mono text-navy-900 dark:text-slate-200">{recipient}</span>
        </div>

        <div className="flex items-center gap-2 border-b border-blue-100 dark:border-slate-800 pb-2">
          <span className="text-slate-500 dark:text-slate-400 font-semibold w-16 shrink-0">Subject:</span>
          {isEditing ? (
            <input
              type="text"
              value={editedSubject}
              onChange={(e) => setEditedSubject(e.target.value)}
              className="flex-1 px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-medium text-navy-900 dark:text-white"
            />
          ) : (
            <span className="font-semibold text-navy-900 dark:text-white">{editedSubject}</span>
          )}
        </div>

        {/* Email Body */}
        <div className="pt-2">
          {isEditing ? (
            <textarea
              rows={8}
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              className="w-full p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs leading-relaxed text-navy-900 dark:text-slate-100 font-sans focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-800 whitespace-pre-wrap leading-relaxed text-navy-900 dark:text-slate-100">
              {editedBody}
              <div className="mt-4 text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60 pt-2 text-[11px]">
                Best regards,<br />
                <strong>{senderName}</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
