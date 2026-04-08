import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

async function run() {
    console.log('🔌 Migrating DB: Adding group_name to categories');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        await client.query(`
            ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS group_name TEXT NOT NULL DEFAULT 'General';
        `);
        console.log('✅ DB Migration successful!');
    } catch (e) {
        console.error('❌ ERROR', e.message);
    } finally {
        await client.end();
    }
}

run();
