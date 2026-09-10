'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Plus,
  Menu,
  Wallet,
  Tags,
  Target,
  BarChart3,
  X,
  FileSpreadsheet,
  Landmark,
  Repeat,
  History,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import { TransactionForm } from '@/features/transactions/components/transaction-form';
import { AccountForm } from '@/features/accounts/components/account-form';
import { CategoryForm } from '@/features/categories/components/category-form';
import { DebtForm } from '@/features/debts/components/debt-form';
import { BudgetForm } from '@/features/budgets/components/budget-form';
import { ReconciliationForm } from '@/features/accounts/components/reconciliation-form';
import { UserProfile } from '@/components/user-profile';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { DialogProvider } from '@/components/providers/dialog-provider';

/**
 * `adminOnly` esconde secciones que todavía no están listas para un usuario
 * común. No es seguridad de datos —de eso se ocupa RLS—, es qué se ofrece.
 * Las rutas además se protegen en cada página con <AdminOnly>.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/transactions', label: 'Movimientos', icon: ArrowLeftRight },
  { href: '/accounts', label: 'Billeteras', icon: Wallet },
  { href: '/reports', label: 'Reportes', icon: BarChart3 },
  { href: '/categories', label: 'Categorías', icon: Tags },
  { href: '/recurrentes', label: 'Recurrentes', icon: Repeat },
  { href: '/actividad', label: 'Actividad', icon: History },
  { href: '/budgets', label: 'Presupuestos', icon: Target, adminOnly: true },
  { href: '/debts', label: 'Deudas', icon: Landmark, adminOnly: true },
  { href: '/importar', label: 'Importar', icon: FileSpreadsheet, adminOnly: true },
];

/** Los 4 accesos del bottom nav; el resto vive en el menú "Más". */
const PRIMARY_MOBILE = ['/dashboard', '/transactions', '/accounts', '/reports'];

function isActive(pathname: string, href: string) {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const openSheet = useUIStore((s) => s.openSheet);
  const isHydrated = useFinanceStore((s) => s.isHydrated);
  const user = useFinanceStore((s) => s.user);
  const isAdmin = useFinanceStore((s) => s.isAdmin);

  useEffect(() => {
    if (isHydrated && !user) router.push('/login');
  }, [isHydrated, user, router]);

  // Cerrar el menú "Más" al navegar.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (!isHydrated || !user) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <span className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-accent text-primary shadow-soft-sm">
            <Wallet className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  const navItems = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const mobileNav = navItems.filter((i) => PRIMARY_MOBILE.includes(i.href));
  const moreNav = navItems.filter((i) => !PRIMARY_MOBILE.includes(i.href));

  return (
    <DialogProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        {/* ===== Sidebar (desktop) ===== */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar md:flex">
          <div className="flex h-16 items-center gap-3 border-b border-border/60 px-5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="size-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Finza</span>
          </div>

          <div className="border-b border-border/60 p-3">
            <WorkspaceSwitcher />
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <item.icon className="size-[18px]" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border/60 p-3">
            <UserProfile />
          </div>
        </aside>

        {/* ===== Contenido ===== */}
        <main className="flex min-h-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:hidden">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Wallet className="size-4" />
              </span>
              <span className="text-base font-semibold tracking-tight">Finza</span>
            </div>
            <UserProfile className="w-auto" />
          </header>

          {/* El scroll lo maneja PageLayout, para que el header de cada página
              quede fuera del área que scrollea y no necesite `sticky`. */}
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </main>

        {/* ===== Bottom nav (mobile) ===== */}
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/90 backdrop-blur-md md:hidden">
          <div className="safe-bottom mx-auto flex h-16 max-w-lg items-center justify-around px-2">
            {mobileNav.slice(0, 2).map((item) => (
              <NavTab key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}

            <button
              type="button"
              onClick={() => openSheet('new-transaction')}
              aria-label="Nuevo movimiento"
              className="-mt-6 flex size-13 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft-md transition-transform active:scale-95"
            >
              <Plus className="size-6" />
            </button>

            {mobileNav.slice(2).map((item) => (
              <NavTab key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}

            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="Más opciones"
              className="flex flex-col items-center gap-1 px-2 text-muted-foreground transition-colors"
            >
              <Menu className="size-5" />
              <span className="text-[10px] font-medium">Más</span>
            </button>
          </div>
        </nav>

        {/* ===== Menú "Más" (mobile) ===== */}
        {moreOpen && (
          <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
            <button
              aria-label="Cerrar"
              className="absolute inset-0 animate-fade-in bg-foreground/40"
              onClick={() => setMoreOpen(false)}
            />
            <div className="safe-bottom absolute inset-x-0 bottom-0 animate-slide-up rounded-t-3xl bg-card p-4 pb-8">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold tracking-tight">Más opciones</h2>
                <button
                  onClick={() => setMoreOpen(false)}
                  aria-label="Cerrar"
                  className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mb-4 border-b border-border/60 pb-4">
                <WorkspaceSwitcher />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {moreNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-accent/50 p-4 transition-colors hover:bg-accent"
                  >
                    <item.icon className="size-5 text-primary" />
                    <span className="text-center text-xs font-medium leading-tight">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== Modales globales ===== */}
        <TransactionForm />
        <AccountForm />
        <CategoryForm />
        <DebtForm />
        <BudgetForm />
        <ReconciliationForm />
      </div>
    </DialogProvider>
  );
}

function NavTab({
  item,
  active,
}: {
  item: { href: string; label: string; icon: React.ElementType };
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-col items-center gap-1 px-2 transition-colors',
        active ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      <item.icon className="size-5" />
      <span className="text-[10px] font-medium">{item.label}</span>
    </Link>
  );
}
