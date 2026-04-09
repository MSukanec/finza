import type { Currency, Account, Category, Transaction, Budget } from './types';

// ===== CURRENCIES =====

export const CURRENCIES: Currency[] = [
  { id: 'ars', code: 'ARS', name: 'Peso Argentino', symbol: '$', decimals: 2 },
  { id: 'usd', code: 'USD', name: 'Dólar Estadounidense', symbol: 'US$', decimals: 2 },
  { id: 'eur', code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { id: 'brl', code: 'BRL', name: 'Real Brasileño', symbol: 'R$', decimals: 2 },
];

// ===== DEFAULT CATEGORIES =====

export const DEFAULT_CATEGORIES: Category[] = [
  // Gastos
  { id: 'cat-food', name: 'Comida', type: 'expense', icon: 'UtensilsCrossed', color: '#f97316', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-transport', name: 'Transporte', type: 'expense', icon: 'Car', color: '#3b82f6', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-entertainment', name: 'Entretenimiento', type: 'expense', icon: 'Gamepad2', color: '#a855f7', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-health', name: 'Salud', type: 'expense', icon: 'Heart', color: '#ef4444', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-services', name: 'Servicios', type: 'expense', icon: 'Zap', color: '#eab308', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-home', name: 'Hogar', type: 'expense', icon: 'Home', color: '#14b8a6', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-education', name: 'Educación', type: 'expense', icon: 'GraduationCap', color: '#6366f1', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-shopping', name: 'Compras', type: 'expense', icon: 'ShoppingBag', color: '#ec4899', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-subscriptions', name: 'Suscripciones', type: 'expense', icon: 'CreditCard', color: '#8b5cf6', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-other-expense', name: 'Otros Gastos', type: 'expense', icon: 'MoreHorizontal', color: '#6b7280', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  // Ingresos
  { id: 'cat-salary', name: 'Salario', type: 'income', icon: 'Briefcase', color: '#22c55e', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-freelance', name: 'Freelance', type: 'income', icon: 'Laptop', color: '#06b6d4', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-investments', name: 'Inversiones', type: 'income', icon: 'TrendingUp', color: '#10b981', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-gifts', name: 'Regalos', type: 'income', icon: 'Gift', color: '#f472b6', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-other-income', name: 'Otros Ingresos', type: 'income', icon: 'Plus', color: '#84cc16', is_default: true, is_recurring: false, created_at: '2026-01-01T00:00:00Z' },
];

// ===== MOCK ACCOUNTS =====

export const MOCK_ACCOUNTS: Account[] = [
  { id: 'acc-cash', name: 'Efectivo', type: 'cash', currency_id: 'ars', balance: 45000, color: '#22c55e', icon: 'Wallet', created_at: '2026-01-01T00:00:00Z' },
  { id: 'acc-bank', name: 'Banco Nación', type: 'bank', currency_id: 'ars', balance: 250000, color: '#3b82f6', icon: 'Building2', created_at: '2026-01-01T00:00:00Z' },
  { id: 'acc-savings-usd', name: 'Ahorro USD', type: 'bank', currency_id: 'usd', balance: 1200, color: '#10b981', icon: 'PiggyBank', created_at: '2026-01-01T00:00:00Z' },
  { id: 'acc-credit', name: 'Tarjeta VISA', type: 'digital', currency_id: 'ars', balance: -35000, color: '#8b5cf6', icon: 'CreditCard', created_at: '2026-01-01T00:00:00Z' },
];

// ===== MOCK TRANSACTIONS =====

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'tx-1', type: 'expense', amount: 8500, currency_id: 'ars', category_id: 'cat-food', account_id: 'acc-cash', destination_account_id: null, description: 'Supermercado', date: daysAgo(0), created_at: daysAgo(0), status: 'draft' },
  { id: 'tx-2', type: 'income', amount: 450000, currency_id: 'ars', category_id: 'cat-salary', account_id: 'acc-bank', destination_account_id: null, description: 'Salario Marzo', date: daysAgo(1), created_at: daysAgo(1), status: 'draft' },
  { id: 'tx-3', type: 'expense', amount: 2500, currency_id: 'ars', category_id: 'cat-transport', account_id: 'acc-cash', destination_account_id: null, description: 'SUBE', date: daysAgo(1), created_at: daysAgo(1), status: 'draft' },
  { id: 'tx-4', type: 'expense', amount: 15000, currency_id: 'ars', category_id: 'cat-entertainment', account_id: 'acc-credit', destination_account_id: null, description: 'Netflix + Spotify', date: daysAgo(2), created_at: daysAgo(2), status: 'draft' },
  { id: 'tx-5', type: 'expense', amount: 45000, currency_id: 'ars', category_id: 'cat-services', account_id: 'acc-bank', destination_account_id: null, description: 'Electricidad + Gas', date: daysAgo(3), created_at: daysAgo(3), status: 'draft' },
  { id: 'tx-6', type: 'expense', amount: 12000, currency_id: 'ars', category_id: 'cat-food', account_id: 'acc-cash', destination_account_id: null, description: 'Delivery', date: daysAgo(3), created_at: daysAgo(3), status: 'draft' },
  { id: 'tx-7', type: 'transfer', amount: 50000, currency_id: 'ars', category_id: null, account_id: 'acc-bank', destination_account_id: 'acc-cash', description: 'Extracción cajero', date: daysAgo(4), created_at: daysAgo(4), status: 'draft' },
  { id: 'tx-8', type: 'income', amount: 85000, currency_id: 'ars', category_id: 'cat-freelance', account_id: 'acc-bank', destination_account_id: null, description: 'Proyecto web', date: daysAgo(5), created_at: daysAgo(5), status: 'draft' },
  { id: 'tx-9', type: 'expense', amount: 32000, currency_id: 'ars', category_id: 'cat-shopping', account_id: 'acc-credit', destination_account_id: null, description: 'Ropa Invierno', date: daysAgo(6), created_at: daysAgo(6), status: 'draft' },
  { id: 'tx-10', type: 'expense', amount: 5500, currency_id: 'ars', category_id: 'cat-health', account_id: 'acc-cash', destination_account_id: null, description: 'Farmacia', date: daysAgo(7), created_at: daysAgo(7), status: 'draft' },
  { id: 'tx-11', type: 'expense', amount: 18000, currency_id: 'ars', category_id: 'cat-food', account_id: 'acc-bank', destination_account_id: null, description: 'Restaurante', date: daysAgo(8), created_at: daysAgo(8), status: 'draft' },
  { id: 'tx-12', type: 'income', amount: 200, currency_id: 'usd', category_id: 'cat-freelance', account_id: 'acc-savings-usd', destination_account_id: null, description: 'Diseño logo', date: daysAgo(10), created_at: daysAgo(10), status: 'draft' },
  { id: 'tx-13', type: 'expense', amount: 75000, currency_id: 'ars', category_id: 'cat-home', account_id: 'acc-bank', destination_account_id: null, description: 'Alquiler', date: daysAgo(12), created_at: daysAgo(12), status: 'draft' },
  { id: 'tx-14', type: 'expense', amount: 9500, currency_id: 'ars', category_id: 'cat-education', account_id: 'acc-credit', destination_account_id: null, description: 'Curso Udemy', date: daysAgo(14), created_at: daysAgo(14), status: 'draft' },
  { id: 'tx-15', type: 'income', amount: 15000, currency_id: 'ars', category_id: 'cat-gifts', account_id: 'acc-cash', destination_account_id: null, description: 'Regalo cumpleaños', date: daysAgo(15), created_at: daysAgo(15), status: 'draft' },
];

// ===== MOCK BUDGETS =====

export const MOCK_BUDGETS: Budget[] = [
  {
    id: 'budget-1',
    name: 'Presupuesto Mensual',
    period: 'monthly',
    currency_id: 'ars',
    categories: [
      { category_id: 'cat-food', limit_amount: 80000, spent_amount: 39000 },
      { category_id: 'cat-transport', limit_amount: 25000, spent_amount: 2500 },
      { category_id: 'cat-entertainment', limit_amount: 30000, spent_amount: 15000 },
      { category_id: 'cat-services', limit_amount: 60000, spent_amount: 45000 },
      { category_id: 'cat-home', limit_amount: 85000, spent_amount: 75000 },
      { category_id: 'cat-shopping', limit_amount: 40000, spent_amount: 32000 },
    ],
    created_at: '2026-03-01T00:00:00Z',
  },
];

// ===== EXCHANGE RATES (to ARS) =====
export const EXCHANGE_RATES: Record<string, number> = {
  ars: 1,
  usd: 1150,
  eur: 1280,
  brl: 220,
};
