'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFinanceStore } from '@/stores/finance-store';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'signup';

export function LoginForm() {
  const router = useRouter();
  const login = useFinanceStore((s) => s.login);
  const signUp = useFinanceStore((s) => s.signUp);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'login') {
        await login(email, password);
        router.push('/dashboard');
      } else {
        const { needsConfirmation } = await signUp(email, password, fullName);
        if (needsConfirmation) {
          setNotice('Te mandamos un email para confirmar la cuenta. Abrilo y volvé a entrar.');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err: any) {
      setError(
        err?.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos.'
          : err?.message || 'Ocurrió un error.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) {
      setError('No se pudo redirigir a Google.');
      setLoading(false);
    }
    // Si sale bien, el navegador ya se fue a Google: no hace falta apagar el loading.
  };

  return (
    <div className="bg-card p-6 md:p-8 rounded-2xl shadow-soft-md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-accent/60">
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
              className={cn(
                'py-2 rounded-lg text-sm font-medium transition-colors',
                mode === m ? 'bg-card text-foreground shadow-soft-xs' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-xl">{error}</div>
        )}
        {notice && (
          <div className="p-3 bg-accent text-sm rounded-xl text-muted-foreground">{notice}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Nombre</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Tu nombre"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
            {mode === 'signup' && (
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            )}
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Button>
        </form>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border"></span>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">También puedes</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full bg-card"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <svg className="size-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuar con Google
        </Button>
      </div>
    </div>
  );
}
