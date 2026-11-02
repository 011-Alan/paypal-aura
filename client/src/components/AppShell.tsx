import React, { useState, useEffect } from 'react';
import {
  Home,
  Wallet,
  Receipt,
  Sparkles,
  PieChart,
  Repeat,
  CalendarDays,
  ShoppingBag,
  CreditCard,
  Users,
  Settings,
  Bell,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  CheckCircle2,
  FlaskConical,
  Eye,
  EyeOff,
  UserCheck,
  ChevronDown,
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
  | 'goals'
  | 'smart-purchase'
  | 'automations';

export interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip?: string;
}

export const MAIN_PRODUCT_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Home, tooltip: 'Your decision-first financial cockpit' },
  { id: 'accounts', label: 'Accounts', icon: Wallet, tooltip: 'Connected bank, savings, and wallet balances' },
  { id: 'transactions', label: 'Transactions', icon: Receipt, tooltip: 'Interactive transaction intelligence' },
  { id: 'ask-aura', label: 'Ask AURA', icon: Sparkles, tooltip: 'Conversational planning & financial assistant' },
  { id: 'financial-planning', label: 'Financial Planning', icon: PieChart, tooltip: 'Budget allocations & savings targets' },
  { id: 'commitments', label: 'Commitments', icon: Repeat, tooltip: 'Recurring bills, rent, EMIs, and subscriptions' },
  { id: 'calendar', label: 'Financial Calendar', icon: CalendarDays, tooltip: 'Bryntum life calendar with due date sync' },
  { id: 'smart-purchases', label: 'Smart Purchases', icon: ShoppingBag, tooltip: '7-factor purchase affordability evaluator' },
  { id: 'family', label: 'Family Finance', icon: Users, tooltip: 'Household shared budget with strict privacy boundaries' },
  { id: 'payments', label: 'Payments', icon: CreditCard, tooltip: 'Authorized PayPal payments with Financial Guardian' },
  { id: 'settings', label: 'Settings', icon: Settings, tooltip: 'Security PIN, policy caps, and privacy preferences' },
];

interface AppShellProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ activeTab, onSelectTab, children }) => {
  const {
    user,
    logout,
    balancesVisible,
    toggleBalancesVisible,
    isDemoMode,
    activeDemoPersona,
    switchDemoPersona,
  } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const isDemoLabActive = activeTab === 'demo-lab' || activeTab === 'automations';

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

