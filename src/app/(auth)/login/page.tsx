import { LoginForm } from '@/features/auth/components/login-form';
import { Wallet } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="w-full max-w-md space-y-8 animate-fade-in">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
          <Wallet className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Bienvenido a Finza</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Ingresa o crea tu cuenta para gestionar tus finanzas reales.
        </p>
      </div>

      <LoginForm />
    </div>
  );
}
