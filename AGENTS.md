<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Base de datos

Acceso directo a Supabase (rol `postgres`, ignora RLS, permite DDL) vía `DATABASE_URL` de `.env.local`:

```
node scripts/db.mjs -c "select ..."      # consulta
node scripts/db.mjs -f DB/0NN_algo.sql   # correr un archivo
node scripts/db.mjs --tx -f cambio.sql   # con rollback si falla
node scripts/introspect-db.mjs           # regenerar DB/schema/ desde la base real
```

Reglas:

1. **Todo cambio de esquema se escribe además como `DB/NNN_descripcion.sql`**, aunque ya lo hayas ejecutado. El repo es la fuente de verdad; sin esto la base se desincroniza (ya pasó con la columna `status` de `transactions`).
2. Después de un cambio de esquema, correr `node scripts/introspect-db.mjs` para actualizar `DB/schema/`.
3. **Preguntar antes de cualquier cosa destructiva**: `drop`, `truncate`, `alter ... drop column`, o `delete`/`update` sin `where` acotado. Hay datos reales (~1500 transacciones).
4. Usar `--tx` para migraciones de varios statements.
