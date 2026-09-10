'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useFinanceStore } from '@/stores/finance-store';
import { Wallet } from 'lucide-react';

/**
 * Vuelta del OAuth de Google (flujo PKCE).
 *
 * El canje del `?code=` se hace acá de forma explícita, no vía
 * detectSessionInUrl. El código es de un solo uso: si dos caminos lo intentan
 * (o si React remonta el efecto en desarrollo), el segundo intento falla.
 * De ahí el guard por código.
 */
const consumed = new Set<string>();

export default function AuthCallbackPage() {
  const router = useRouter();
  const hydrate = useFinanceStore((s) => s.hydrate);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get('error_description') || params.get('error');
      if (oauthError) {
        setError(oauthError);
        return;
      }

      // Si ya había sesión (por ejemplo, se recargó esta página), seguimos.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        await hydrate();
        router.replace('/dashboard');
        return;
      }

      const code = params.get('code');
      if (!code) {
        setError('Google no devolvió un código de autorización.');
        return;
      }

      if (consumed.has(code)) return;
      consumed.add(code);

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        setError(exchangeError.message);
        return;
      }

      await hydrate();
      router.replace('/dashboard');
    })();
  }, [router, hydrate]);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
      <span className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-accent text-primary shadow-soft-sm">
        <Wallet className="size-6" />
      </span>

      {error ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">No pudimos completar el inicio de sesión</p>
          <p className="rounded-xl bg-destructive/10 p-3 text-left font-mono text-xs text-destructive">
            {error}
          </p>
          <button
            onClick={() => router.replace('/login')}
            className="text-sm text-primary underline underline-offset-4"
          >
            Volver al inicio de sesión
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Completando inicio de sesión…</p>
      )}
    </div>
  );
}
