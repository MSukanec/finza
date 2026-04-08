'use client';

import { useEffect, useRef } from 'react';
import { useFinanceStore } from '@/stores/finance-store';

export function StoreHydrator({ children }: { children: React.ReactNode }) {
  const hydrated = useRef(false);
  const hydrate = useFinanceStore((s) => s.hydrate);
  const login = useFinanceStore((s) => s.login);
  const user = useFinanceStore((s) => s.user);

  useEffect(() => {
    if (!hydrated.current) {
      hydrate().then(() => { hydrated.current = true; });
    }
  }, [hydrate, login]);

  return <>{children}</>;
}
