# Database Schema (Auto-generated)
> Generated: 2026-04-08T14:18:22.169Z
> Source: Supabase PostgreSQL (read-only introspection)
> ⚠️ This file is auto-generated. Do NOT edit manually.

## [PUBLIC] Indexes (2, excluding PKs)

| Table | Index | Definition |
|-------|-------|------------|
| users | users_auth_id_key | `CREATE UNIQUE INDEX users_auth_id_key ON public.users USING btree (auth_id)` |
| users | users_email_key | `CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)` |
