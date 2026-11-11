import React, { useState, useEffect } from 'react';
import {
  User,
  Building2,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Save,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from './Tooltip';

export const AccountTypeSelectorSection: React.FC = () => {
  const { user, switchAccountType, refreshUser } = useAuth();

  // Saved account type defaults to 'personal'
  const savedAccountType: 'personal' | 'business' =
    user?.accountType === 'business' || user?.auraAccountType === 'BUSINESS'
      ? 'business'
      : 'personal';

  // Local selection state (mutually exclusive)
  const [selectedType, setSelectedType] = useState<'personal' | 'business'>(savedAccountType);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Sync with user profile when it updates
  useEffect(() => {
    setSelectedType(savedAccountType);
  }, [savedAccountType]);

  const hasUnsavedChanges = selectedType !== savedAccountType;

  const handleSelect = (type: 'personal' | 'business') => {
    setSelectedType(type);
    setFeedback(null);
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasUnsavedChanges) return;

    setSaving(true);
    setFeedback(null);

    try {
      await switchAccountType(selectedType);
      await refreshUser();
      window.dispatchEvent(new CustomEvent('aura-state-changed'));
      setFeedback({
        type: 'success',
        message: `Account type successfully saved as ${
          selectedType === 'business' ? 'Business Account' : 'Personal Account'
        }. Your navigation sidebar and Ask AURA financial context have been updated.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to update account type. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/60">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-navy-900 dark:text-white tracking-tight">
                Account Type
              </h3>
              <Tooltip content="Choose whether your AURA profile operates in Personal or Business mode. This customizes navigation and AI assistance." />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select your primary AURA operating mode. Only one account type can be active at a time.
            </p>
          </div>
        </div>

        {/* Current Active Status Pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Current Mode:</span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold border ${
              savedAccountType === 'business'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {savedAccountType === 'business' ? 'Business Account' : 'Personal Account'}
          </span>
        </div>
      </div>

      {/* Confirmation / Alert Message */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-medium flex items-start gap-3 border transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed flex-1">{feedback.message}</span>
        </div>
      )}

      {/* Mutually Exclusive Checkbox Options */}
      <form onSubmit={handleSaveChanges} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1: Personal Account */}
          <div
            onClick={() => handleSelect('personal')}
            role="checkbox"
            aria-checked={selectedType === 'personal'}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                handleSelect('personal');
              }
            }}
            className={`cursor-pointer rounded-2xl p-5 border transition-all relative select-none flex flex-col justify-between ${
              selectedType === 'personal'
                ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 shadow-xs ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    selectedType === 'personal'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-navy-900 dark:text-white">
                    Personal Account
                  </h4>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Consumer &amp; Household
                  </span>
                </div>
              </div>

              {/* Checkbox Icon */}
              <div className="shrink-0 text-blue-600 dark:text-blue-400">
                {selectedType === 'personal' ? (
                  <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Square className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                )}
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              Designed for individual and household financial life. Includes smart purchases, personal budgeting, savings goals, and commitments. Merchant Hub is hidden from the sidebar.
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Default Mode</span>
              {savedAccountType === 'personal' && (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Currently Active
                </span>
              )}
            </div>
          </div>

          {/* Option 2: Business Account */}
          <div
            onClick={() => handleSelect('business')}
            role="checkbox"
            aria-checked={selectedType === 'business'}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                handleSelect('business');
              }
            }}
            className={`cursor-pointer rounded-2xl p-5 border transition-all relative select-none flex flex-col justify-between ${
              selectedType === 'business'
                ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 shadow-xs ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    selectedType === 'business'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-navy-900 dark:text-white">
                    Business Account
                  </h4>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Commercial &amp; Merchant
                  </span>
                </div>
              </div>

              {/* Checkbox Icon */}
              <div className="shrink-0 text-blue-600 dark:text-blue-400">
                {selectedType === 'business' ? (
                  <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Square className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                )}
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              Enables commercial operating mode. Makes Merchant Hub visible in the navigation sidebar, activates business financial analysis in Ask AURA, and unlocks commercial cash-flow tools.
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Merchant Hub Enabled</span>
              {savedAccountType === 'business' && (
                <span className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400">
                  <CheckCircle2 className="w-3 h-3" /> Currently Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Security & Verification Boundary Clarification */}
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Operating Mode Distinction:</strong> Selecting Business Account configures your AURA operating profile and navigation. Access to privileged PayPal merchant settlements and seller orders requires verified PayPal seller credentials, which are verified separately below.
          </p>
        </div>

        {/* Save Changes Button */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {hasUnsavedChanges ? (
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                Pending selection: {selectedType === 'business' ? 'Business Account' : 'Personal Account'}. Click Save Changes to apply.
              </span>
            ) : (
              <span>Your account type is up to date.</span>
            )}
          </div>

          <button
            type="submit"
            disabled={!hasUnsavedChanges || saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-xs transition disabled:opacity-50 disabled:pointer-events-none"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : 'Save Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
