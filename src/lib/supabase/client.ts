import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Ninguna llamada puede quedarse esperando para siempre.
 *
 * `fetch` no tiene tiempo límite: si la conexión se corta a mitad de camino
 * —cambiar de wifi a datos, salir del subsuelo, despertar el teléfono— la
 * promesa no se resuelve nunca. Como la app espera a que termine para mostrar
 * algo, la pantalla se quedaba en "Verificando sesión" sin error ni final.
 *
 * Con esto, a los 20 segundos falla, y la app lo puede contar y ofrecer
 * reintentar.
 */
const TIEMPO_LIMITE = 20_000;

const fetchConTiempoLimite: typeof fetch = async (input, init) => {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TIEMPO_LIMITE);
  // Si quien llama ya traía su propia cancelación, se respeta.
  init?.signal?.addEventListener('abort', () => corte.abort(), { once: true });
  try {
    return await fetch(input, { ...init, signal: corte.signal });
  } catch (e) {
    if (corte.signal.aborted && !init?.signal?.aborted) {
      throw new Error('La conexión tardó demasiado. Probá de nuevo.');
    }
    throw e;
  } finally {
    clearTimeout(reloj);
  }
};

/**
 * El candado que sincroniza la sesión entre pestañas, pero con tope.
 *
 * supabase-js serializa todo lo de autenticación con la Web Locks API para que
 * dos pestañas no renueven el token a la vez. El problema es que espera sin
 * límite: si otra pestaña quedó dormida con el candado tomado —o el sistema la
 * suspendió, que en el iPhone pasa—, `getSession()` no vuelve nunca y la app se
 * queda cargando.
 *
 * Acá se espera 5 segundos. Si no se pudo tomar, se sigue igual: en el peor
 * caso dos pestañas renuevan el token a la vez, y de eso supabase-js se
 * recupera solo. Quedarse colgado, no.
 */
const ESPERA_MAXIMA = 5_000;

const candadoConTope = async <R,>(nombre: string, _sinUsar: number, fn: () => Promise<R>): Promise<R> => {
  const locks = globalThis.navigator?.locks;
  if (!locks) return fn();

  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA_MAXIMA);
  // Si la operación llegó a empezar, un error es SUYO y hay que dejarlo pasar;
  // volver a correrla sería repetir un canje de token que ya se hizo.
  let empezo = false;
  try {
    return await locks.request(nombre, { signal: corte.signal }, async () => {
      empezo = true;
      return fn();
    });
  } catch (e) {
    if (empezo) throw e;
    return fn();
  } finally {
    clearTimeout(reloj);
  }
};

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
    lock: candadoConTope,
  },
  global: { fetch: fetchConTiempoLimite },
});
