'use client';

import { BalanceCard } from '@/features/dashboard/components/balance-card';
import { QuickActions } from '@/features/dashboard/components/quick-actions';
import { SpendingChart } from '@/features/dashboard/components/spending-chart';
import { RecentTransactions } from '@/features/dashboard/components/recent-transactions';
import { AccountsOverview } from '@/features/dashboard/components/accounts-overview';
import { LayoutDashboard } from 'lucide-react';
import { PageLayout } from '@/components/layout/page-layout';

export function DashboardView() {
  return (
    <PageLayout
      title="Inicio"
      icon={LayoutDashboard}
      className="stagger-children"
    >
      <BalanceCard />
      <QuickActions />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AccountsOverview />
        <RecentTransactions />
      </div>
      <SpendingChart />
    </PageLayout>
  );
}
