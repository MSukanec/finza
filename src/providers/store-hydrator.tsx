'use client';

import { useEffect, useRef } from 'react';
import { useFinanceStore } from '@/stores/finance-store';

export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const isHydrated = useFinanceStore((s) => s.isHydrated);
  const hydrate = useFinanceStore((s) => s.hydrate);

  useEffect(() => {
    if (!isHydrated) {
      hydrate();
    }
  }, [isHydrated, hydrate]);

  return <>{children}</>;
}
