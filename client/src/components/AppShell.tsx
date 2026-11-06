import React, { useState, useEffect } from 'react';
import {
  Home,
  Sparkles,
  Wallet,
  Receipt,
  Repeat,
  PieChart,
  Target,
  CreditCard,
  CalendarDays,
  Users,
  Settings,
  Bell,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  FlaskConical,
  CheckCircle2,
  ArrowRight,
  ShoppingBag,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest, formatInr } from '../lib/api';
import { Tooltip } from './Tooltip';

export type NavTabId =
  | 'overview'
  | 'accounts'
  | 'transactions'
  | 'ask-aura'
  | 'financial-planning'
  | 'commitments'
  | 'calendar'
  | 'goals'
  | 'smart-purchases'
  | 'family'
  | 'payments'
  | 'settings'
  | 'demo-lab'
  // Backward compatibility aliases
  | 'home'
  | 'my-money'
  | 'spending'
  | 'financial-plan'
  | 'smart-purchase'
  | 'automations';

export interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip?: string;
  badge?: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAVIGATION_GROUPS: NavGroup[] = [
  {
    group: 'Home',
    items: [
      { id: 'overview', label: 'Overview', icon: Home, tooltip: 'Your primary financial summary and next steps' },
      { id: 'ask-aura', label: 'Ask AURA', icon: Sparkles, tooltip: 'Conversational assistant, planning, and task execution', badge: 'AI' },
    ],
  },
  {
    group: 'My Finances',
    items: [
      { id: 'accounts', label: 'Accounts', icon: Wallet, tooltip: 'Connected bank accounts and liquid balances' },
      { id: 'transactions', label: 'Transactions', icon: Receipt, tooltip: 'Transaction history, search, and categorisation' },
      { id: 'commitments', label: 'Bills & Commitments', icon: Repeat, tooltip: 'Recurring bills, subscriptions, and EMIs' },
      { id: 'financial-planning', label: 'Financial Planning', icon: PieChart, tooltip: 'Budget allocations and monthly cashflow plans' },
      { id: 'goals', label: 'Goals', icon: Target, tooltip: 'Savings targets and progress milestones' },
      { id: 'payments', label: 'Payments', icon: CreditCard, tooltip: 'Review and approve payments with PIN verification' },
    ],
  },
  {
    group: 'My Life',
    items: [
      { id: 'calendar', label: 'Calendar', icon: CalendarDays, tooltip: 'Financial calendar with scheduled bill reminders' },
      { id: 'family', label: 'Family Finance', icon: Users, tooltip: 'Shared household budgets with privacy boundaries' },
      { id: 'smart-purchases', label: 'Smart Purchases', icon: ShoppingBag, tooltip: 'Affordability calculator before making large purchases' },
    ],
  },
  {
    group: 'Account',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings, tooltip: 'Financial profile, security PIN, and preferences' },
    ],
  },
];

interface AppShellProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ activeTab, onSelectTab, children }) => {
  const { user, logout, theme, setTheme, formatMoney } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Listen for AI application control navigation events (Section 4)
  useEffect(() => {
    const handleAuraNavigate = (e: any) => {
      const page = e.detail?.page;
      if (page) {
        onSelectTab(page as NavTabId);
      }
    };
    window.addEventListener('aura-navigate', handleAuraNavigate);
    return () => window.removeEventListener('aura-navigate', handleAuraNavigate);
  }, [onSelectTab]);

  const isDemoLabActive = activeTab === 'demo-lab' || activeTab === 'automations';

