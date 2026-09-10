# Database Schema (Auto-generated)
> Generated: 2026-09-10T19:02:05.896Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## Schema: `public`

### Tables (16)

- **`activity_log`** (9 cols | FK: workspace_id → workspaces)
- **`budget_categories`** (4 cols | FK: category_id → categories, budget_id → budgets)
- **`budgets`** (9 cols | FK: user_id → users, workspace_id → workspaces)
- **`categories`** (11 cols | FK: group_id → category_groups, user_id → users, workspace_id → workspaces)
- **`category_groups`** (7 cols | FK: user_id → users, workspace_id → workspaces)
- **`debts`** (10 cols | FK: user_id → users, workspace_id → workspaces, category_id → categories)
- **`import_batches`** (12 cols | FK: user_id → users, workspace_id → workspaces)
- **`import_rules`** (15 cols | FK: category_id → categories, wallet_id → wallets, user_id → users, workspace_id → workspaces)
- **`partners`** (10 cols | FK: user_id → users, workspace_id → workspaces)
- **`transactions`** (24 cols | FK: wallet_id → wallets, related_transaction_id → transactions, category_id → categories, user_id → users, import_batch_id → import_batches, workspace_id → workspaces, partner_id → partners)
- **`users`** (8 cols)
- **`wallet_reconciliations`** (14 cols | FK: adjustment_transaction_id → transactions, wallet_id → wallets, workspace_id → workspaces, user_id → users)
- **`wallets`** (11 cols | FK: user_id → users, workspace_id → workspaces)
- **`workspace_invitations`** (7 cols | FK: invited_by → users, workspace_id → workspaces)
- **`workspace_members`** (5 cols | FK: user_id → users, workspace_id → workspaces)
- **`workspaces`** (6 cols | FK: user_id → users)

### Functions (27)

- `activity_authors(ws uuid)` → TABLE(id uuid, full_name text, email text, avatar_url text, es_miembro boolean) 🔐 *(public/functions_1.md)*
- `admin_list_users()` → TABLE(id uuid, email text, full_name text, avatar_url text, is_admin boolean, created_at timestamp with time zone, last_sign_in timestamp with time zone, espacios integer, invitado boolean) 🔐 *(public/functions_1.md)*
- `aprender_regla(ws uuid, p_field text, p_pattern text, p_source text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_category uuid DEFAULT NULL::uuid, p_wallet uuid DEFAULT NULL::uuid, p_match text DEFAULT 'exact'::text)` → uuid 🔐 *(public/functions_1.md)*
- `avatar_de_metadata(meta jsonb)` → text *(public/functions_1.md)*
- `clone_workspace(source_ws uuid, new_name text)` → uuid *(public/functions_1.md)*
- `current_user_id()` → uuid 🔐 *(public/functions_1.md)*
- `entity_label(tabla text)` → text *(public/functions_1.md)*
- `handle_new_user()` → trigger 🔐 *(public/functions_1.md)*
- `handle_new_workspace()` → trigger 🔐 *(public/functions_1.md)*
- `handle_updated_at()` → trigger 🔐 *(public/functions_1.md)*
- `invite_to_workspace(ws uuid, invitee_email text, invitee_role text DEFAULT 'member'::text)` → text 🔐 *(public/functions_1.md)*
- `is_workspace_member(ws uuid)` → boolean 🔐 *(public/functions_1.md)*
- `is_workspace_owner(ws uuid)` → boolean 🔐 *(public/functions_1.md)*
- `list_workspace_members(ws uuid)` → TABLE(id uuid, user_id uuid, email text, full_name text, role text, pending boolean) 🔐 *(public/functions_1.md)*
- `list_workspace_people(ws uuid)` → TABLE(id uuid, full_name text, email text, avatar_url text) 🔐 *(public/functions_1.md)*
- `log_activity()` → trigger 🔐 *(public/functions_1.md)*
- `normalizar_texto(t text)` → text *(public/functions_1.md)*
- `partner_positions(ws uuid)` → TABLE(id uuid, name text, user_id uuid, ownership_pct numeric, aportes numeric, retiros numeric, saldo numeric, retiros_pct numeric, ultimo_mov timestamp with time zone) 🔐 *(public/functions_1.md)*
- `pending_settlements(ws uuid)` → TABLE(id uuid, settles_at timestamp with time zone, date timestamp with time zone, type text, amount numeric, description text, wallet_id uuid, wallet_name text, category_id uuid, dias integer) 🔐 *(public/functions_1.md)*
- `protect_is_admin()` → trigger *(public/functions_1.md)*
- `reconciliation_summary(rec jsonb, op text)` → text 🔐 *(public/functions_2.md)*
- `record_reconciliation(w uuid, counted numeric, at_time timestamp with time zone DEFAULT now(), note_text text DEFAULT NULL::text)` → wallet_reconciliations 🔐 *(public/functions_2.md)*
- `registrar_uso_reglas(ws uuid, ids uuid[])` → void 🔐 *(public/functions_2.md)*
- `set_transaction_fingerprint()` → trigger *(public/functions_2.md)*
- `sync_user_profile()` → trigger 🔐 *(public/functions_2.md)*
- `transaction_fingerprint(p_wallet uuid, p_date timestamp with time zone, p_amount numeric, p_type text, p_description text)` → text *(public/functions_2.md)*
- `wallet_expected_balance(w uuid, at_time timestamp with time zone DEFAULT now())` → numeric 🔐 *(public/functions_2.md)*

---
