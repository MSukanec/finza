import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

async function run() {
    console.log('🔌 Fixing DB public.users RLS...');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        await client.query(`
            DROP POLICY IF EXISTS "USERS SELECT OWN_USER_DATA" ON public.users;
            CREATE POLICY "USERS SELECT OWN_USER_DATA" ON public.users
                FOR SELECT TO public
                USING (auth_id = auth.uid());
                
            DROP POLICY IF EXISTS "USERS UPDATE OWN_USER_DATA" ON public.users;
            CREATE POLICY "USERS UPDATE OWN_USER_DATA" ON public.users
                FOR UPDATE TO public
                USING (auth_id = auth.uid());
        `);
        console.log('✅ RLS Polices fixed successfully!');
    } catch (e) {
        console.error('❌ ERROR', e.message);
    } finally {
        await client.end();
    }
}

run();
