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
5. **Nunca identificar un espacio por su nombre en un script.** El trigger de
   alta le crea un espacio "Principal" a cada persona que se registra: al
   2026-09-10 hay cuatro, de cuatro dueños distintos. Un `where name = 'Principal'`
   escribe en la base de otro. Usar el uuid.

# Importación

Todo lo que lee una planilla vive en **`src/lib/import/`** y lo usan los dos
puntos de entrada: la vista `/importar` y `scripts/import-movimientos.mjs`. Antes
estaba escrito dos veces y las versiones se separaron — la del script sabía
detectar codificación y la de la app no, así que la app no podía leer el Excel
real. **No agregar parseo de planillas fuera de ese módulo.**

- `text.ts` — codificación (el Excel sale en Mac Roman), delimitador, CSV con CR suelto.
- `values.ts` — montos argentinos, fechas día-primero, normalización.
- `columns.ts` — encabezados reales (`FECHA PERC.`, `FECHA DEV.`) a campos.
- `match.ts` — cercanía medida de verdad, con nivel de confianza. Lo dudoso se
  sugiere, no se aplica solo.
- `index.ts` — `leerPlanilla` → `interpretar` → `emparejarTransferencias`, más
  `huella()` para deduplicar.

Reglas:

1. **`CATEGORIA` es el grupo y `SUBCATEGORIA` la categoría.** Sin subcategoría,
   la categoría se llama `General` dentro de ese grupo (`Delivery + Takeaway ›
   General`). Así está cargado en la base.
2. **La pata entrante de una transferencia va con monto negativo.** Tanto
   `wallet_expected_balance` como `hydrate()` restan el monto de toda
   transferencia, así que el negativo es lo que hace subir el saldo del destino.
   No "corregirlo" a positivo.
3. **El enlace entre las dos patas va en un solo sentido** (la entrante apunta a
   la saliente): la FK `related_transaction_id` no es diferible y las filas se
   insertan en bloques.
4. Después de tocar el módulo, correr `npm run check:import`. Cada caso de ese
   archivo corresponde a un dato malo que llegó a la base, no a una hipótesis.

## Huella y deduplicación

Cada movimiento tiene una `fingerprint` (día + monto + billetera + tipo +
detalle normalizado) que dice qué es en el mundo real, con independencia del
archivo del que vino. **La llena un trigger**, no la aplicación: `status` e
`import_batch` ya demostraron que lo que depende de que alguien se acuerde de
completarlo termina vacío.

La definición está DOS VECES —`transaction_fingerprint` en
`DB/029_huellas_y_lotes.sql` y `huella()` en `src/lib/import`— porque el
importador compara antes de escribir. Si se separan, el importador deja de
reconocer lo ya cargado y vuelve a duplicar todo, en silencio. **Después de
tocar cualquiera de las dos, correr `npm run check:huellas`**, que las compara
contra las filas reales de la base.

El índice no es único: hay 10 grupos de movimientos repetidos cargados de antes,
y resolverlos es una decisión sobre datos reales, no algo que haga una migración.

**La deduplicación compara CANTIDADES, no presencia.** En el resumen de Visa,
OSDE aparece facturado dos veces el mismo día, por el mismo importe y con la
misma referencia: dos filas idénticas hasta el byte, más su devolución. Son dos
gastos reales. Con un `Set` y un "¿ya existe?" la segunda se descartaba en
silencio y faltaban 443.055 pesos. Con un `Map` de conteos, si el archivo trae
dos y la base tiene una, entra una. No volver a un `Set`.

## Roles y qué ve cada uno

Tres roles, en `workspace_members.role`: `owner` (Administrador), `member`
(Miembro) y `collaborator` (Colaborador). Los dos primeros ven el espacio
entero; el tercero **sólo los movimientos que cargó él**.

**El límite vive en la base, no en la pantalla.** La persona tiene un token
válido y puede consultar Supabase por fuera de la app: esconder un menú no
protege nada. Todo está en DB/034 (políticas) y DB/035 (guardias de funciones).

Dos cosas fáciles de olvidar al agregar algo nuevo:

1. **Cada tabla nueva necesita decidir si el colaborador la ve**, y la respuesta
   por defecto es que no. `is_workspace_member` significa "está en el espacio",
   NO "puede ver todo": para eso está `can_see_all(ws)`.
2. **Cada función `SECURITY DEFINER` se saltea RLS.** Es la puerta de atrás y
   es la que se olvida. Si toma un `ws` y devuelve datos del espacio, la
   guardia va con `can_see_all`, no con `is_workspace_member`.

`wallets` es la excepción explicada: el colaborador NO lee esa tabla porque la
fila lleva `initial_balance` y RLS no esconde columnas. Para elegir billetera
usa `billeteras_para_cargar(ws)`, que devuelve nombre y moneda y ningún saldo.

