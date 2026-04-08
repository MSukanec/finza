// ===== CORE TYPES =====

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface Account {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'digital';
  currency_id: string;
  balance: number;
  color: string;
  icon: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  group_name: string;
  color?: string;
  icon?: string;
  is_default: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency_id: string;
  category_id: string | null;
  account_id: string;
  destination_account_id: string | null; // For transfers
  description: string;
  date: string;
  created_at: string;
}

export interface Budget {
  id: string;
  name: string;
  period: 'monthly' | 'weekly';
  categories: BudgetCategory[];
  currency_id: string;
  created_at: string;
}

export interface BudgetCategory {
  category_id: string;
  limit_amount: number;
  spent_amount: number;
}

// ===== UI TYPES =====

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  type: TransactionType;
  color: string;
}

export type DateRange = {
  from: Date;
  to: Date;
};

export type ViewMode = 'list' | 'grid';
