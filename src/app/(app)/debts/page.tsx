import { AdminOnly } from '@/components/admin-only';
import { DebtsView } from '@/features/debts/views/debts-view';

export default function DebtsPage() {
  return (
    <AdminOnly>
      <DebtsView />
    </AdminOnly>
  );
}
