import { AdminOnly } from '@/components/admin-only';
import { TransactionsImportView } from '@/features/transactions/views/transactions-import-view';

export default function ImportPage() {
  return (
    <AdminOnly>
      <TransactionsImportView />
    </AdminOnly>
  );
}
