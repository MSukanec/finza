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
  /** La plata que hay HOY. No descuenta lo que todavía no se cobró. */
  balance: number;
  /** Lo que ya está comprometido y va a salir: cheques, pagos a plazo. */
  committed?: number;
  /**
   * De qué billetera cuelga, si es una subcuenta.
   *
   * El efectivo de un local vive en varios lugares —la caja del mostrador, la
   * caja fuerte, lo que alguien se lleva—. Cada uno es una cuenta que se
   * arquea sola; el padre sólo agrupa y su saldo es la suma.
   */
  parent_id?: string | null;
  /** La que el formulario propone cuando hay varias hermanas. */
  is_default?: boolean;
  /**
   * Desde acá se puede pagar otro día que el del gasto: cheques, cuenta
   * corriente con un proveedor. Es lo que hace aparecer "Se paga" en un egreso.
   * Ver DB/046.
   */
  allows_deferred_payment?: boolean;
  /** Tiene subcuentas: agrupa y no recibe movimientos. */
  isGroup?: boolean;
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

/**
 * Una cuenta registrada en la app, para el panel de administración.
 *
 * Son datos de CUENTA y nada de plata: quién se registró, cuándo y si entró.
 * El administrador no ve movimientos ni saldos ajenos — eso lo sigue cortando
 * RLS, que no tiene excepción para administradores.
 */
export interface RegisteredUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  /** Último ingreso. NULL si se registró y nunca entró. */
  last_sign_in: string | null;
  /** En cuántos espacios está. No dice cuáles. */
  espacios: number;
  /** Si le queda alguna invitación sin aceptar. */
  invitado: boolean;
}

/**
 * Qué puede hacer alguien dentro de un espacio.
 *
 * `collaborator` es el único que NO ve el espacio entero: sólo los movimientos
 * que cargó él. El límite no lo pone la pantalla sino RLS (ver DB/034), porque
 * la persona tiene un token válido y puede consultar la base por fuera de la app.
 */
export type WorkspaceRole = 'owner' | 'member' | 'collaborator';

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: 'Administrador',
  member: 'Miembro',
  collaborator: 'Colaborador',
};

export const ROLE_HINT: Record<WorkspaceRole, string> = {
  owner: 'Ve y edita todo, invita gente y configura el espacio',
  member: 'Ve y edita todo, pero no invita ni configura',
  collaborator: 'Sólo carga movimientos y ve los suyos. No ve billeteras, socios ni el resto',
};

/** Si el rol ve el espacio entero o sólo lo propio. Espejo de `can_see_all` en la base. */
export const veTodo = (rol: WorkspaceRole | null | undefined) =>
  rol === 'owner' || rol === 'member';

export interface Workspace {
  /** Logo del negocio. NULL usa el ícono por defecto. */
  logo_url?: string | null;
  id: string;
  name: string;
  created_at: string;
  /** Rol del usuario actual en este espacio. */
  role: WorkspaceRole;
}

/**
 * Un vaciado de caja: todos los movimientos del espacio dados de baja de una
 * vez, registrado como UN hecho para poder deshacerlo entero.
 */
export interface Purge {
  id: string;
  user_id: string;
  reason: string | null;
  transactions_count: number;
  created_at: string;
  restored_at: string | null;
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
  /**
   * Cómo se cerró la diferencia.
   *
   * 'superseded' es distinto de los otros dos: no se explicó ni se ajustó nada,
   * simplemente alguien volvió a contar y ese conteo lo reemplazó. En el
   * historial no es lo mismo que "alguien lo revisó".
   */
  resolution: 'adjusted' | 'explained' | 'superseded' | null;
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
  /** Último ingreso a la app. NULL si nunca entró o si no aceptó la invitación. */
  last_sign_in?: string | null;
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
  /** NULL en los grupos de sistema, que comparten todos los espacios y no se borran. */
  workspace_id?: string | null;
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
  /**
   * Número de comprobante: factura, remito, ticket.
   *
   * Vivía metido en la descripción porque en una planilla no había otro lugar.
   * Con campo propio se puede buscar por comprobante, que es como se rastrea un
   * pago cuando el proveedor reclama.
   */
  reference?: string | null;
  account_id: string;
  destination_account_id: string | null; // For transfers
  description: string;
  status: 'draft' | 'warning' | 'reviewed';
  /**
   * Cuándo ocurrió el hecho: la compra, la venta. Manda en RESULTADOS.
   *
   * No es cuándo se pagó. Si comprás en julio con un cheque a septiembre, el
   * costo es de julio porque en julio vendiste esa mercadería.
   */
  date: string;
  /**
   * Cuándo se mueve la plata, si es distinto del hecho. Manda en la CAJA.
   *
   * NULL significa contado: se paga el mismo día. Un cheque a 60 días lleva acá
   * la fecha de cobro, y hasta entonces esa plata sigue en la billetera.
   */
  settles_at?: string | null;
  period_month?: string;
  invoiced_at?: string;
  import_batch?: string;
  /** Lote de importación al que pertenece (tabla `import_batches`). */
  import_batch_id?: string | null;
  is_checkpoint?: boolean;
  deleted_at?: string;
  created_at: string;
}

/**
 * Un comprobante colgado de un movimiento: el ticket, la factura, la captura de
 * la transferencia. Un movimiento puede tener varios.
 *
 * El archivo vive en el bucket PRIVADO `adjuntos`; esto es qué es y de quién.
 * Para abrirlo se pide una URL firmada que vence en un minuto (ver DB/044).
 */
export interface TransactionAttachment {
  id: string;
  transaction_id: string;
  /** `<espacio>/<movimiento>/<id>-<nombre>`. La base exige esa forma. */
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  user_id: string | null;
  created_at: string;
  /**
   * Sólo en el cliente, mientras el archivo viaja. Un adjunto recién elegido se
   * muestra al instante —como cualquier escritura de la app— y queda marcado
   * hasta que la base lo confirma.
   */
  subiendo?: boolean;
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
