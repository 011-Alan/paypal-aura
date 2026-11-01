/// <reference types="vite/client" />

const API_BASE = (import.meta.env?.VITE_API_URL ? `https://${import.meta.env.VITE_API_URL}`.replace('https://https://', 'https://') : '') + '/api';

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

export function formatInr(amount: number | undefined | null): string {
  const num = Number(amount || 0);
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
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
