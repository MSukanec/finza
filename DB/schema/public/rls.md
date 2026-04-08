# Database Schema (Auto-generated)
> Generated: 2026-04-08T14:18:22.169Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] RLS Policies (11)

### `categories` (3 policies)

#### USERS INSERT OWN_CATEGORIES

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **WITH CHECK**:
```sql
(user_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid())))
```

#### USERS SELECT OWN_CATEGORIES

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
(user_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid())))
```

#### USERS UPDATE OWN_CATEGORIES

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
(user_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid())))
```

### `transactions` (3 policies)

#### USERS INSERT OWN_TRANSACTIONS

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **WITH CHECK**:
```sql
(user_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid())))
```

#### USERS SELECT OWN_TRANSACTIONS

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
(user_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid())))
```

#### USERS UPDATE OWN_TRANSACTIONS

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
(user_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid())))
```

### `users` (2 policies)

#### USERS SELECT OWN_USER_DATA

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
((auth_id = auth.uid()) OR (id = ( SELECT users_1.id
   FROM users users_1
  WHERE (users_1.auth_id = auth.uid()))))
```

#### USERS UPDATE OWN_USER_DATA

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
((auth_id = auth.uid()) OR (id = ( SELECT users_1.id
   FROM users users_1
  WHERE (users_1.auth_id = auth.uid()))))
```

### `wallets` (3 policies)

#### USERS INSERT OWN_WALLETS

- **Command**: INSERT | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **WITH CHECK**:
```sql
(user_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid())))
```

#### USERS SELECT OWN_WALLETS

- **Command**: SELECT | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
(user_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid())))
```

#### USERS UPDATE OWN_WALLETS

- **Command**: UPDATE | **Permissive**: PERMISSIVE
- **Roles**: {public}
- **USING**:
```sql
(user_id = ( SELECT users.id
   FROM users
  WHERE (users.auth_id = auth.uid())))
```
