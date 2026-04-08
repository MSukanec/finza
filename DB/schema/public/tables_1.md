# Database Schema (Auto-generated)
> Generated: 2026-04-08T14:18:22.169Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Tables (chunk 1: categories — wallets)

### `categories`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| user_id | uuid | ✗ |  | FK → users.id |
| name | text | ✗ |  |  |
| type | category_type | ✗ |  |  |
| created_at | timestamptz | ✗ | now() |  |
| updated_at | timestamptz | ✗ | now() |  |

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

### `users`

| Column | Type | Nullable | Default | Constraints |
|--------|------|----------|---------|-------------|
| id | uuid | ✗ | gen_random_uuid() | PK |
| auth_id | uuid | ✓ |  | UNIQUE |
| email | text | ✗ |  | UNIQUE |
| full_name | text | ✓ |  |  |
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
