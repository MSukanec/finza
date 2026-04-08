# Database Schema (Auto-generated)
> Generated: 2026-04-08T15:29:43.752Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Triggers (4)

| Table | Trigger | Timing | Events | Action |
|-------|---------|--------|--------|--------|
| categories | set_updated_at_categories | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| transactions | set_updated_at_transactions | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| users | set_updated_at_users | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| wallets | set_updated_at_wallets | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
