import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest, getStoredToken, setStoredToken, formatCurrency } from '../lib/api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  accountType?: 'personal' | 'business';
  auraAccountType?: 'PERSONAL' | 'BUSINESS' | 'UNVERIFIED';
  paypalAccountType?: 'PERSONAL' | 'BUSINESS' | 'UNKNOWN';
  merchantVerificationStatus?: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'UNVERIFIED';
  merchantAccessEnabled?: boolean;
  merchantVerifiedAt?: string | null;
  paypalMerchantId?: string | null;
  verificationMethod?: string | null;
  verificationUpdatedAt?: string | null;
  currency: string;
  preferredCurrency?: string;
  monthlyIncome: number;
  familyGroupId?: string;
  paypalUserId?: string;
  paypalPayerId?: string;
  paypalEmail?: string;
  paypalAccountLinked?: boolean;
  paypalIdentityVerified?: boolean;
  authenticationProvider?: 'password' | 'paypal' | 'both';
  spendingPreferences: {
    riskTolerance: 'conservative' | 'balanced' | 'growth';
    priorityCategories: string[];
    savingsTargetPercent: number;
  };
  financialPolicy: {
    requirePinAboveAmount: number;
    singleTransactionLimit: number;
    dailySpendingLimit: number;
    requireExplicitApproval: boolean;
    discretionaryMonthlyCap: number;
    allowFamilySharedView: boolean;
    blockedCategories: string[];
  };
}

