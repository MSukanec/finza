'use client';

import { BalanceCard } from '@/features/dashboard/components/balance-card';
import { QuickActions } from '@/features/dashboard/components/quick-actions';
import { SpendingChart } from '@/features/dashboard/components/spending-chart';
import { RecentTransactions } from '@/features/dashboard/components/recent-transactions';
import { AccountsOverview } from '@/features/dashboard/components/accounts-overview';

export function DashboardView() {
  return (
    <div className="space-y-6 stagger-children">
      <BalanceCard />
      <QuickActions />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpendingChart />
        <RecentTransactions />
      </div>
      <AccountsOverview />
    </div>
  );
}
