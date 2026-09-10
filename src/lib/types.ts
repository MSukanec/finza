// ===== CORE TYPES =====

/**
 * Un aporte NO es un ingreso y un retiro NO es un egreso.
 *
 * Los cuatro mueven la caja, pero sólo `income` y `expense` son RESULTADO: lo
 * que el negocio generó y consumió. Un aporte es plata que pone un socio de su
 * bolsillo y un retiro es plata que se lleva; ninguno dice nada sobre si el
 * negocio funcionó. Por eso el saldo de la billetera los cuenta y el resultado
 * del mes no. Ver `afectaResultado` en lib/money.
 */
export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'contribution'
  | 'withdrawal';

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
  initial_balance?: number;
  balance: number;
  color: string;
  icon: string;
  created_at: string;
}

/** Un socio del negocio. Existe aunque todavía no tenga cuenta en la app. */
export interface Partner {
  id: string;
  name: string;
  /** public.users.id, cuando el socio ya se registró y lo vinculaste. */
  user_id: string | null;
  /** Participación en el negocio, 0 a 100. */
  ownership_pct: number;
  notes?: string | null;
  joined_at?: string;
  created_at: string;
}

/** Situación de un socio contra el negocio. La calcula la base. */
export interface PartnerPosition extends Partner {
  aportes: number;
  retiros: number;
  /** aportes − retiros. Positivo: el negocio le debe. */
  saldo: number;
  /** Qué % del total retirado se llevó. Se compara contra ownership_pct. */
  retiros_pct: number | null;
  ultimo_mov: string | null;
}

export type WorkspaceRole = 'owner' | 'member';

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  /** Rol del usuario actual en este espacio. */
  role: WorkspaceRole;
}

/** Autor de una acción: quién aparece en el historial y en cada movimiento. */
export interface Person {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  /**
   * Si hoy sigue perteneciendo al espacio.
   *
   * El historial guarda lo que pasó, y que alguien se vaya no cambia quién
   * hizo qué: se lo sigue mostrando con su nombre, aclarando que ya no está.
   */
  es_miembro?: boolean;
}

/**
 * Arqueo: alguien contó lo que hay de verdad en una billetera y lo registró.
 * NO modifica el saldo inicial — es un hecho con fecha, no una corrección.
 */
export interface Reconciliation {
  id: string;
  wallet_id: string;
  user_id: string;
  counted_at: string;
  counted_amount: number;
  /** Foto de lo que la app calculaba ese día. No se recalcula nunca. */
  expected_amount: number;
  status: 'matched' | 'pending' | 'resolved';
  resolution: 'adjusted' | 'explained' | null;
  adjustment_transaction_id: string | null;
  note: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  user_id: string | null;
  action: 'insert' | 'update' | 'delete';
  entity: string;
  entity_id: string | null;
  summary: string;
  changes: Record<string, { antes: unknown; despues: unknown }> | null;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: WorkspaceRole;
  /** Invitación por email todavía sin aceptar (el invitado aún no se registró). */
  pending?: boolean;
}

export interface CategoryGroup {
  id: string;
  name: string;
  is_system: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  group_id?: string;
  group_name?: string; // Keep for retro-compatibility until fully migrated
  color?: string;
  icon?: string;
  is_default: boolean;
  is_recurring: boolean;
  created_at: string;
}

export interface Debt {
  id: string;
  category_id: string;
  total_amount: number;
  currency_code: string;
  description?: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  /** Quién lo cargó (public.users.id). Se muestra como avatar en la lista. */
  user_id: string | null;
  type: TransactionType;
  amount: number;
  currency_id: string;
  category_id: string | null;
  /** Sólo en aportes y retiros: de qué socio es la plata. */
  partner_id?: string | null;
  account_id: string;
  destination_account_id: string | null; // For transfers
  description: string;
  status: 'draft' | 'warning' | 'reviewed';
  date: string;
  period_month?: string;
  invoiced_at?: string;
  import_batch?: string;
  /** Lote de importación al que pertenece (tabla `import_batches`). */
  import_batch_id?: string | null;
  is_checkpoint?: boolean;
  deleted_at?: string;
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
