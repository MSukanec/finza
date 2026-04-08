'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  PlusCircle,
  PieChart,
  Menu,
  Wallet,
  Tags,
  Target,
  BarChart3,
  Settings,
  Moon,
  Sun,
  X,
  FileSpreadsheet,
  Landmark,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { TransactionForm } from '@/features/transactions/components/transaction-form';
import { AccountForm } from '@/features/accounts/components/account-form';
import { CategoryForm } from '@/features/categories/components/category-form';
import { DebtForm } from '@/features/debts/components/debt-form';
import { UserProfile } from '@/components/user-profile';

const mainNavItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/transactions', label: 'Movimientos', icon: ArrowLeftRight },
  { href: '/accounts', label: 'Cuentas', icon: Wallet },
  { href: '/budgets', label: 'Presupuestos', icon: Target },
  { href: '/reports', label: 'Reportes', icon: BarChart3 },
  { href: '/categories', label: 'Categorías', icon: Tags },
  { href: '/debts', label: 'Deudas', icon: Landmark },
  { href: '/importar', label: 'Importar Historial', icon: FileSpreadsheet },
];

const bottomNavItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/transactions', label: 'Movimientos', icon: ArrowLeftRight },
  { id: 'add', label: 'Agregar', icon: PlusCircle },
  { href: '/budgets', label: 'Presupuestos', icon: Target },
  { id: 'more', label: 'Más', icon: Menu },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const openSheet = useUIStore((s) => s.openSheet);

  const isHydrated = useFinanceStore((s) => s.isHydrated);
  const user = useFinanceStore((s) => s.user);
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !user) {
      router.push('/login');
    }
  }, [isHydrated, user, router, pathname]);

  const handleBottomNavClick = (item: (typeof bottomNavItems)[number]) => {
    if (item.id === 'add') {
      openSheet('new-transaction');
      return;
    }
    if (item.id === 'more') {
      setMoreMenuOpen(true);
      return;
    }
  };

  // Mostrar un loader amigable mientras verificamos sesión o impedimos el parpadeo de UI
  if (!isHydrated || !user) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Wallet className="w-8 h-8 text-primary" />
          <p className="text-muted-foreground text-sm font-medium">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* ===== SIDEBAR (Desktop) ===== */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-sidebar">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Wallet className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">Finza</span>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-3 space-y-1">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-2">
          <UserProfile />
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200 w-full"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
          </button>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="flex-1 flex flex-col min-h-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-base tracking-tight">Finza</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <UserProfile />
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 md:py-8 pb-24 md:pb-8">
            {children}
          </div>
        </div>
      </main>

      {/* ===== BOTTOM NAVIGATION (Mobile) ===== */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-background/80 backdrop-blur-xl border-t border-border z-50 safe-bottom">
        <div className="flex items-center justify-around h-16">
          {bottomNavItems.map((item) => {
            const isActive = item.href ? (
              pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            ) : false;

            if (item.id === 'add') {
              return (
                <button
                  key="add"
                  onClick={() => handleBottomNavClick(item)}
                  className="flex flex-col items-center justify-center -mt-4"
                >
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/25">
                    <PlusCircle className="w-6 h-6 text-primary-foreground" />
                  </div>
                </button>
              );
            }

            if (item.id === 'more') {
              return (
                <button
                  key="more"
                  onClick={() => handleBottomNavClick(item)}
                  className="flex flex-col items-center justify-center gap-0.5 text-muted-foreground"
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href!}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ===== MORE MENU OVERLAY (Mobile) ===== */}
      {moreMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={() => setMoreMenuOpen(false)}
          />
          <div className="absolute bottom-0 inset-x-0 bg-card rounded-t-2xl p-4 pb-8 safe-bottom animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Más opciones</h3>
              <button
                onClick={() => setMoreMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-accent"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { href: '/accounts', label: 'Cuentas', icon: Wallet },
                { href: '/categories', label: 'Categorías', icon: Tags },
                { href: '/debts', label: 'Deudas', icon: Landmark },
                { href: '/reports', label: 'Reportes', icon: BarChart3 },
                { href: '/importar', label: 'Importar', icon: FileSpreadsheet },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreMenuOpen(false)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-accent/50 hover:bg-accent transition-colors"
                >
                  <item.icon className="w-6 h-6 text-primary" />
                  <span className="text-xs font-medium">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== GLOBAL MODALS ===== */}
      <TransactionForm />
      <AccountForm />
      <CategoryForm />
      <DebtForm />
    </div>
  );
}
