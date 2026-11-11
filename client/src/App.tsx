import React, { useState, useEffect } from 'react';
import { Lock, Store } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AskAuraProvider } from './context/AskAuraContext';
import { AppShell, NavTabId } from './components/AppShell';
import { pageActionDispatcher } from './lib/pageActionDispatcher';
import { FloatingAskAuraButton } from './components/FloatingAskAuraButton';
import { FloatingChatPanel } from './components/FloatingChatPanel';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { MyMoneyPage } from './pages/MyMoneyPage';
import { SpendingPage } from './pages/SpendingPage';
import { FinancialPlanPage } from './pages/FinancialPlanPage';
import { CommitmentsPage } from './pages/CommitmentsPage';
import { FinancialCalendarPage } from './pages/FinancialCalendarPage';
import { GoalsPage } from './pages/GoalsPage';
import { SmartPurchasePage } from './pages/SmartPurchasePage';
import { PaymentsPage } from './pages/PaymentsPage';
import { FamilyPage } from './pages/FamilyPage';
import { AskAuraPage } from './pages/AskAuraPage';
import { DemoLabPage } from './pages/DemoLabPage';
import { SettingsPage } from './pages/SettingsPage';
import { DeveloperPortalPage } from './pages/DeveloperPortalPage';

function resolveInitialTab(): NavTabId {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) return tabParam as NavTabId;

    // Check PayPal checkout return parameters
    const viewParam = params.get('view');
    if (viewParam?.includes('checkout') || params.has('orderNumber') || params.has('token')) {
      return 'smart-purchases';
    }

    const path = window.location.pathname.replace(/^\/+/, '').split('/')[0];
    if (path === 'developer' || path === 'dev-portal') return 'developer';
    if (path === 'smart-purchases' || path === 'smart-purchase') return 'smart-purchases';
    if (path === 'payments') return 'payments';
    if (path === 'family') return 'family';
    if (path === 'goals') return 'goals';
    if (path === 'settings') return 'settings';
    if (path === 'accounts' || path === 'my-money') return 'accounts';
    if (path === 'transactions' || path === 'spending') return 'transactions';
  }
  return 'overview';
}

const MainRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTabId>(resolveInitialTab);

  useEffect(() => {
    pageActionDispatcher.setActiveRoute(activeTab);
    return pageActionDispatcher.registerNavigationHandler((tab) => {
      setActiveTab(tab as NavTabId);
    });
  }, [activeTab]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam) {
        setActiveTab(tabParam as NavTabId);
      } else if (params.get('view')?.includes('checkout') || params.has('orderNumber') || params.has('token')) {
        setActiveTab('smart-purchases');
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Initializing AURA Financial Ecosystem...
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const handleNavigate = (tab: any) => {
    setActiveTab(tab as NavTabId);
  };

  return (
    <AskAuraProvider activeTab={activeTab} onNavigate={setActiveTab}>
      <AppShell activeTab={activeTab} onSelectTab={setActiveTab}>
        {(activeTab === 'overview' || activeTab === 'home') && <HomePage onNavigate={handleNavigate} />}
        {(activeTab === 'accounts' || activeTab === 'my-money') && <MyMoneyPage />}
        {(activeTab === 'transactions' || activeTab === 'spending') && <SpendingPage />}
        {activeTab === 'ask-aura' && <AskAuraPage onNavigate={handleNavigate} />}
        {(activeTab === 'financial-planning' || activeTab === 'financial-plan') && <FinancialPlanPage />}
        {activeTab === 'commitments' && <CommitmentsPage />}
        {activeTab === 'calendar' && <FinancialCalendarPage />}
        {activeTab === 'goals' && <GoalsPage />}
        {(activeTab === 'smart-purchases' || activeTab === 'smart-purchase') && (
          <SmartPurchasePage onNavigate={handleNavigate} />
        )}
        {activeTab === 'merchant-hub' && (
          user?.merchantAccessEnabled ? (
            <SmartPurchasePage onNavigate={handleNavigate} initialTab="merchant-hub" />
          ) : user?.accountType === 'business' || user?.auraAccountType === 'BUSINESS' ? (
            <div className="p-8 max-w-xl mx-auto my-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
                <Store className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-navy-900 dark:text-white">Business Account Mode Active</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Your AURA profile is configured in <strong>Business Account</strong> mode. To manage live store inventory, fulfill customer orders, and receive verified PayPal settlements, please complete business seller verification.
              </p>
              <button
                onClick={() => setActiveTab('settings')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition"
              >
                Check PayPal Business Eligibility in Settings
              </button>
            </div>
          ) : (
            <div className="p-8 max-w-xl mx-auto my-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-navy-900 dark:text-white">Merchant Hub Restricted</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Merchant Hub is available for Business accounts. Switch your account type to Business Account in Settings to enable business operations.
              </p>
              <button
                onClick={() => setActiveTab('settings')}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition"
              >
                Open Settings
              </button>
            </div>
          )
        )}
        {activeTab === 'family' && <FamilyPage />}
        {activeTab === 'payments' && <PaymentsPage />}
        {activeTab === 'settings' && <SettingsPage />}
        {(activeTab === 'developer' || activeTab === 'dev-portal') && <DeveloperPortalPage />}
        {(activeTab === 'demo-lab' || activeTab === 'automations') && (
          <DemoLabPage onNavigateToProduct={handleNavigate} />
        )}
      </AppShell>
      <FloatingAskAuraButton />
      <FloatingChatPanel />
    </AskAuraProvider>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  );
}

export default App;
