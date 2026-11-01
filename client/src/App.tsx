import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell, NavTabId } from './components/AppShell';
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
import { AutomationsPage } from './pages/AutomationsPage';
import { SettingsPage } from './pages/SettingsPage';

const MainRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTabId>('home');

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

  return (
    <AppShell activeTab={activeTab} onSelectTab={setActiveTab}>
      {activeTab === 'home' && <HomePage onNavigate={setActiveTab} />}
      {activeTab === 'my-money' && <MyMoneyPage />}
      {activeTab === 'spending' && <SpendingPage />}
      {activeTab === 'financial-plan' && <FinancialPlanPage />}
      {activeTab === 'commitments' && <CommitmentsPage />}
      {activeTab === 'calendar' && <FinancialCalendarPage />}
      {activeTab === 'goals' && <GoalsPage />}
      {activeTab === 'smart-purchase' && <SmartPurchasePage onNavigate={setActiveTab} />}
      {activeTab === 'payments' && <PaymentsPage />}
      {activeTab === 'family' && <FamilyPage />}
      {activeTab === 'ask-aura' && <AskAuraPage />}
      {activeTab === 'automations' && <AutomationsPage />}
      {activeTab === 'settings' && <SettingsPage />}
    </AppShell>
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
