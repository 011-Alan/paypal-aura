/// <reference types="vite/client" />

function getApiBase(): string {
  let rawUrl = (import.meta.env?.VITE_API_URL || '').trim();
  if (!rawUrl) {
    return '/api';
  }
  // If protocol not present, add https://
  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    // If Render internal host name like 'aura-backend-api-88nx' (lacks domain dots), append .onrender.com
    if (!rawUrl.includes('.')) {
      rawUrl = `${rawUrl}.onrender.com`;
    }
    rawUrl = `https://${rawUrl}`;
  }
  // Strip trailing slashes
  rawUrl = rawUrl.replace(/\/+$/, '');
  // If it already ends with /api, avoid duplicating
  if (rawUrl.endsWith('/api')) {
    return rawUrl;
  }
  return `${rawUrl}/api`;
}

const API_BASE = getApiBase();

export function getStoredToken(): string | null {
  return localStorage.getItem('aura_auth_token');
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem('aura_auth_token', token);
  } else {
    localStorage.removeItem('aura_auth_token');
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export function getActiveCurrency(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('aura_currency');
      if (stored && typeof stored === 'string' && stored.trim() && stored.toUpperCase() !== 'INR') {
        return stored.trim().toUpperCase();
      }
      localStorage.setItem('aura_currency', 'USD');
    } catch {
      // localStorage may fail in private mode
    }
  }
  return 'USD';
}

export function setActiveCurrency(currency: string): void {
  if (typeof window !== 'undefined' && currency) {
    try {
      const norm = currency.trim().toUpperCase() === 'INR' ? 'USD' : currency.trim().toUpperCase();
      localStorage.setItem('aura_currency', norm);
      window.dispatchEvent(new CustomEvent('aura-currency-changed', { detail: { currency: norm } }));
    } catch {
      // ignored
    }
  }
}

export function formatCurrency(
  amount: number | undefined | null,
  isMasked: boolean = false,
  currencyCode?: string
): string {
  if (isMasked) return '••••••';
  const num = Number(amount || 0);
  let rawCurr = currencyCode || getActiveCurrency() || 'USD';
  if (rawCurr.toUpperCase() === 'INR') {
    rawCurr = 'USD';
  }
  const curr = rawCurr.toUpperCase();

  const isDecimal = num % 1 !== 0;
  const formattedNum = num.toLocaleString('en-US', {
    minimumFractionDigits: isDecimal ? 2 : 0,
    maximumFractionDigits: 2,
  });

  switch (curr) {
    case 'USD':
      return `$${formattedNum}`;
    case 'EUR':
      return `€${formattedNum}`;
    case 'GBP':
      return `£${formattedNum}`;
    default:
      return `$${formattedNum}`;
  }
}

export const formatInr = formatCurrency;

export function formatMaskedInr(
  amount: number | undefined | null,
  isVisible: boolean = false,
  currencyCode?: string
): string {
  return formatCurrency(amount, !isVisible, currencyCode);
}

export function formatDateShort(dateStr: string | Date | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
