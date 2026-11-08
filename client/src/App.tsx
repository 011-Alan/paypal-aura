import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AskAuraProvider } from './context/AskAuraContext';
import { AppShell, NavTabId } from './components/AppShell';
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
        {activeTab === 'family' && <FamilyPage />}
        {activeTab === 'payments' && <PaymentsPage />}
        {activeTab === 'settings' && <SettingsPage />}
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
