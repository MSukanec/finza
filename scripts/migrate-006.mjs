import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

async function run() {
    console.log('🔌 Migrating DB: Adding import_batch and deleted_at');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        const fs = await import('fs');
        const sql = fs.readFileSync(path.resolve(__dirname, '../DB/006_import_and_soft_delete.sql'), 'utf-8');
        await client.query(sql);
        console.log('✅ DB Migration successful!');
    } catch (e) {
        console.error('❌ ERROR', e.message);
    } finally {
        await client.end();
    }
}

run();
