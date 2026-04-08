'use client';

import { TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

export function QuickActions() {
  const openSheet = useUIStore((s) => s.openSheet);

  const actions = [
    {
      id: 'income',
      label: 'Ingreso',
      icon: TrendingUp,
      className: 'bg-income/15 text-income hover:bg-income/25',
      onClick: () => openSheet('new-transaction', { type: 'income' }),
    },
    {
      id: 'expense',
      label: 'Gasto',
      icon: TrendingDown,
      className: 'bg-expense/15 text-expense hover:bg-expense/25',
      onClick: () => openSheet('new-transaction', { type: 'expense' }),
    },
    {
      id: 'transfer',
      label: 'Transferencia',
      icon: ArrowLeftRight,
      className: 'bg-transfer/15 text-transfer hover:bg-transfer/25',
      onClick: () => openSheet('new-transaction', { type: 'transfer' }),
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={action.onClick}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200 ${action.className}`}
        >
          <action.icon className="w-6 h-6" />
          <span className="text-xs font-medium">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
