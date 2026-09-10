# Database Schema (Auto-generated)
> Generated: 2026-09-10T21:49:16.009Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Triggers (25)

| Table | Trigger | Timing | Events | Action |
|-------|---------|--------|--------|--------|
| budgets | log_activity_budgets | AFTER | INSERT, DELETE, UPDATE | EXECUTE FUNCTION log_activity() |
| budgets | set_updated_at_budgets | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| categories | log_activity_categories | AFTER | INSERT, UPDATE, DELETE | EXECUTE FUNCTION log_activity() |
| categories | set_updated_at_categories | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| category_groups | log_activity_category_groups | AFTER | UPDATE, INSERT, DELETE | EXECUTE FUNCTION log_activity() |
| debts | log_activity_debts | AFTER | UPDATE, DELETE, INSERT | EXECUTE FUNCTION log_activity() |
| debts | set_updated_at_debts | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| import_rules | import_rules_updated_at | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| partners | partners_activity | AFTER | UPDATE, INSERT, DELETE | EXECUTE FUNCTION log_activity() |
| partners | partners_updated_at | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| transactions | log_activity_transactions | AFTER | INSERT, DELETE, UPDATE | EXECUTE FUNCTION log_activity() |
| transactions | set_updated_at_transactions | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| transactions | transactions_fingerprint | BEFORE | UPDATE, INSERT | EXECUTE FUNCTION set_transaction_fingerprint() |
| transactions | transactions_wallet_leaf | BEFORE | INSERT, UPDATE | EXECUTE FUNCTION check_wallet_is_leaf() |
| users | guard_is_admin | BEFORE | UPDATE | EXECUTE FUNCTION protect_is_admin() |
| users | set_updated_at_users | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| wallet_reconciliations | log_activity_wallet_reconciliations | AFTER | UPDATE, DELETE, INSERT | EXECUTE FUNCTION log_activity() |
| wallet_reconciliations | set_updated_at_reconciliations | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| wallets | log_activity_wallets | AFTER | UPDATE, INSERT, DELETE | EXECUTE FUNCTION log_activity() |
| wallets | set_updated_at_wallets | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
| wallets | wallets_depth | BEFORE | UPDATE, INSERT | EXECUTE FUNCTION check_wallet_depth() |
| workspace_members | log_activity_workspace_members | AFTER | DELETE, UPDATE, INSERT | EXECUTE FUNCTION log_activity() |
| workspaces | log_activity_workspaces | AFTER | INSERT, UPDATE, DELETE | EXECUTE FUNCTION log_activity() |
| workspaces | on_workspace_created | AFTER | INSERT | EXECUTE FUNCTION handle_new_workspace() |
| workspaces | set_updated_at_workspaces | BEFORE | UPDATE | EXECUTE FUNCTION handle_updated_at() |