**Después de tocar permisos, correr `npm run check:permisos`**: arma un
colaborador de mentira, ataca cada tabla y cada función desde su sesión, y hace
rollback. Cuarenta comprobaciones, ninguna hipotética.

## Adjuntos

Los comprobantes de un movimiento (DB/044): la tabla `transaction_attachments`
dice qué es y de quién; el archivo vive en el bucket **privado** `adjuntos`, en
`<espacio>/<movimiento>/<id>-<nombre>`. Se abren con URL firmada de un minuto.

**No tienen una regla de permisos propia, y no hay que dársela.** Cada política
—de la tabla y del bucket— pregunta si el movimiento existe, y esa subconsulta
pasa por la RLS de `transactions` de quien consulta. Quien ve el movimiento ve
sus adjuntos; si cambia quién ve movimientos, los adjuntos siguen solos. Escribir
acá un `can_see_all` es abrir la puerta a que las dos reglas se separen.

1. `workspace_id` y `user_id` los pone un trigger. No se le cree al cliente.
2. De una fila sólo se puede cambiar `deleted_at` (GRANT por columna): quitar un
   adjunto es lógico y el archivo queda. El bucket no tiene política de UPDATE
   ni de DELETE a propósito.
3. Los límites de tamaño y tipo están en el bucket **y** en `src/lib/adjuntos.ts`,
   que los repite sólo para avisar antes. `check:ui` compara los dos.
4. Un movimiento recién creado todavía no está en la base cuando se eligen sus
   archivos: `attachFiles` espera su escritura (`escriturasPendientes`). Sin eso,
   adjuntar al cargar un gasto falla siempre.

**Después de tocar permisos de movimientos o adjuntos, correr
`npm run check:adjuntos`**: ataca la tabla y el bucket como colaborador, como
alguien de otro espacio y como administrador, y hace rollback.

## Vaciar la caja

Vaciar un espacio para empezar de cero es una operación de la app, no de un
script: `vaciar_espacio(ws, motivo)` y `restaurar_purga(id)` (DB/033). Cada
vaciado es UNA fila en `purges` —quién, cuándo, por qué, cuántos movimientos y
qué saldos iniciales había— y los movimientos quedan dados de baja apuntando a
ella, así deshacerlo es una sola operación. Se ve y se deshace desde Actividad.

**El borrado es lógico. Nunca hacer esto con DELETE**: son años de datos reales
y no hay ninguna razón para que sea irreversible.

Los triggers de historial de `transactions` y `wallets` llevan una cláusula
`WHEN` que los silencia cuando `app.silenciar_historial` está en `'on'`. Es lo
que evita que un vaciado de 1500 movimientos deje 1500 entradas y vuelva el
historial inservible justo el día que más se lo necesita. El flag es local a la
transacción. Si se recrean esos triggers, **hay que volver a poner el WHEN**.

## Adaptadores

`src/lib/import/pdf.ts` extrae texto con posiciones de un PDF, sin dependencias
—usa el `DecompressionStream` del runtime— y `visa.ts` convierte el resumen de
Visa en los mismos `Movimiento` que produce una planilla, así las reglas, la
huella y la pantalla de revisión funcionan sin enterarse.

`pdf.ts` NO es un lector de PDF de propósito general y no debe convertirse en
uno: falla fuerte antes que devolver texto a medias. Los resúmenes traen el
`/ToUnicode` vacío, así que los extractores genéricos devuelven basura; lo que
sirve es el `/Differences` de cada fuente, con nombres de glifo sobre posiciones
EBCDIC. El archivo trae varios mapas y **dos de ellos se contradicen**: sólo se
usan los que describen texto, y si dos chocan se corta.

Modelo de la tarjeta, decidido con el usuario el 2026-09-10: **la tarjeta es una
billetera** (su saldo es la deuda), **una por moneda**, **de una compra en cuotas
entra sólo la cuota del mes**, y **el pago del resumen no se importa** porque es
una transferencia y de qué cuenta salió no figura en el PDF — se avisa en pantalla.

La prueba que vale para el adaptador está en `check:import`: la aritmética del
resumen tiene que cerrar (saldo anterior + movimientos − pago = total impreso).
Si un cambio rompe el parseo, ese número deja de dar.

## Reglas de mapeo

`import_rules` (DB/030) guarda lo que una persona afirmó una vez: que tal texto
significa tal categoría o tal billetera. Se escriben solas al importar y ganan
sobre el emparejamiento por parecido — una afirmación pesa más que una
heurística. `src/lib/import/rules.ts` decide cuál gana cuando hay varias.

Los `field` son `categoria` (el par grupo|categoría de una planilla), `detalle`
(la descripción libre, que es lo único que traen los resúmenes de tarjeta) y
`billetera`. La vista usa hoy `categoria` y `billetera`; `detalle` está
implementado en el motor y probado, esperando a los adaptadores de resumen.
