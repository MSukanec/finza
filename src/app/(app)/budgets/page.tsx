import { AdminOnly } from '@/components/admin-only';
import { BudgetsView } from '@/features/budgets/views/budgets-view';

export default function BudgetsPage() {
  return (
    <AdminOnly>
      <BudgetsView />
    </AdminOnly>
  );
}
