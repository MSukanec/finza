/**
 * Database Schema Introspection Script
 * =====================================
 * Connects to Supabase PostgreSQL (READ-ONLY queries) and generates
 * split schema files in DB/schema/ with all tables, columns, functions,
 * triggers, RLS policies, and views.
 *
 * Usage: node scripts/introspect-db.mjs
 * Or:    npm run db:schema
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env.local');
    process.exit(1);
}

const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function main() {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected! Introspecting schema...\n');

    // Schemas to introspect
    const SCHEMAS = ['public', 'iam', 'construction', 'projects', 'contacts', 'finance', 'ai', 'catalog', 'academy', 'billing', 'ops', 'notifications', 'audit', 'planner', 'community', 'design', 'providers'];

    const schemasSQL = SCHEMAS.map(s => `'${s}'`).join(', ');

    const sections = [];

    // Header
    sections.push(`# Database Schema (Auto-generated)`);
    sections.push(`> Generated: ${new Date().toISOString()}`);
    sections.push(`> Source: Supabase PostgreSQL (read-only introspection)`);
    sections.push(`> ⚠️ This file is auto-generated. Do NOT edit manually.\n`);

    // ── 1. TABLES + COLUMNS ──
    console.log('📋 Fetching tables and columns...');
    const tablesRes = await client.query(`
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema IN (${schemasSQL})
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name;
    `);

    const columnsRes = await client.query(`
        SELECT
            c.table_schema,
            c.table_name,
            c.column_name,
            c.data_type,
            c.udt_name,
            c.column_default,
            c.is_nullable,
            c.character_maximum_length,
            c.numeric_precision
        FROM information_schema.columns c
        WHERE c.table_schema IN (${schemasSQL})
        ORDER BY c.table_schema, c.table_name, c.ordinal_position;
    `);

    // Group columns by table
    const columnsByTable = {};
    for (const col of columnsRes.rows) {
        const key = col.table_schema === 'public' ? col.table_name : `${col.table_schema}.${col.table_name}`;
        if (!columnsByTable[key]) columnsByTable[key] = [];
        columnsByTable[key].push(col);
    }

    // ── 1b. PRIMARY KEYS ──
    const pkRes = await client.query(`
        SELECT
            tc.table_schema,
            tc.table_name,
            kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema IN (${schemasSQL})
        ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position;
    `);

    const pkByTable = {};
    for (const pk of pkRes.rows) {
        const key = pk.table_schema === 'public' ? pk.table_name : `${pk.table_schema}.${pk.table_name}`;
        if (!pkByTable[key]) pkByTable[key] = new Set();
        pkByTable[key].add(pk.column_name);
    }

    // ── 1c. FOREIGN KEYS ──
    console.log('🔗 Fetching foreign keys...');
    const fkRes = await client.query(`
        SELECT
            tc.table_schema,
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema IN (${schemasSQL})
        ORDER BY tc.table_schema, tc.table_name;
    `);

    const fkByTable = {};
    for (const fk of fkRes.rows) {
        const key = fk.table_schema === 'public' ? fk.table_name : `${fk.table_schema}.${fk.table_name}`;
        if (!fkByTable[key]) fkByTable[key] = [];
        fkByTable[key].push(fk);
    }

    // ── 1d. UNIQUE CONSTRAINTS ──
    const uniqueRes = await client.query(`
        SELECT
            tc.table_schema,
            tc.table_name,
            kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema IN (${schemasSQL})
        ORDER BY tc.table_schema, tc.table_name;
    `);

    const uniqueByTable = {};
    for (const u of uniqueRes.rows) {
        const key = u.table_schema === 'public' ? u.table_name : `${u.table_schema}.${u.table_name}`;
        if (!uniqueByTable[key]) uniqueByTable[key] = new Set();
        uniqueByTable[key].add(u.column_name);
    }

    // Build table display names with schema prefix for non-public
    const tableDisplayNames = tablesRes.rows.map(t =>
        t.table_schema === 'public' ? t.table_name : `${t.table_schema}.${t.table_name}`
    );

    // Build tables section
    sections.push(`## Tables (${tableDisplayNames.length})\n`);

    for (const name of tableDisplayNames) {
        const cols = columnsByTable[name] || [];
        const pks = pkByTable[name] || new Set();
        const fks = fkByTable[name] || [];
        const uniques = uniqueByTable[name] || new Set();

        sections.push(`### \`${name}\`\n`);
        sections.push(`| Column | Type | Nullable | Default | Constraints |`);
        sections.push(`|--------|------|----------|---------|-------------|`);

        for (const col of cols) {
            const type = col.character_maximum_length
                ? `${col.udt_name}(${col.character_maximum_length})`
                : col.udt_name;
            const nullable = col.is_nullable === 'YES' ? '✓' : '✗';
            const def = col.column_default
                ? col.column_default.length > 40
                    ? col.column_default.substring(0, 37) + '...'
                    : col.column_default
                : '';

            const constraints = [];
            if (pks.has(col.column_name)) constraints.push('PK');
            if (uniques.has(col.column_name)) constraints.push('UNIQUE');
            const fk = fks.find(f => f.column_name === col.column_name);
            if (fk) constraints.push(`FK → ${fk.foreign_table}.${fk.foreign_column}`);

            sections.push(`| ${col.column_name} | ${type} | ${nullable} | ${def} | ${constraints.join(', ')} |`);
        }
        sections.push('');
    }

    // ── 2. VIEWS ──
    console.log('👁️ Fetching views...');
    const viewsRes = await client.query(`
        SELECT
            v.table_schema,
            v.table_name,
            v.view_definition,
            CASE
                WHEN 'security_invoker=true' = ANY(c.reloptions) THEN true
                ELSE false
            END AS is_security_invoker
        FROM information_schema.views v
        JOIN pg_class c ON c.relname = v.table_name
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.table_schema
        WHERE v.table_schema IN (${schemasSQL})
        ORDER BY v.table_schema, v.table_name;
    `);

    if (viewsRes.rows.length > 0) {
        sections.push(`---\n## Views (${viewsRes.rows.length})\n`);
        for (const view of viewsRes.rows) {
            const displayName = view.table_schema === 'public' ? view.table_name : `${view.table_schema}.${view.table_name}`;
            const secBadge = view.is_security_invoker ? '🔓 INVOKER' : '🔐 DEFINER';
            sections.push(`### \`${displayName}\` (${secBadge})\n`);
            sections.push('```sql');
            sections.push(view.view_definition?.trim() || '-- (definition not available)');
            sections.push('```\n');
        }
    }

    // ── 3. FUNCTIONS ──
    console.log('⚙️ Fetching functions...');
    const funcsRes = await client.query(`
        SELECT
            n.nspname AS schema_name,
            p.proname AS name,
            pg_get_function_arguments(p.oid) AS args,
            pg_get_function_result(p.oid) AS return_type,
            CASE p.prokind
                WHEN 'f' THEN 'function'
                WHEN 'p' THEN 'procedure'
            END AS kind,
            CASE p.provolatile
                WHEN 'i' THEN 'IMMUTABLE'
                WHEN 's' THEN 'STABLE'
                WHEN 'v' THEN 'VOLATILE'
            END AS volatility,
            CASE p.prosecdef
                WHEN true THEN 'SECURITY DEFINER'
                ELSE 'SECURITY INVOKER'
            END AS security,
            pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname IN (${schemasSQL})
          AND p.prokind IN ('f', 'p')
        ORDER BY n.nspname, p.proname;
    `);

    if (funcsRes.rows.length > 0) {
        sections.push(`---\n## Functions & Procedures (${funcsRes.rows.length})\n`);
        for (const fn of funcsRes.rows) {
            const fnDisplayName = fn.schema_name === 'public' ? fn.name : `${fn.schema_name}.${fn.name}`;
            const badge = fn.security === 'SECURITY DEFINER' ? ' 🔐' : '';
            sections.push(`### \`${fnDisplayName}(${fn.args})\`${badge}\n`);
            sections.push(`- **Returns**: ${fn.return_type}`);
            sections.push(`- **Kind**: ${fn.kind} | ${fn.volatility} | ${fn.security}\n`);
            sections.push('<details><summary>Source</summary>\n');
            sections.push('```sql');
            sections.push(fn.definition?.trim() || '-- (source not available)');
            sections.push('```\n</details>\n');
        }
    }

    // ── 4. TRIGGERS ──
    console.log('⚡ Fetching triggers...');
    const triggersRes = await client.query(`
        SELECT
            trigger_schema,
            trigger_name,
            event_object_table AS table_name,
            event_manipulation AS event,
            action_timing AS timing,
            action_statement
        FROM information_schema.triggers
        WHERE trigger_schema IN (${schemasSQL})
        ORDER BY trigger_schema, event_object_table, trigger_name;
    `);

    if (triggersRes.rows.length > 0) {
        // Deduplicate (triggers appear once per event type)
        const seen = new Set();
        const uniqueTriggers = triggersRes.rows.filter(t => {
            const key = `${t.table_name}.${t.trigger_name}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Group events for same trigger
        const triggerEvents = {};
        for (const t of triggersRes.rows) {
            const key = `${t.table_name}.${t.trigger_name}`;
            if (!triggerEvents[key]) triggerEvents[key] = { ...t, events: [] };
            triggerEvents[key].events.push(t.event);
        }

        sections.push(`---\n## Triggers (${Object.keys(triggerEvents).length})\n`);
        sections.push(`| Table | Trigger | Timing | Events | Action |`);
        sections.push(`|-------|---------|--------|--------|--------|`);

        for (const t of Object.values(triggerEvents)) {
            const action = t.action_statement.length > 60
                ? t.action_statement.substring(0, 57) + '...'
                : t.action_statement;
            sections.push(`| ${t.table_name} | ${t.trigger_name} | ${t.timing} | ${t.events.join(', ')} | ${action} |`);
        }
        sections.push('');
    }

    // ── 5. RLS POLICIES ──
    console.log('🛡️ Fetching RLS policies...');
    const rlsRes = await client.query(`
        SELECT
            schemaname,
            tablename,
            policyname,
            permissive,
            roles,
            cmd,
            qual,
            with_check
        FROM pg_policies
        WHERE schemaname IN (${schemasSQL})
        ORDER BY schemaname, tablename, policyname;
    `);

    if (rlsRes.rows.length > 0) {
        // Group by table
        const rlsByTable = {};
        for (const p of rlsRes.rows) {
            const key = p.schemaname === 'public' ? p.tablename : `${p.schemaname}.${p.tablename}`;
            if (!rlsByTable[key]) rlsByTable[key] = [];
            rlsByTable[key].push(p);
        }

        sections.push(`---\n## RLS Policies (${rlsRes.rows.length})\n`);

        for (const [table, policies] of Object.entries(rlsByTable)) {
            sections.push(`### \`${table}\` (${policies.length} policies)\n`);
            for (const p of policies) {
                sections.push(`#### ${p.policyname}\n`);
                sections.push(`- **Command**: ${p.cmd} | **Permissive**: ${p.permissive}`);
                sections.push(`- **Roles**: ${p.roles}`);
                if (p.qual) {
                    sections.push(`- **USING**:`);
                    sections.push('```sql');
                    sections.push(p.qual);
                    sections.push('```');
                }
                if (p.with_check) {
                    sections.push(`- **WITH CHECK**:`);
                    sections.push('```sql');
                    sections.push(p.with_check);
                    sections.push('```');
                }
                sections.push('');
            }
        }
    }

    // ── 6. ENUMS ──
    console.log('📦 Fetching enums...');
    const enumsRes = await client.query(`
        SELECT
            n.nspname AS schema_name,
            t.typname AS enum_name,
            string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname IN (${schemasSQL})
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname;
    `);

    if (enumsRes.rows.length > 0) {
        sections.push(`---\n## Enums (${enumsRes.rows.length})\n`);
        sections.push(`| Enum | Values |`);
        sections.push(`|------|--------|`);
        for (const e of enumsRes.rows) {
            sections.push(`| ${e.enum_name} | ${e.values} |`);
        }
        sections.push('');
    }

    // ── 7. INDEXES ──
    console.log('📇 Fetching indexes...');
    const indexesRes = await client.query(`
        SELECT
            schemaname,
            tablename,
            indexname,
            indexdef
        FROM pg_indexes
        WHERE schemaname IN (${schemasSQL})
          AND indexname NOT LIKE '%_pkey'
        ORDER BY schemaname, tablename, indexname;
    `);

    if (indexesRes.rows.length > 0) {
        sections.push(`---\n## Indexes (${indexesRes.rows.length}, excluding PKs)\n`);
        sections.push(`| Table | Index | Definition |`);
        sections.push(`|-------|-------|------------|`);
        for (const idx of indexesRes.rows) {
            const def = idx.indexdef.length > 80
                ? idx.indexdef.substring(0, 77) + '...'
                : idx.indexdef;
            sections.push(`| ${idx.tablename} | ${idx.indexname} | \`${def}\` |`);
        }
        sections.push('');
    }

    // ── WRITE FILES ──
    const outputDir = path.resolve(__dirname, '..', 'DB');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const schemaBaseDir = path.join(outputDir, 'schema');
    if (!fs.existsSync(schemaBaseDir)) {
        fs.mkdirSync(schemaBaseDir, { recursive: true });
    }

    // Clean old flat files from schema root (backward compat)
    for (const f of fs.readdirSync(schemaBaseDir)) {
        const fullPath = path.join(schemaBaseDir, f);
        if (fs.statSync(fullPath).isFile()) {
            fs.unlinkSync(fullPath);
        }
    }

    const header = [
        `# Database Schema (Auto-generated)`,
        `> Generated: ${new Date().toISOString()}`,
        `> Source: Supabase PostgreSQL (read-only introspection)`,
        `> ⚠️ This file is auto-generated. Do NOT edit manually.\n`,
    ].join('\n');

    // Helper: render table to markdown lines
    function renderTable(name, lines) {
        const cols = columnsByTable[name] || [];
        const pks = pkByTable[name] || new Set();
        const fks = fkByTable[name] || [];
        const uniques = uniqueByTable[name] || new Set();

        lines.push(`### \`${name}\`\n`);
        lines.push(`| Column | Type | Nullable | Default | Constraints |`);
        lines.push(`|--------|------|----------|---------|-------------|`);

        for (const col of cols) {
            const type = col.character_maximum_length
                ? `${col.udt_name}(${col.character_maximum_length})`
                : col.udt_name;
            const nullable = col.is_nullable === 'YES' ? '✓' : '✗';
            const def = col.column_default
                ? col.column_default.length > 40
                    ? col.column_default.substring(0, 37) + '...'
                    : col.column_default
                : '';

            const constraints = [];
            if (pks.has(col.column_name)) constraints.push('PK');
            if (uniques.has(col.column_name)) constraints.push('UNIQUE');
            const fk = fks.find(f => f.column_name === col.column_name);
            if (fk) constraints.push(`FK → ${fk.foreign_table}.${fk.foreign_column}`);

            lines.push(`| ${col.column_name} | ${type} | ${nullable} | ${def} | ${constraints.join(', ')} |`);
        }
        lines.push('');
    }

    // Helper: display name for an entity
    const displayName = (schema, name) => schema === 'public' ? name : `${schema}.${name}`;

    // ── PER-SCHEMA FILE WRITING ──
    const allSchemaStats = {};

    for (const schema of SCHEMAS) {
        const schemaDir = path.join(schemaBaseDir, schema);
        // Clean and recreate
        if (fs.existsSync(schemaDir)) {
            for (const f of fs.readdirSync(schemaDir)) {
                fs.unlinkSync(path.join(schemaDir, f));
            }
        } else {
            fs.mkdirSync(schemaDir, { recursive: true });
        }

        // Filter data for this schema
        const schemaTables = tablesRes.rows.filter(t => t.table_schema === schema);
        const schemaFuncs = funcsRes.rows.filter(f => f.schema_name === schema);
        const schemaViews = viewsRes.rows.filter(v => v.table_schema === schema);
        const schemaTriggers = triggersRes.rows.filter(t => t.trigger_schema === schema);
        const schemaRls = rlsRes.rows.filter(p => p.schemaname === schema);
        const schemaEnums = enumsRes.rows.filter(e => e.schema_name === schema);
        const schemaIndexes = indexesRes.rows.filter(i => i.schemaname === schema);

        allSchemaStats[schema] = {
            tables: schemaTables.length,
            functions: schemaFuncs.length,
            views: schemaViews.length,
            triggers: schemaTriggers.length,
            rls: schemaRls.length,
            enums: schemaEnums.length,
            indexes: schemaIndexes.length,
        };

        const schemaLabel = schema.toUpperCase();

        // 1. Tables
        if (schemaTables.length > 0) {
            const tableNames = schemaTables.map(t => displayName(schema, t.table_name));
            const TABLES_PER_FILE = 30;
            for (let i = 0; i < tableNames.length; i += TABLES_PER_FILE) {
                const chunk = tableNames.slice(i, i + TABLES_PER_FILE);
                const fileIndex = Math.floor(i / TABLES_PER_FILE) + 1;
                const tableLines = [header, `## [${schemaLabel}] Tables (chunk ${fileIndex}: ${chunk[0]} — ${chunk[chunk.length - 1]})\n`];
                for (const name of chunk) {
                    renderTable(name, tableLines);
                }
                fs.writeFileSync(path.join(schemaDir, `tables_${fileIndex}.md`), tableLines.join('\n'), 'utf-8');
            }
        }

        // 2. Views
        if (schemaViews.length > 0) {
            const viewLines = [header, `## [${schemaLabel}] Views (${schemaViews.length})\n`];
            for (const view of schemaViews) {
                const secBadge = view.is_security_invoker ? '🔓 INVOKER' : '🔐 DEFINER';
                viewLines.push(`### \`${displayName(schema, view.table_name)}\` (${secBadge})\n`);
                viewLines.push('```sql');
                viewLines.push(view.view_definition?.trim() || '-- (definition not available)');
                viewLines.push('```\n');
            }
            fs.writeFileSync(path.join(schemaDir, 'views.md'), viewLines.join('\n'), 'utf-8');
        }

        // 3. Functions
        if (schemaFuncs.length > 0) {
            const FUNCS_PER_FILE = 20;
            for (let i = 0; i < schemaFuncs.length; i += FUNCS_PER_FILE) {
                const chunk = schemaFuncs.slice(i, i + FUNCS_PER_FILE);
                const fileIndex = Math.floor(i / FUNCS_PER_FILE) + 1;
                const funcLines = [header, `## [${schemaLabel}] Functions (chunk ${fileIndex}: ${chunk[0].name} — ${chunk[chunk.length - 1].name})\n`];
                for (const fn of chunk) {
                    const fnName = displayName(schema, fn.name);
                    const badge = fn.security === 'SECURITY DEFINER' ? ' 🔐' : '';
                    funcLines.push(`### \`${fnName}(${fn.args})\`${badge}\n`);
                    funcLines.push(`- **Returns**: ${fn.return_type}`);
                    funcLines.push(`- **Kind**: ${fn.kind} | ${fn.volatility} | ${fn.security}\n`);
                    funcLines.push('<details><summary>Source</summary>\n');
                    funcLines.push('```sql');
                    funcLines.push(fn.definition?.trim() || '-- (source not available)');
                    funcLines.push('```\n</details>\n');
                }
                fs.writeFileSync(path.join(schemaDir, `functions_${fileIndex}.md`), funcLines.join('\n'), 'utf-8');
            }
        }

        // 4. Triggers
        if (schemaTriggers.length > 0) {
            const triggerEvents = {};
            for (const t of schemaTriggers) {
                const key = `${t.table_name}.${t.trigger_name}`;
                if (!triggerEvents[key]) triggerEvents[key] = { ...t, events: [] };
                triggerEvents[key].events.push(t.event);
            }

            const trigLines = [header, `## [${schemaLabel}] Triggers (${Object.keys(triggerEvents).length})\n`];
            trigLines.push(`| Table | Trigger | Timing | Events | Action |`);
            trigLines.push(`|-------|---------|--------|--------|--------|`);
            for (const t of Object.values(triggerEvents)) {
                const action = t.action_statement.length > 60
                    ? t.action_statement.substring(0, 57) + '...'
                    : t.action_statement;
                trigLines.push(`| ${t.table_name} | ${t.trigger_name} | ${t.timing} | ${t.events.join(', ')} | ${action} |`);
            }
            trigLines.push('');
            fs.writeFileSync(path.join(schemaDir, 'triggers.md'), trigLines.join('\n'), 'utf-8');
        }

        // 5. RLS Policies
        if (schemaRls.length > 0) {
            const rlsByTable = {};
            for (const p of schemaRls) {
                if (!rlsByTable[p.tablename]) rlsByTable[p.tablename] = [];
                rlsByTable[p.tablename].push(p);
            }

            const rlsLines = [header, `## [${schemaLabel}] RLS Policies (${schemaRls.length})\n`];
            for (const [table, policies] of Object.entries(rlsByTable)) {
                rlsLines.push(`### \`${table}\` (${policies.length} policies)\n`);
                for (const p of policies) {
                    rlsLines.push(`#### ${p.policyname}\n`);
                    rlsLines.push(`- **Command**: ${p.cmd} | **Permissive**: ${p.permissive}`);
                    rlsLines.push(`- **Roles**: ${p.roles}`);
                    if (p.qual) {
                        rlsLines.push(`- **USING**:`);
                        rlsLines.push('```sql');
                        rlsLines.push(p.qual);
                        rlsLines.push('```');
                    }
                    if (p.with_check) {
                        rlsLines.push(`- **WITH CHECK**:`);
                        rlsLines.push('```sql');
                        rlsLines.push(p.with_check);
                        rlsLines.push('```');
                    }
                    rlsLines.push('');
                }
            }
            fs.writeFileSync(path.join(schemaDir, 'rls.md'), rlsLines.join('\n'), 'utf-8');
        }

        // 6. Enums
        if (schemaEnums.length > 0) {
            const enumLines = [header, `## [${schemaLabel}] Enums (${schemaEnums.length})\n`];
            enumLines.push(`| Enum | Values |`);
            enumLines.push(`|------|--------|`);
            for (const e of schemaEnums) {
                enumLines.push(`| ${e.enum_name} | ${e.values} |`);
            }
            enumLines.push('');
            fs.writeFileSync(path.join(schemaDir, 'enums.md'), enumLines.join('\n'), 'utf-8');
        }

        // 7. Indexes
        if (schemaIndexes.length > 0) {
            const idxLines = [header, `## [${schemaLabel}] Indexes (${schemaIndexes.length}, excluding PKs)\n`];
            idxLines.push(`| Table | Index | Definition |`);
            idxLines.push(`|-------|-------|------------|`);
            for (const idx of schemaIndexes) {
                const def = idx.indexdef.length > 80
                    ? idx.indexdef.substring(0, 77) + '...'
                    : idx.indexdef;
                idxLines.push(`| ${idx.tablename} | ${idx.indexname} | \`${def}\` |`);
            }
            idxLines.push('');
            fs.writeFileSync(path.join(schemaDir, 'indexes.md'), idxLines.join('\n'), 'utf-8');
        }

        console.log(`   📁 ${schema}/ — ${schemaTables.length} tables, ${schemaFuncs.length} funcs, ${schemaViews.length} views, ${schemaRls.length} RLS`);
    }

    // ── UNIFIED _index.md ──
    const indexFileLines = [header];

    for (const schema of SCHEMAS) {
        const schemaTables = tablesRes.rows.filter(t => t.table_schema === schema);
        const schemaFuncs = funcsRes.rows.filter(f => f.schema_name === schema);
        const schemaViews = viewsRes.rows.filter(v => v.table_schema === schema);

        indexFileLines.push(`## Schema: \`${schema}\`\n`);

        // Table index
        if (schemaTables.length > 0) {
            indexFileLines.push(`### Tables (${schemaTables.length})\n`);
            for (const t of schemaTables) {
                const name = displayName(schema, t.table_name);
                const cols = columnsByTable[name] || [];
                const fks = fkByTable[name] || [];
                const fkList = fks.map(f => `${f.column_name} → ${f.foreign_table}`).join(', ');
                indexFileLines.push(`- **\`${name}\`** (${cols.length} cols${fkList ? ` | FK: ${fkList}` : ''})`);
            }
            indexFileLines.push('');
        }

        // Function index
        if (schemaFuncs.length > 0) {
            indexFileLines.push(`### Functions (${schemaFuncs.length})\n`);
            for (let i = 0; i < schemaFuncs.length; i++) {
                const fn = schemaFuncs[i];
                const fnName = displayName(schema, fn.name);
                const fileIndex = Math.floor(i / 20) + 1;
                const badge = fn.security === 'SECURITY DEFINER' ? ' 🔐' : '';
                indexFileLines.push(`- \`${fnName}(${fn.args})\` → ${fn.return_type}${badge} *(${schema}/functions_${fileIndex}.md)*`);
            }
            indexFileLines.push('');
        }

        // View index
        if (schemaViews.length > 0) {
            indexFileLines.push(`### Views (${schemaViews.length})\n`);
            for (const view of schemaViews) {
                indexFileLines.push(`- **\`${displayName(schema, view.table_name)}\`**`);
            }
            indexFileLines.push('');
        }

        indexFileLines.push(`---\n`);
    }

    fs.writeFileSync(path.join(schemaBaseDir, '_index.md'), indexFileLines.join('\n'), 'utf-8');

    await client.end();

    // Count total files written
    let totalFiles = 1; // _index.md
    for (const schema of SCHEMAS) {
        const dir = path.join(schemaBaseDir, schema);
        if (fs.existsSync(dir)) totalFiles += fs.readdirSync(dir).length;
    }
    console.log(`\n✅ Schema written to ${totalFiles} files in DB/schema/`);
    console.log(`   📊 ${tablesRes.rows.length} tables`);
    console.log(`   👁️  ${viewsRes.rows.length} views`);
    console.log(`   ⚙️  ${funcsRes.rows.length} functions`);
    console.log(`   ⚡  ${triggersRes.rows.length} triggers`);
    console.log(`   🛡️  ${rlsRes.rows.length} RLS policies`);
    console.log(`   📦  ${enumsRes.rows.length} enums`);
    console.log(`   📇  ${indexesRes.rows.length} indexes`);
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    client.end();
    process.exit(1);
});
