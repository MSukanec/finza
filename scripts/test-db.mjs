import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

async function run() {
    console.log('🔌 Connecting to DB directly...');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log('✅ Connected.');

    try {
        console.log('👤 Fetching first user...');
        const userRes = await client.query('SELECT id FROM public.users LIMIT 1');
        if (userRes.rows.length === 0) {
           console.log('❌ No users in public.users');
           return;
        }
        const userId = userRes.rows[0].id;
        console.log('Got user id:', userId);

        console.log('🏦 Attempting to insert into wallets...');
        const insertRes = await client.query(`
            INSERT INTO public.wallets (user_id, name, type, currency_code) 
            VALUES ($1, 'TEST WALLET DIR', 'bank', 'ARS') RETURNING *
        `, [userId]);
        console.log('✅ SUCCESS!', insertRes.rows);
    } catch (e) {
        console.error('❌ INSERT ERROR', e.message);
        console.error('DETAIL:', e.detail);
        console.error('HINT:', e.hint);
    } finally {
        await client.end();
    }
}

run();
