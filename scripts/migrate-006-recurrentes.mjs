import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

async function run() {
    console.log('🔌 Migrating DB: Adding is_recurring to categories and period_month to transactions');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        await client.query(`
            ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
            ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS period_month VARCHAR(7); -- format YYYY-MM
        `);
        console.log('✅ DB Migration successful!');
    } catch (e) {
        console.error('❌ ERROR', e.message);
    } finally {
        await client.end();
    }
}

run();