  const loadNotifications = async () => {
    try {
      const res = await apiRequest('/notifications');
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const markAllRead = async () => {
    try {
      await apiRequest('/notifications/mark-all-read', { method: 'POST' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // Non-fatal
    }
  };

  const getPageTitle = (tab: NavTabId): string => {
    switch (tab) {
      case 'overview':
      case 'home':
        return 'Overview';
      case 'ask-aura':
        return 'Ask AURA';
      case 'accounts':
      case 'my-money':
        return 'Accounts';
      case 'transactions':
      case 'spending':
        return 'Transactions';
      case 'commitments':
        return 'Bills & Commitments';
      case 'financial-planning':
      case 'financial-plan':
        return 'Financial Planning';
      case 'goals':
        return 'Financial Goals';
      case 'calendar':
        return 'Financial Calendar';
      case 'smart-purchases':
      case 'smart-purchase':
        return 'Smart Purchases';
      case 'family':
        return 'Family Finance';
      case 'payments':
        return 'Payments';
      case 'settings':
        return 'Settings';
      case 'demo-lab':
      case 'automations':
        return 'Demo Lab — Technical Demonstration';
      default:
        return 'PROJECT AURA';
    }
  };

  const isTabActive = (itemId: NavTabId): boolean => {
    if (activeTab === itemId) return true;
    if (itemId === 'overview' && activeTab === 'home') return true;
    if (itemId === 'accounts' && activeTab === 'my-money') return true;
    if (itemId === 'transactions' && activeTab === 'spending') return true;
    if (itemId === 'financial-planning' && activeTab === 'financial-plan') return true;
    if (itemId === 'smart-purchases' && activeTab === 'smart-purchase') return true;
    if (itemId === 'demo-lab' && activeTab === 'automations') return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex text-slate-800 dark:text-slate-100 antialiased font-sans">
      {/* Desktop Navigation Sidebar */}
      <aside className="w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0 hidden lg:flex lg:flex-col justify-between h-screen sticky top-0 z-40">
        {/* App Logo & Header */}
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              A
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-navy-900 dark:text-white leading-tight">PROJECT AURA</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Financial Companion</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <ShieldCheck className="w-3 h-3" />
            Secure
          </span>
        </div>

        {/* Grouped Navigation List */}
        <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {NAVIGATION_GROUPS.map((group) => (
            <div key={group.group}>
              <div className="px-3 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.group}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isTabActive(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold shadow-2xs border border-blue-100 dark:border-blue-700'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-navy-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Strict Separation: Dedicated Demo Lab Navigation Item */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="px-3 pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Testing &amp; Evaluation
            </div>
            <button
              onClick={() => onSelectTab('demo-lab')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isDemoLabActive
                  ? 'bg-navy-900 dark:bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <FlaskConical className={`w-4 h-4 shrink-0 ${isDemoLabActive ? 'text-blue-300' : 'text-slate-500'}`} />
                <span className="font-semibold truncate">Demo Lab</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isDemoLabActive ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                Sim &amp; Dev
              </span>
            </button>
          </div>
        </nav>

        {/* User Card */}
        {user && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-bold text-navy-900 dark:text-white truncate">{user.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</div>
              </div>
              <button
                onClick={() => logout('sidebar_sign_out')}
                title="Sign Out"
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="flex items-center gap-1.5">
                <span>Monthly Income</span>
                <Tooltip content="Configured monthly baseline income used for financial calculations" />
              </span>
              <span className="font-semibold text-navy-900 dark:text-white">{formatMoney(user.monthlyIncome)}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        {/* Top Header */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 px-4 lg:px-8 h-16 flex items-center justify-between">
          {/* Left Title & Mobile Menu Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div>
              <h1 className="text-base lg:text-lg font-bold text-navy-900 dark:text-white leading-tight">
                {getPageTitle(activeTab)}
              </h1>
              {isDemoLabActive && (
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 inline-block mt-0.5">
                  Fictional Simulator &amp; Multi-Agent Lab
                </span>
              )}
            </div>
          </div>

          {/* Right Area: Ask AURA, Notifications, Settings, and Logout */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Quick Ask AURA Entry Point */}
            <button
              onClick={() => onSelectTab('ask-aura')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition border ${
                activeTab === 'ask-aura'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 dark:text-blue-300 dark:border-blue-800'
              }`}
              title="Chat with AURA AI"
              aria-label="Open Ask AURA AI assistant"
            >
              <Sparkles className={`w-4 h-4 ${activeTab === 'ask-aura' ? 'text-white' : 'text-blue-500 dark:text-blue-400'}`} />
              <span className="hidden sm:inline">Ask AURA</span>
            </button>

            {/* Notifications Icon Button */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition border border-slate-200 dark:border-slate-700"
                aria-label="View notifications"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Notifications &amp; Reminders
                    </span>
                    <button
                      onClick={markAllRead}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">No new notifications.</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n._id}
                          className={`p-3.5 text-xs ${n.isRead ? 'bg-white dark:bg-slate-900' : 'bg-blue-50/40 dark:bg-blue-950/40'}`}
                        >
                          <div className="font-semibold text-navy-900 dark:text-white">{n.title}</div>
                          <div className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{n.message}</div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
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

            {/* Settings Icon Button */}
            <button
              onClick={() => onSelectTab('settings')}
              className={`p-2.5 rounded-xl transition border ${
                activeTab === 'settings'
                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
              }`}
              aria-label="Account Settings"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Appearance Theme Toggle (Section 13) */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition border border-slate-200 dark:border-slate-700"
              aria-label="Toggle theme appearance"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300" />}
            </button>

            {/* Clearly Visible Logout Action (Immediately next to Settings) */}
            <button
              onClick={() => logout('header_sign_out')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800 transition"
              aria-label="Sign out of account"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </header>

        {/* Mobile Slide-Over Menu (When Menu Button Clicked) */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-4 space-y-4 max-h-[calc(100vh-4rem)] overflow-y-auto">
            {NAVIGATION_GROUPS.map((group) => (
              <div key={group.group}>
                <div className="px-2 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.group}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isTabActive(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onSelectTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-base font-medium transition ${
                          active
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold border border-blue-100 dark:border-blue-900'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`w-5 h-5 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  onSelectTab('demo-lab');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition ${
                  isDemoLabActive
                    ? 'bg-navy-900 dark:bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <FlaskConical className="w-5 h-5 text-blue-500" />
                <span>Demo Lab (Simulators &amp; Agents)</span>
              </button>
            </div>

            {user && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-navy-900 dark:text-white">{user.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                </div>
                <button
                  onClick={() => logout()}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition"
                >
                  Log Out
                </button>
              </div>
            )}
          </div>
        )}

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>

        {/* Mobile Bottom Navigation Bar (Fixed for comfortable one-thumb reach) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-40 px-2 flex items-center justify-around shadow-lg transition-colors">
          <button
            onClick={() => onSelectTab('overview')}
            className={`flex flex-col items-center justify-center w-16 h-full text-xs font-medium ${
              isTabActive('overview') ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Overview</span>
          </button>

          <button
            onClick={() => onSelectTab('ask-aura')}
            className={`flex flex-col items-center justify-center w-16 h-full text-xs font-medium ${
              isTabActive('ask-aura') ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Sparkles className="w-5 h-5 text-blue-500" />
            <span className="text-[10px] mt-0.5">Ask AURA</span>
          </button>

          <button
            onClick={() => onSelectTab('transactions')}
            className={`flex flex-col items-center justify-center w-16 h-full text-xs font-medium ${
              isTabActive('transactions') ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Activity</span>
          </button>

          <button
            onClick={() => onSelectTab('payments')}
            className={`flex flex-col items-center justify-center w-16 h-full text-xs font-medium ${
              isTabActive('payments') ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <CreditCard className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Payments</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`flex flex-col items-center justify-center w-16 h-full text-xs font-medium ${
              mobileMenuOpen ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Menu</span>
          </button>
        </nav>
      </div>
    </div>
  );
};
