'use client';

import { LayoutDashboard, Plus } from 'lucide-react';
import { useFinanceStore } from '@/stores/finance-store';
import { useUIStore } from '@/stores/ui-store';
import { PageLayout } from '@/components/layout/page-layout';
import { Button } from '@/components/ui/button';
import { KpiGrid } from '@/features/dashboard/components/kpi-grid';
import { ReconciliationAlert } from '@/features/accounts/components/reconciliation-alert';
import { WalletCarousel } from '@/features/dashboard/components/wallet-carousel';
import { RecentTransactions } from '@/features/dashboard/components/recent-transactions';
import { TopCategories } from '@/features/dashboard/components/top-categories';

/**
 * Inicio: dashboard de KPIs, sin gráficos.
 * El análisis visual vive en Reportes, donde hay filtros para sostenerlo.
 */
export function DashboardView() {
  const user = useFinanceStore((s) => s.user);
  const workspaces = useFinanceStore((s) => s.workspaces);
  const currentWorkspaceId = useFinanceStore((s) => s.currentWorkspaceId);
  const openSheet = useUIStore((s) => s.openSheet);

  const firstName =
    (user?.user_metadata?.full_name || user?.email?.split('@')[0] || '').split(' ')[0];
  const workspace = workspaces.find((w) => w.id === currentWorkspaceId);

  return (
    <PageLayout
      title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
      description={workspace?.name}
      icon={LayoutDashboard}
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => openSheet('new-transaction')}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Nuevo</span>
        </Button>
      }
    >
        <ReconciliationAlert />
        <KpiGrid />
        <WalletCarousel />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecentTransactions />
          <TopCategories />
        </div>
    </PageLayout>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return 'Buenas noches';
  if (hour < 13) return 'Buen día';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