  const getPageTitle = (tab: NavTabId) => {
    if (tab === 'demo-lab' || tab === 'automations') return 'Demo Lab & Engineering Observability';
    const match = MAIN_PRODUCT_NAV_ITEMS.find((i) => i.id === tab);
    if (match) return match.label;
    if (tab === 'home') return 'Overview';
    if (tab === 'my-money') return 'Accounts';
    if (tab === 'spending') return 'Transactions';
    if (tab === 'financial-plan') return 'Financial Planning';
    if (tab === 'smart-purchase') return 'Smart Purchases';
    return 'AURA';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row text-navy-900">
      {/* Sidebar Desktop Navigation */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen">
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div
            onClick={() => onSelectTab('overview')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-xs group-hover:bg-blue-700 transition">
              A
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight text-navy-900">PROJECT AURA</div>
              <div className="text-[11px] text-slate-500">Financial Companion</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3 h-3" />
            Protected
          </span>
        </div>

        {/* Primary Navigation List */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Main Product
          </div>
          {MAIN_PRODUCT_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id ||
              (item.id === 'overview' && activeTab === 'home') ||
              (item.id === 'accounts' && activeTab === 'my-money') ||
              (item.id === 'transactions' && activeTab === 'spending') ||
              (item.id === 'financial-planning' && activeTab === 'financial-plan') ||
              (item.id === 'smart-purchases' && activeTab === 'smart-purchase');

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-2xs border border-blue-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-navy-900'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.id === 'ask-aura' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    AI
                  </span>
                )}
              </button>
            );
          })}

          {/* Distinct Separation: Demo Lab Entry */}
          <div className="pt-4 mt-3 border-t border-slate-100">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Developer &amp; Testing
            </div>
            <button
              onClick={() => onSelectTab('demo-lab')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isDemoLabActive
                  ? 'bg-navy-900 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <FlaskConical className={`w-4 h-4 shrink-0 ${isDemoLabActive ? 'text-blue-300' : 'text-slate-500'}`} />
                <span className="font-semibold truncate">Demo Lab</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isDemoLabActive ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                Dev &amp; Sim
              </span>
            </button>
          </div>
        </nav>

        {/* User Card & Persona Indicator */}
        {user && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/70">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-bold text-navy-900 truncate">{user.name}</div>
                <div className="text-xs text-slate-500 truncate">{user.email}</div>
              </div>
              <button
                onClick={logout}
                title="Sign Out"
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Income summary with privacy balance support */}
            <div className="mt-3 flex items-center justify-between text-xs text-slate-600 bg-white px-3 py-2 rounded-xl border border-slate-200">
              <span className="flex items-center gap-1.5">
                <span>Monthly Income</span>
                <Tooltip content="Verified baseline income used for budget planning" />
              </span>
              <span className="font-semibold text-navy-900">{formatInr(user.monthlyIncome, !balancesVisible)}</span>
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
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100"
              aria-label="Open mobile menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-base lg:text-lg font-bold text-navy-900">{getPageTitle(activeTab)}</h1>
              {isDemoLabActive ? (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-navy-900 text-white">
                  Demo Lab Environment
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Main Product
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Mode Indicator & Persona Switcher */}
            {isDemoMode ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPersonaMenuOpen(!personaMenuOpen)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold border border-blue-200 transition"
                >
                  <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Demo Mode:</span>
                  <span className="capitalize">{activeDemoPersona || 'Alex'}</span>
                  <ChevronDown className="w-3 h-3 text-blue-500" />
                </button>

                {personaMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2 space-y-1">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Switch Demo Persona
                    </div>
                    {(['alex', 'priya', 'maya'] as const).map((persona) => (
                      <button
                        key={persona}
                        onClick={() => {
                          switchDemoPersona(persona);
                          setPersonaMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition ${
                          activeDemoPersona === persona
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {persona} Sharma
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Personal Mode
              </span>
            )}

            {/* Global Financial Privacy Balance Eye Toggle */}
            <button
              onClick={toggleBalancesVisible}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                balancesVisible
                  ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/80'
              }`}
              title={balancesVisible ? 'Click to hide sensitive financial amounts' : 'Click to reveal financial amounts'}
              aria-label={balancesVisible ? 'Hide balances' : 'Show balances'}
            >
              {balancesVisible ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                  <span className="hidden md:inline">Hide Balances</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden md:inline">Reveal Balances</span>
                </>
              )}
            </button>

            {/* Demo Lab / Main Product Switcher Pill */}
            {isDemoLabActive ? (
              <button
                onClick={() => onSelectTab('overview')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition"
              >
                Exit Lab
              </button>
            ) : (
              <button
                onClick={() => onSelectTab('demo-lab')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition"
              >
                <FlaskConical className="w-3.5 h-3.5 text-slate-500" />
                Demo Lab
              </button>
            )}

            {/* Ask AURA Header Shortcut */}
            <button
              onClick={() => onSelectTab('ask-aura')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ask AURA</span>
            </button>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition border border-slate-200"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-3xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Notifications &amp; Reminders
                    </span>
                    <button
                      onClick={markAllRead}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">No new notifications.</div>
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
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Main Product
            </div>
            {MAIN_PRODUCT_NAV_ITEMS.map((item) => {
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
                    isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  onSelectTab('demo-lab');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium ${
                  isDemoLabActive ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                <FlaskConical className="w-4 h-4" />
                <span>Demo Lab (Dev &amp; Testing)</span>
              </button>
            </div>
          </div>
        )}

        {/* Page Body */}
        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
