import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, getStoredToken, setStoredToken } from '../lib/api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  currency: string;
  monthlyIncome: number;
  familyGroupId?: string;
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

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  registerAccount: (payload: {
    name: string;
    email: string;
    password: string;
    pin: string;
    monthlyIncome: number;
  }) => Promise<void>;
  loginAsDemoAlex: () => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loginAsDemoAlex = useCallback(async () => {
    const res = await apiRequest('/auth/demo-login', { method: 'POST' });
    setStoredToken(res.token);
    setUser(res.user);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const token = getStoredToken();
      if (!token) {
        await loginAsDemoAlex();
        return;
      }
      const res = await apiRequest('/auth/me');
      setUser(res.user);
    } catch {
      try {
        await loginAsDemoAlex();
      } catch {
        setStoredToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [loginAsDemoAlex]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const loginWithCredentials = async (email: string, password: string) => {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
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
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithCredentials,
        registerAccount,
        loginAsDemoAlex,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
