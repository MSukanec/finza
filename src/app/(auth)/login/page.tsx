import { LoginForm } from '@/features/auth/components/login-form';
import { Wallet } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="w-full max-w-md space-y-8 animate-fade-in">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="size-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-soft-md">
          <Wallet className="size-7 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Bienvenido a Finza</h1>
        <p className="text-sm text-muted-foreground mt-2 text-balance">
          Ingresa o crea tu cuenta para gestionar tus finanzas reales.
        </p>
      </div>

      <LoginForm />
    </div>
  );
}
