import React, { useState } from 'react';
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

const MainRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTabId>('overview');

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