export type AppTheme = 'light' | 'dark' | 'system';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  isDemoMode: boolean;
  activeDemoPersona: 'alex' | 'priya' | 'maya' | 'bruce' | null;
  balancesVisible: boolean;
  toggleBalancesVisible: () => void;
  setBalancesVisible: (visible: boolean) => void;
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  registerAccount: (payload: {
    name: string;
    email: string;
    password: string;
    pin: string;
    monthlyIncome: number;
  }) => Promise<void>;
  loginAsDemoAlex: () => Promise<void>;
  switchDemoPersona: (persona: 'alex' | 'priya' | 'maya' | 'bruce') => Promise<void>;
  switchAccountType: (accountType: 'personal' | 'business') => Promise<void>;
  logout: (reason?: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  formatMoney: (amount: number | undefined | null) => string;
  continueSession: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (Section 14)
const WARNING_THRESHOLD_MS = 28 * 60 * 1000; // Warning at 28 minutes (2 mins remaining)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Appearance & Theme State (Section 13)
  const [theme, setThemeState] = useState<AppTheme>(() => {
    return (localStorage.getItem('aura_theme') as AppTheme) || 'system';
  });

  // Balance masking state
  const [balancesVisible, setBalancesVisibleState] = useState<boolean>(() => {
    return localStorage.getItem('aura_balances_visible') !== 'false';
  });

  // Inactivity timeout state (Section 14)
  const lastActivityRef = useRef<number>(Date.now());
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(120);

  // Apply theme class to document element
  const applyTheme = useCallback((currentTheme: AppTheme) => {
    const root = document.documentElement;
    const isDark =
      currentTheme === 'dark' ||
      (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  const setTheme = useCallback(
    (newTheme: AppTheme) => {
      setThemeState(newTheme);
      localStorage.setItem('aura_theme', newTheme);
      applyTheme(newTheme);
    },
    [applyTheme]
  );

  useEffect(() => {
    applyTheme(theme);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') applyTheme('system');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme, applyTheme]);

  const toggleBalancesVisible = useCallback(() => {
    setBalancesVisibleState((prev) => {
      const next = !prev;
      localStorage.setItem('aura_balances_visible', String(next));
      return next;
    });
  }, []);

  const setBalancesVisible = useCallback((visible: boolean) => {
    setBalancesVisibleState(visible);
    localStorage.setItem('aura_balances_visible', String(visible));
  }, []);

  const isDemoMode = Boolean(user?.email && user.email.endsWith('@aura-demo.finance'));

  const activeDemoPersona: 'alex' | 'priya' | 'maya' | null = !isDemoMode
    ? null
    : user?.email?.includes('priya')
    ? 'priya'
    : user?.email?.includes('maya')
    ? 'maya'
    : 'alex';

  const refreshUser = useCallback(async () => {
    try {
      // Check for PayPal authentication callback in URL parameters
      if (typeof window !== 'undefined' && window.location.search) {
        const urlParams = new URLSearchParams(window.location.search);
        const authStatus = urlParams.get('auth');
        const paypalToken = urlParams.get('token');

        if (authStatus === 'paypal_success' && paypalToken) {
          setStoredToken(paypalToken);
          // Clean the query string without reloading the page
          urlParams.delete('auth');
          urlParams.delete('token');
          urlParams.delete('isNewUser');
          urlParams.delete('isLinked');
          const remainingQuery = urlParams.toString();
          const cleanUrl = window.location.pathname + (remainingQuery ? `?${remainingQuery}` : '');
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }

      const token = getStoredToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      const res = await apiRequest('/auth/me');
      setUser(res.user);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Listen for real-time application state updates (Section 4 & 11)
  useEffect(() => {
    const handleStateChange = () => {
      refreshUser();
    };
    window.addEventListener('aura-state-changed', handleStateChange);
    return () => window.removeEventListener('aura-state-changed', handleStateChange);
  }, [refreshUser]);

  const logout = useCallback(async (reason: string = 'user_logout') => {
    const token = getStoredToken();
    if (token) {
      try {
        await apiRequest('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }).catch(() => {});
      } catch {
        // Non-fatal
      }
    }
    setStoredToken(null);
    sessionStorage.clear();
    setUser(null);
    setShowInactivityWarning(false);
  }, []);

  // Window close beacon (Section 14)
  useEffect(() => {
    const handlePageHide = () => {
      const token = getStoredToken();
      if (token) {
        try {
          const blob = new Blob([JSON.stringify({ token, reason: 'window_closed' })], {
            type: 'application/json',
          });
          navigator.sendBeacon('/api/auth/logout-beacon', blob);
        } catch {
          // best-effort
        }
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, []);

  // Monitor meaningful user activity for inactivity timeout (Section 14)
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showInactivityWarning) {
      setShowInactivityWarning(false);
    }
  }, [showInactivityWarning]);

  const continueSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowInactivityWarning(false);
  }, []);

  useEffect(() => {
    if (!user) return;

    let throttleTimer: any = null;
    const handleUserActivity = () => {
      if (!throttleTimer) {
        resetActivity();
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
        }, 1000); // Throttle activity updates to at most once per second
      }
    };

    const monitoredEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    monitoredEvents.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    // Inactivity check interval every 2 seconds
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        logout('30_min_inactivity_timeout');
      } else if (elapsed >= WARNING_THRESHOLD_MS) {
        const remainingSec = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000));
        setSecondsRemaining(remainingSec);
        setShowInactivityWarning(true);
      } else {
        setShowInactivityWarning(false);
      }
    }, 2000);

    return () => {
      monitoredEvents.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      clearInterval(interval);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [user, resetActivity, logout]);

  const loginWithCredentials = async (email: string, password: string) => {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    lastActivityRef.current = Date.now();
  };

  const registerAccount = async (payload: {
    name: string;
    email: string;
    password: string;
    pin: string;
    monthlyIncome: number;
  }) => {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    setUser(res.user);
    lastActivityRef.current = Date.now();
  };

  const loginAsDemoAlex = async () => {
    const res = await apiRequest('/auth/demo-login', { method: 'POST' });
    setStoredToken(res.token);
    setUser(res.user);
    lastActivityRef.current = Date.now();
  };

  const switchDemoPersona = async (persona: 'alex' | 'priya' | 'maya' | 'bruce') => {
    const res = await apiRequest<{ token: string; user: UserProfile }>('/auth/demo-switch', {
      method: 'POST',
      body: JSON.stringify({ persona }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    lastActivityRef.current = Date.now();
  };

  const switchAccountType = async (accountType: 'personal' | 'business') => {
    const res = await apiRequest<{ success: boolean; user: UserProfile }>('/auth/account-type', {
      method: 'POST',
      body: JSON.stringify({ accountType }),
    });
    if (res.user) {
      setUser(res.user);
    }
  };

  useEffect(() => {
    const raw = user?.preferredCurrency || user?.currency;
    const c = (raw && raw.toUpperCase() !== 'INR') ? raw.toUpperCase() : 'USD';
    localStorage.setItem('aura_currency', c);
  }, [user?.currency, user?.preferredCurrency]);

  // User-configured currency formatter (Section 13)
  const formatMoney = useCallback(
    (amount: number | undefined | null): string => {
      const raw = user?.preferredCurrency || user?.currency;
      const c = (raw && raw.toUpperCase() !== 'INR') ? raw.toUpperCase() : 'USD';
      return formatCurrency(amount, !balancesVisible, c);
    },
    [user?.currency, user?.preferredCurrency, balancesVisible]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isDemoMode,
        activeDemoPersona,
        balancesVisible,
        toggleBalancesVisible,
        setBalancesVisible,
        theme,
        setTheme,
        loginWithCredentials,
        registerAccount,
        loginAsDemoAlex,
        switchDemoPersona,
        switchAccountType,
        logout,
        refreshUser,
        formatMoney,
        continueSession,
      }}
    >
      {children}

      {/* Inactivity Warning Dialog (Section 14) */}
      {showInactivityWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-amber-200 dark:border-amber-700 text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-4 text-xl font-bold">
              ⏱
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Session Inactivity Warning
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              For your financial privacy and security, AURA will automatically sign you out in{' '}
              <span className="font-bold text-amber-600 dark:text-amber-400">
                {Math.floor(secondsRemaining / 60)}:
                {(secondsRemaining % 60).toString().padStart(2, '0')}
              </span>{' '}
              unless you continue.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={continueSession}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-sm"
              >
                Stay Logged In
              </button>
              <button
                onClick={() => logout('user_timeout_acknowledged')}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors"
              >
                Sign Out Now
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
