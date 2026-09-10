import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // supabase-js viene con flowType 'implicit' por defecto: los tokens vuelven
    // en el fragmento de la URL. PKCE devuelve un code de un solo uso que se
    // canjea contra un verifier local, que es lo que recomienda OAuth 2.1.
    flowType: 'pkce',
    // Apagado a propósito: el código PKCE es de un solo uso, y si el cliente lo
    // canjea solo mientras /auth/callback también lo intenta, uno de los dos
    // pierde. El canje se hace explícito en esa página.
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
});
