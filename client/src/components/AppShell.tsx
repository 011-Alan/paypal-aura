import React, { useState, useEffect } from 'react';
import {
  Home,
  Wallet,
  BarChart3,
  PieChart,
  Repeat,
  CalendarDays,
  Target,
  ShoppingBag,
  CreditCard,
  Users,
  Sparkles,
  Zap,
  Settings,
  Bell,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatInr } from '../lib/api';

export type NavTabId =
  | 'home'
  | 'my-money'
  | 'spending'
  | 'financial-plan'
  | 'commitments'
  | 'calendar'
  | 'goals'
  | 'smart-purchase'
  | 'payments'
  | 'family'
  | 'ask-aura'
  | 'automations'
  | 'settings';

export interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const NAVIGATION_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'my-money', label: 'My Money', icon: Wallet },
  { id: 'spending', label: 'Spending', icon: BarChart3 },
  { id: 'financial-plan', label: 'Financial Plan', icon: PieChart },
  { id: 'commitments', label: 'Upcoming Commitments', icon: Repeat },
  { id: 'calendar', label: 'Financial Calendar', icon: CalendarDays },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'smart-purchase', label: 'Smart Purchase Companion', icon: ShoppingBag },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'family', label: 'Family', icon: Users },
  { id: 'ask-aura', label: 'Ask AURA', icon: Sparkles },
  { id: 'automations', label: 'Automations', icon: Zap },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface AppShellProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ activeTab, onSelectTab, children }) => {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    try {
      const res = await apiRequest('/notifications');
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user, activeTab]);

  const markAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row text-navy-900">
      {/* Sidebar Desktop Navigation */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              A
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight text-navy-900">AURA</div>
              <div className="text-xs text-slate-500">Your Money. Your Goals.</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Protected
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-xs border border-blue-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-navy-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {user && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/60">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-navy-900 truncate">{user.name}</div>
                <div className="text-xs text-slate-500 truncate">{user.email}</div>
              </div>
              <button
                onClick={logout}
                title="Switch Account / Sign Out"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
              <span>Monthly Income</span>
              <span className="font-semibold text-navy-800">{formatInr(user.monthlyIncome)}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div>
              <h1 className="text-base lg:text-lg font-bold text-navy-900">
                {NAVIGATION_ITEMS.find((i) => i.id === activeTab)?.label || 'AURA'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onSelectTab('ask-aura')}
              className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold border border-blue-200 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              Ask AURA Assistant
            </button>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition border border-slate-200"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Financial Reminders & Alerts
                    </span>
                    <button
                      onClick={markAllRead}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">No notifications yet.</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n._id}
                          className={`p-3.5 text-xs ${n.isRead ? 'bg-white' : 'bg-blue-50/40'}`}
                        >
                          <div className="font-semibold text-navy-900">{n.title}</div>
                          <div className="text-slate-600 mt-0.5 leading-relaxed">{n.message}</div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            {new Date(n.createdAt).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1">
            {NAVIGATION_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Page Body */}
        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
