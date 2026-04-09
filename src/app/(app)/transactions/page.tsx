import { TransactionsView } from '@/features/transactions/views/transactions-view';
import { Suspense } from 'react';

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <TransactionsView />
    </Suspense>
  );
}
