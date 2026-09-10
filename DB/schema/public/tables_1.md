# Database Schema (Auto-generated)
> Generated: 2026-09-10T19:29:15.251Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Tables (chunk 1: activity_log — workspaces)

### `activity_log`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| workspace_id | uuid | ✓ |  | FK → workspaces.id |
| user_id | uuid | ✓ |  |  |
| action | text | ✗ |  |  |
| entity | text | ✗ |  |  |
| entity_id | uuid | ✓ |  |  |
| summary | text | ✗ |  |  |
| changes | jsonb | ✓ |  |  |
| created_at | timestamptz | ✗ | now() |  |

### `budget_categories`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| budget_id | uuid | ✗ |  | UNIQUE, FK → budgets.id |
| category_id | uuid | ✗ |  | UNIQUE, FK → categories.id |
| limit_amount | numeric | ✗ | 0 |  |

### `budgets`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| user_id | uuid | ✗ |  | FK → users.id |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| name | text | ✗ |  |  |
| period | text | ✗ | 'monthly'::text |  |
| currency_code | text | ✗ | 'ARS'::text |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |
| deleted_at | timestamptz | ✓ |  |  |

### `categories`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| user_id | uuid | ✗ |  | FK → users.id |
| name | text | ✗ |  |  |
| type | category_type | ✗ |  |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |
| group_name | text | ✗ | 'General'::text |  |
| group_id | uuid | ✗ |  | FK → category_groups.id |
| is_recurring | bool | ✓ | false |  |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| deleted_at | timestamptz | ✓ |  |  |

### `category_groups`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| user_id | uuid | ✓ |  | FK → users.id |
| name | text | ✗ |  |  |
| is_system | bool | ✓ | false |  |
| created_at | timestamptz | ✗ | now() |  |
| workspace_id | uuid | ✓ |  | FK → workspaces.id |
| deleted_at | timestamptz | ✓ |  |  |

### `debts`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| user_id | uuid | ✗ |  | FK → users.id |
| category_id | uuid | ✗ |  | FK → categories.id |
| total_amount | numeric | ✗ |  |  |
| currency_code | text | ✗ | 'ARS'::text |  |
| description | text | ✓ |  |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| deleted_at | timestamptz | ✓ |  |  |

### `import_batches`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| user_id | uuid | ✗ |  | FK → users.id |
| source | text | ✗ | 'planilla'::text |  |
| file_name | text | ✓ |  |  |
| encoding | text | ✓ |  |  |
| delimiter | text | ✓ |  |  |
| rows_read | int4 | ✗ | 0 |  |
| rows_imported | int4 | ✗ | 0 |  |
| rows_skipped | int4 | ✗ | 0 |  |
| created_at | timestamptz | ✗ | now() |  |
| reverted_at | timestamptz | ✓ |  |  |

### `import_rules`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| user_id | uuid | ✗ |  | FK → users.id |
| field | text | ✗ |  |  |
| source | text | ✓ |  |  |
| match_type | text | ✗ | 'exact'::text |  |
| pattern | text | ✗ |  |  |
| type | text | ✓ |  |  |
| category_id | uuid | ✓ |  | FK → categories.id |
| wallet_id | uuid | ✓ |  | FK → wallets.id |
| hits | int4 | ✗ | 0 |  |
| last_used_at | timestamptz | ✓ |  |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |
| deleted_at | timestamptz | ✓ |  |  |

### `partners`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| user_id | uuid | ✓ |  | FK → users.id |
| name | text | ✗ |  |  |
| ownership_pct | numeric | ✗ | 0 |  |
| notes | text | ✓ |  |  |
| joined_at | date | ✗ | CURRENT_DATE |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |
| deleted_at | timestamptz | ✓ |  |  |

### `purges`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| user_id | uuid | ✗ |  | FK → users.id |
| reason | text | ✓ |  |  |
| transactions_count | int4 | ✗ | 0 |  |
| balances | jsonb | ✗ | '[]'::jsonb |  |
| created_at | timestamptz | ✗ | now() |  |
| restored_at | timestamptz | ✓ |  |  |

### `transactions`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| user_id | uuid | ✗ |  | FK → users.id |
| wallet_id | uuid | ✗ |  | FK → wallets.id |
| category_id | uuid | ✓ |  | FK → categories.id |
| type | transaction_type | ✗ |  |  |
| amount | numeric | ✗ |  |  |
| currency_code | text | ✗ | 'ARS'::text |  |
| exchange_rate | numeric | ✓ | 1 |  |
| description | text | ✓ |  |  |
| date | timestamptz | ✗ | now() |  |
| related_transaction_id | uuid | ✓ |  | FK → transactions.id |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |
| invoiced_at | timestamptz | ✓ |  |  |
| import_batch | text | ✓ |  |  |
| deleted_at | timestamptz | ✓ |  |  |
| is_checkpoint | bool | ✗ | false |  |
| status | varchar(20) | ✗ | 'draft'::character varying |  |
| period_month | varchar(7) | ✓ |  |  |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| partner_id | uuid | ✓ |  | FK → partners.id |
| fingerprint | text | ✓ |  |  |
| import_batch_id | uuid | ✓ |  | FK → import_batches.id |
| settles_at | timestamptz | ✓ |  |  |
| purge_id | uuid | ✓ |  | FK → purges.id |
| reference | text | ✓ |  |  |

### `users`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| auth_id | uuid | ✓ |  | UNIQUE |
| email | text | ✗ |  | UNIQUE |
| full_name | text | ✓ |  |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |
| is_admin | bool | ✗ | false |  |
| avatar_url | text | ✓ |  |  |

### `wallet_reconciliations`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| wallet_id | uuid | ✗ |  | FK → wallets.id |
| user_id | uuid | ✗ |  | FK → users.id |
| counted_at | timestamptz | ✗ | now() |  |
| counted_amount | numeric | ✗ |  |  |
| expected_amount | numeric | ✗ |  |  |
| status | text | ✗ | 'pending'::text |  |
| resolution | text | ✓ |  |  |
| adjustment_transaction_id | uuid | ✓ |  | FK → transactions.id |
| note | text | ✓ |  |  |
| deleted_at | timestamptz | ✓ |  |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |

### `wallets`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| user_id | uuid | ✗ |  | FK → users.id |
| name | text | ✗ |  |  |
| type | wallet_type | ✗ | 'cash'::wallet_type |  |
| currency_code | text | ✗ | 'ARS'::text |  |
| bank_name | text | ✓ |  |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |
| initial_balance | numeric | ✗ | 0 |  |
| workspace_id | uuid | ✗ |  | FK → workspaces.id |
| deleted_at | timestamptz | ✓ |  |  |
| parent_id | uuid | ✓ |  | FK → wallets.id |
| is_default | bool | ✗ | false |  |

### `workspace_invitations`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| workspace_id | uuid | ✗ |  | UNIQUE, FK → workspaces.id |
| email | text | ✗ |  | UNIQUE |
| role | text | ✗ | 'member'::text |  |
| invited_by | uuid | ✗ |  | FK → users.id |
| created_at | timestamptz | ✗ | now() |  |
| accepted_at | timestamptz | ✓ |  |  |

### `workspace_members`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| workspace_id | uuid | ✗ |  | UNIQUE, FK → workspaces.id |
| user_id | uuid | ✗ |  | UNIQUE, FK → users.id |
| role | text | ✗ | 'member'::text |  |
| created_at | timestamptz | ✗ | now() |  |

### `workspaces`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| user_id | uuid | ✗ |  | FK → users.id |
| name | text | ✗ |  |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |
| deleted_at | timestamptz | ✓ |  |  |
