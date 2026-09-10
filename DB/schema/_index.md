# Database Schema (Auto-generated)
> Generated: 2026-09-10T14:41:35.436Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## Schema: `public`

### Tables (13)

- **`activity_log`** (9 cols | FK: workspace_id → workspaces)
- **`budget_categories`** (4 cols | FK: budget_id → budgets, category_id → categories)
- **`budgets`** (9 cols | FK: user_id → users, workspace_id → workspaces)
- **`categories`** (11 cols | FK: workspace_id → workspaces, user_id → users, group_id → category_groups)
- **`category_groups`** (7 cols | FK: user_id → users, workspace_id → workspaces)
- **`debts`** (10 cols | FK: user_id → users, category_id → categories, workspace_id → workspaces)
- **`transactions`** (20 cols | FK: related_transaction_id → transactions, category_id → categories, user_id → users, workspace_id → workspaces, wallet_id → wallets)
- **`users`** (8 cols)
- **`wallet_reconciliations`** (14 cols | FK: adjustment_transaction_id → transactions, workspace_id → workspaces, wallet_id → wallets, user_id → users)
- **`wallets`** (11 cols | FK: user_id → users, workspace_id → workspaces)
- **`workspace_invitations`** (7 cols | FK: invited_by → users, workspace_id → workspaces)
- **`workspace_members`** (5 cols | FK: workspace_id → workspaces, user_id → users)
- **`workspaces`** (6 cols | FK: user_id → users)

### Functions (15)

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
- `protect_is_admin()` → trigger *(public/functions_1.md)*
- `record_reconciliation(w uuid, counted numeric, at_time timestamp with time zone DEFAULT now(), note_text text DEFAULT NULL::text)` → wallet_reconciliations 🔐 *(public/functions_1.md)*
- `wallet_expected_balance(w uuid, at_time timestamp with time zone DEFAULT now())` → numeric 🔐 *(public/functions_1.md)*

---
