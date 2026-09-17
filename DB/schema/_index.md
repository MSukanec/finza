# Database Schema (Auto-generated)
> Generated: 2026-09-17T21:48:54.883Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## Schema: `public`

### Tables (18)

- **`activity_log`** (9 cols | FK: workspace_id → workspaces)
- **`budget_categories`** (4 cols | FK: budget_id → budgets, category_id → categories)
- **`budgets`** (9 cols | FK: workspace_id → workspaces, user_id → users)
- **`categories`** (11 cols | FK: workspace_id → workspaces, user_id → users, group_id → category_groups)
- **`category_groups`** (7 cols | FK: workspace_id → workspaces, user_id → users)
- **`debts`** (10 cols | FK: workspace_id → workspaces, user_id → users, category_id → categories)
- **`import_batches`** (12 cols | FK: user_id → users, workspace_id → workspaces)
- **`import_rules`** (15 cols | FK: category_id → categories, wallet_id → wallets, user_id → users, workspace_id → workspaces)
- **`partners`** (10 cols | FK: user_id → users, workspace_id → workspaces)
- **`purges`** (8 cols | FK: user_id → users, workspace_id → workspaces)
- **`transaction_attachments`** (10 cols | FK: transaction_id → transactions, workspace_id → workspaces, user_id → users)
- **`transactions`** (26 cols | FK: purge_id → purges, related_transaction_id → transactions, wallet_id → wallets, workspace_id → workspaces, import_batch_id → import_batches, user_id → users, category_id → categories, partner_id → partners)
- **`users`** (8 cols)
- **`wallet_reconciliations`** (14 cols | FK: adjustment_transaction_id → transactions, workspace_id → workspaces, wallet_id → wallets, user_id → users)
- **`wallets`** (14 cols | FK: user_id → users, parent_id → wallets, workspace_id → workspaces)
- **`workspace_invitations`** (7 cols | FK: invited_by → users, workspace_id → workspaces)
- **`workspace_members`** (5 cols | FK: user_id → users, workspace_id → workspaces)
- **`workspaces`** (7 cols | FK: user_id → users)

### Functions (47)

