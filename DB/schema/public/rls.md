# Database Schema (Auto-generated)
> Generated: 2026-09-10T20:31:49.982Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] RLS Policies (50)

### `activity_log` (1 policies)

#### activity_log_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
(is_workspace_member(workspace_id) AND (can_see_all(workspace_id) OR (user_id = current_user_id())))
```

### `budget_categories` (1 policies)

#### budget_categories_all

- **Command**: ALL | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
(EXISTS ( SELECT 1
   FROM budgets b
  WHERE ((b.id = budget_categories.budget_id) AND can_see_all(b.workspace_id))))
```
- **WITH CHECK**:
```sql
(EXISTS ( SELECT 1
   FROM budgets b
  WHERE ((b.id = budget_categories.budget_id) AND can_see_all(b.workspace_id))))
```

### `budgets` (4 policies)

#### budgets_delete

- **Command**: DELETE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### budgets_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

#### budgets_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### budgets_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

### `categories` (4 policies)

#### categories_delete

- **Command**: DELETE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### categories_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

#### categories_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
is_workspace_member(workspace_id)
```

#### categories_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

### `category_groups` (4 policies)

#### category_groups_delete

- **Command**: DELETE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### category_groups_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

#### category_groups_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
((workspace_id IS NULL) OR is_workspace_member(workspace_id))
```

#### category_groups_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

### `debts` (4 policies)

#### debts_delete

- **Command**: DELETE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### debts_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

#### debts_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### debts_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

### `import_batches` (3 policies)

#### import_batches_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

#### import_batches_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### import_batches_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

### `import_rules` (3 policies)

#### import_rules_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

#### import_rules_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### import_rules_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

### `partners` (3 policies)

#### partners_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

#### partners_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### partners_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

### `purges` (1 policies)

#### purges_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

### `transactions` (4 policies)

#### transactions_delete

- **Command**: DELETE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
(is_workspace_member(workspace_id) AND (can_see_all(workspace_id) OR (user_id = current_user_id())))
```

#### transactions_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
(is_workspace_member(workspace_id) AND (user_id = current_user_id()))
```

#### transactions_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
(is_workspace_member(workspace_id) AND (can_see_all(workspace_id) OR (user_id = current_user_id())))
```

#### transactions_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
(is_workspace_member(workspace_id) AND (can_see_all(workspace_id) OR (user_id = current_user_id())))
```
- **WITH CHECK**:
```sql
(is_workspace_member(workspace_id) AND (can_see_all(workspace_id) OR (user_id = current_user_id())))
```

### `users` (2 policies)

#### USERS SELECT OWN_USER_DATA

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
(auth_id = auth.uid())
```

#### USERS UPDATE OWN_USER_DATA

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
(auth_id = auth.uid())
```

### `wallet_reconciliations` (3 policies)

#### reconciliations_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
(is_workspace_member(workspace_id) AND (user_id = current_user_id()))
```

#### reconciliations_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
is_workspace_member(workspace_id)
```
- **WITH CHECK**:
```sql
is_workspace_member(workspace_id)
```

#### wallet_reconciliations_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

### `wallets` (4 policies)

#### wallets_delete

- **Command**: DELETE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### wallets_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
(can_see_all(workspace_id) AND (user_id = current_user_id()))
```

#### wallets_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```

#### wallets_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
can_see_all(workspace_id)
```
- **WITH CHECK**:
```sql
can_see_all(workspace_id)
```

### `workspace_invitations` (1 policies)

#### invitations_all

- **Command**: ALL | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
is_workspace_owner(workspace_id)
```
- **WITH CHECK**:
```sql
is_workspace_owner(workspace_id)
```

### `workspace_members` (4 policies)

#### members_delete

- **Command**: DELETE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
(is_workspace_owner(workspace_id) OR (user_id = current_user_id()))
```

#### members_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
is_workspace_owner(workspace_id)
```

#### members_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
((user_id = current_user_id()) OR can_see_all(workspace_id))
```

#### members_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
is_workspace_owner(workspace_id)
```
- **WITH CHECK**:
```sql
is_workspace_owner(workspace_id)
```

### `workspaces` (4 policies)

#### workspaces_delete

- **Command**: DELETE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
is_workspace_owner(id)
```

#### workspaces_insert

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **WITH CHECK**:
```sql
(user_id = current_user_id())
```

#### workspaces_select

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
((user_id = current_user_id()) OR is_workspace_member(id))
```

#### workspaces_update

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {authenticated}
- **USING**:
```sql
is_workspace_owner(id)
```
- **WITH CHECK**:
```sql
is_workspace_owner(id)
```
