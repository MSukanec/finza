# Database Schema (Auto-generated)
> Generated: 2026-09-17T15:29:04.694Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Indexes (38, excluding PKs)

| Table | Index | Definition |
|-------|-------|------------|
| activity_log | activity_log_ws_idx | `CREATE INDEX activity_log_ws_idx ON public.activity_log USING btree (workspac...` |
| budget_categories | budget_categories_budget_id_category_id_key | `CREATE UNIQUE INDEX budget_categories_budget_id_category_id_key ON public.bud...` |
| budget_categories | budget_categories_budget_idx | `CREATE INDEX budget_categories_budget_idx ON public.budget_categories USING b...` |
| budgets | budgets_alive_idx | `CREATE INDEX budgets_alive_idx ON public.budgets USING btree (workspace_id) W...` |
| budgets | budgets_workspace_idx | `CREATE INDEX budgets_workspace_idx ON public.budgets USING btree (workspace_id)` |
| categories | categories_alive_idx | `CREATE INDEX categories_alive_idx ON public.categories USING btree (workspace...` |
| categories | idx_categories_workspace | `CREATE INDEX idx_categories_workspace ON public.categories USING btree (works...` |
| category_groups | idx_category_groups_workspace | `CREATE INDEX idx_category_groups_workspace ON public.category_groups USING bt...` |
| debts | idx_debts_workspace | `CREATE INDEX idx_debts_workspace ON public.debts USING btree (workspace_id)` |
| import_batches | import_batches_espacio_idx | `CREATE INDEX import_batches_espacio_idx ON public.import_batches USING btree ...` |
| import_rules | import_rules_espacio_idx | `CREATE INDEX import_rules_espacio_idx ON public.import_rules USING btree (wor...` |
| import_rules | import_rules_patron_uniq | `CREATE UNIQUE INDEX import_rules_patron_uniq ON public.import_rules USING btr...` |
| partners | partners_espacio_idx | `CREATE INDEX partners_espacio_idx ON public.partners USING btree (workspace_id)` |
| partners | partners_espacio_nombre_uniq | `CREATE UNIQUE INDEX partners_espacio_nombre_uniq ON public.partners USING btr...` |
| partners | partners_espacio_usuario_uniq | `CREATE UNIQUE INDEX partners_espacio_usuario_uniq ON public.partners USING bt...` |
| purges | purges_espacio_idx | `CREATE INDEX purges_espacio_idx ON public.purges USING btree (workspace_id, c...` |
| transaction_attachments | transaction_attachments_storage_path_key | `CREATE UNIQUE INDEX transaction_attachments_storage_path_key ON public.transa...` |
| transaction_attachments | transaction_attachments_tx_idx | `CREATE INDEX transaction_attachments_tx_idx ON public.transaction_attachments...` |
| transaction_attachments | transaction_attachments_ws_idx | `CREATE INDEX transaction_attachments_ws_idx ON public.transaction_attachments...` |
| transactions | idx_transactions_workspace | `CREATE INDEX idx_transactions_workspace ON public.transactions USING btree (w...` |
| transactions | transactions_huella_idx | `CREATE INDEX transactions_huella_idx ON public.transactions USING btree (work...` |
| transactions | transactions_lote_idx | `CREATE INDEX transactions_lote_idx ON public.transactions USING btree (import...` |
| transactions | transactions_partner_idx | `CREATE INDEX transactions_partner_idx ON public.transactions USING btree (par...` |
| transactions | transactions_purga_idx | `CREATE INDEX transactions_purga_idx ON public.transactions USING btree (purge...` |
| transactions | transactions_reference_idx | `CREATE INDEX transactions_reference_idx ON public.transactions USING btree (w...` |
| transactions | transactions_settles_idx | `CREATE INDEX transactions_settles_idx ON public.transactions USING btree (wor...` |
| users | users_auth_id_key | `CREATE UNIQUE INDEX users_auth_id_key ON public.users USING btree (auth_id)` |
| users | users_email_key | `CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)` |
| wallet_reconciliations | reconciliations_pending_idx | `CREATE INDEX reconciliations_pending_idx ON public.wallet_reconciliations USI...` |
| wallet_reconciliations | reconciliations_wallet_idx | `CREATE INDEX reconciliations_wallet_idx ON public.wallet_reconciliations USIN...` |
| wallets | idx_wallets_workspace | `CREATE INDEX idx_wallets_workspace ON public.wallets USING btree (workspace_id)` |
| wallets | wallets_alive_idx | `CREATE INDEX wallets_alive_idx ON public.wallets USING btree (workspace_id) W...` |
| wallets | wallets_parent_idx | `CREATE INDEX wallets_parent_idx ON public.wallets USING btree (parent_id) WHE...` |
| workspace_invitations | workspace_invitations_email_idx | `CREATE INDEX workspace_invitations_email_idx ON public.workspace_invitations ...` |
| workspace_invitations | workspace_invitations_workspace_id_email_key | `CREATE UNIQUE INDEX workspace_invitations_workspace_id_email_key ON public.wo...` |
| workspace_members | workspace_members_user_idx | `CREATE INDEX workspace_members_user_idx ON public.workspace_members USING btr...` |
| workspace_members | workspace_members_workspace_id_user_id_key | `CREATE UNIQUE INDEX workspace_members_workspace_id_user_id_key ON public.work...` |
| workspace_members | workspace_members_ws_idx | `CREATE INDEX workspace_members_ws_idx ON public.workspace_members USING btree...` |
