# Database Schema (Auto-generated)
> Generated: 2026-04-08T14:18:22.169Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## Schema: `public`

### Tables (4)

- **`categories`** (6 cols | FK: user_id → users)
- **`transactions`** (13 cols | FK: user_id → users, wallet_id → wallets, category_id → categories, related_transaction_id → transactions)
- **`users`** (6 cols)
- **`wallets`** (8 cols | FK: user_id → users)

### Functions (2)

- `handle_new_user()` → trigger 🔐 *(public/functions_1.md)*
- `handle_updated_at()` → trigger 🔐 *(public/functions_1.md)*

---