- `activity_authors(ws uuid)` → TABLE(id uuid, full_name text, email text, avatar_url text, es_miembro boolean) 🔐 *(public/functions_1.md)*
- `admin_list_users()` → TABLE(id uuid, email text, full_name text, avatar_url text, is_admin boolean, created_at timestamp with time zone, last_sign_in timestamp with time zone, espacios integer, invitado boolean) 🔐 *(public/functions_1.md)*
- `aprender_regla(ws uuid, p_field text, p_pattern text, p_source text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_category uuid DEFAULT NULL::uuid, p_wallet uuid DEFAULT NULL::uuid, p_match text DEFAULT 'exact'::text)` → uuid 🔐 *(public/functions_1.md)*
- `avatar_de_metadata(meta jsonb)` → text *(public/functions_1.md)*
- `billeteras_para_cargar(ws uuid)` → TABLE(id uuid, name text, type text, currency_code text, parent_id uuid, allows_deferred_payment boolean) 🔐 *(public/functions_1.md)*
- `borrar_billetera(billetera uuid, reemplazo uuid DEFAULT NULL::uuid)` → jsonb 🔐 *(public/functions_1.md)*
- `borrar_categoria(cat uuid, reemplazo uuid DEFAULT NULL::uuid)` → jsonb 🔐 *(public/functions_1.md)*
- `borrar_grupo(grupo uuid, reemplazo uuid DEFAULT NULL::uuid)` → jsonb 🔐 *(public/functions_1.md)*
- `can_see_all(ws uuid)` → boolean 🔐 *(public/functions_1.md)*
- `check_wallet_depth()` → trigger *(public/functions_1.md)*
- `check_wallet_is_leaf()` → trigger *(public/functions_1.md)*
- `clone_workspace(source_ws uuid, new_name text)` → uuid *(public/functions_1.md)*
- `completar_adjunto()` → trigger *(public/functions_1.md)*
- `copiar_nombre_de_grupo()` → trigger *(public/functions_1.md)*
- `current_user_id()` → uuid 🔐 *(public/functions_1.md)*
- `entity_label(tabla text)` → text *(public/functions_1.md)*
- `espacio_del_archivo(ruta text)` → uuid *(public/functions_1.md)*
- `espacio_del_canal(canal text)` → uuid *(public/functions_1.md)*
- `handle_new_user()` → trigger 🔐 *(public/functions_1.md)*
- `handle_new_workspace()` → trigger 🔐 *(public/functions_1.md)*
- `handle_updated_at()` → trigger 🔐 *(public/functions_2.md)*
- `invite_to_workspace(ws uuid, invitee_email text, invitee_role text DEFAULT 'member'::text)` → text 🔐 *(public/functions_2.md)*
- `is_workspace_member(ws uuid)` → boolean 🔐 *(public/functions_2.md)*
- `is_workspace_owner(ws uuid)` → boolean 🔐 *(public/functions_2.md)*
- `list_workspace_members(ws uuid)` → TABLE(id uuid, user_id uuid, email text, full_name text, role text, pending boolean, last_sign_in timestamp with time zone) 🔐 *(public/functions_2.md)*
- `list_workspace_people(ws uuid)` → TABLE(id uuid, full_name text, email text, avatar_url text) 🔐 *(public/functions_2.md)*
- `log_activity()` → trigger 🔐 *(public/functions_2.md)*
- `movimiento_del_archivo(ruta text)` → uuid *(public/functions_2.md)*
- `normalizar_texto(t text)` → text *(public/functions_2.md)*
- `partner_positions(ws uuid)` → TABLE(id uuid, name text, user_id uuid, ownership_pct numeric, aportes numeric, retiros numeric, saldo numeric, retiros_pct numeric, ultimo_mov timestamp with time zone) 🔐 *(public/functions_2.md)*
- `pending_settlements(ws uuid)` → TABLE(id uuid, settles_at timestamp with time zone, date timestamp with time zone, type text, amount numeric, description text, wallet_id uuid, wallet_name text, category_id uuid, dias integer) 🔐 *(public/functions_2.md)*
- `propagar_nombre_de_grupo()` → trigger *(public/functions_2.md)*
- `protect_is_admin()` → trigger *(public/functions_2.md)*
- `reconciliation_summary(rec jsonb, op text)` → text 🔐 *(public/functions_2.md)*
- `record_reconciliation(w uuid, counted numeric, at_time timestamp with time zone DEFAULT now(), note_text text DEFAULT NULL::text)` → wallet_reconciliations 🔐 *(public/functions_2.md)*
- `registrar_uso_reglas(ws uuid, ids uuid[])` → void 🔐 *(public/functions_2.md)*
- `restaurar_purga(purga uuid)` → integer 🔐 *(public/functions_2.md)*
- `set_transaction_fingerprint()` → trigger *(public/functions_2.md)*
- `sync_user_profile()` → trigger 🔐 *(public/functions_2.md)*
- `transaction_fingerprint(p_wallet uuid, p_date timestamp with time zone, p_amount numeric, p_type text, p_description text)` → text *(public/functions_2.md)*
- `transferir_categoria(origen uuid, destino uuid)` → integer 🔐 *(public/functions_3.md)*
- `uso_de_billetera(billetera uuid)` → jsonb 🔐 *(public/functions_3.md)*
- `uso_de_categoria(cat uuid)` → jsonb 🔐 *(public/functions_3.md)*
- `uso_de_grupo(grupo uuid)` → jsonb 🔐 *(public/functions_3.md)*
- `vaciar_espacio(ws uuid, motivo text DEFAULT NULL::text)` → uuid 🔐 *(public/functions_3.md)*
- `wallet_expected_balance(w uuid, at_time timestamp with time zone DEFAULT now())` → numeric 🔐 *(public/functions_3.md)*
- `workspace_role(ws uuid)` → text 🔐 *(public/functions_3.md)*

---
