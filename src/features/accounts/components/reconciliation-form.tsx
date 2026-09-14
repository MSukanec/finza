'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { useFinanceStore } from '@/stores/finance-store';
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
  ResponsiveModalBody,
  ResponsiveModalFooter,
} from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAutoFoco } from '@/components/ui/autofocus';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { cn, parseLocalDate } from '@/lib/utils';
import { parseAmount, formatMoney } from '@/lib/money';
import { CheckCircle2, AlertTriangle, Lightbulb, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { Reconciliation } from '@/lib/types';

/**
 * Arqueo de una billetera.
 *
 * El conteo es "a ciegas": no se muestra el saldo esperado hasta después de
 * escribir lo contado. Es práctica estándar y no un capricho — ver el número
 * esperado antes de contar sesga el conteo hacia ese número, y el arqueo deja
 * de servir para lo único que sirve: detectar que algo no cuadra.
 */
export function ReconciliationForm() {
  const activeSheet = useUIStore((s) => s.activeSheet);
  const sheetData = useUIStore((s) => s.sheetData);
  const closeSheet = useUIStore((s) => s.closeSheet);

  const accounts = useFinanceStore((s) => s.accounts);
  const currencies = useFinanceStore((s) => s.currencies);
  const transactions = useFinanceStore((s) => s.transactions);
  const reconciliations = useFinanceStore((s) => s.reconciliations);
  const recordReconciliation = useFinanceStore((s) => s.recordReconciliation);
  const resolveReconciliation = useFinanceStore((s) => s.resolveReconciliation);

  const isOpen = activeSheet === 'reconcile-wallet';
  const walletId = (sheetData?.walletId as string) || '';
  const wallet = accounts.find((a) => a.id === walletId);
  const currency = currencies.find((c) => c.id === wallet?.currency_id) || currencies[0];

  const [counted, setCounted] = useState('');
  // En el teléfono no se enfoca solo: el teclado taparía el formulario
  // antes de que se llegue a ver.
  const autoFoco = useAutoFoco();
  const [note, setNote] = useState('');
  const [result, setResult] = useState<Reconciliation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCounted('');
    setNote('');
    setResult(null);
    setError(null);
    setSubmitting(false);
  }, [isOpen, walletId]);

  const lastCount = useMemo(
    () =>
      reconciliations
        .filter((r) => r.wallet_id === walletId)
        .sort((a, b) => +new Date(b.counted_at) - +new Date(a.counted_at))[0] ?? null,
    [reconciliations, walletId]
  );

  const parsed = parseAmount(counted);
  const difference = result ? result.counted_amount - result.expected_amount : 0;
  const matched = result?.status === 'matched';

  /** Pistas sobre por qué puede no cuadrar. */
  const hints = useMemo(() => {
    if (!result || matched) return [];
    const out: string[] = [];
    const abs = Math.abs(difference);

    // Una diferencia que coincide exactamente con un movimiento suele ser un
    // duplicado o un signo invertido, no plata perdida.
    const twin = transactions.find(
      (t) => t.account_id === walletId && Math.abs(t.amount - abs) < 0.01
    );
    if (twin) {
      out.push(
        `La diferencia coincide exacto con «${twin.description}» del ${parseLocalDate(
          twin.date
        ).toLocaleDateString('es-AR')}. Fijate si quedó cargado dos veces o con el signo cambiado.`
      );
    }

    out.push(
      difference < 0
        ? 'Hay menos plata de la esperada: lo más común es un gasto que se pagó y no se cargó.'
        : 'Hay más plata de la esperada: puede faltar cargar un ingreso, o un gasto quedado cargado de más.'
    );

    if (lastCount) {
      const days = Math.round((Date.now() - +new Date(lastCount.counted_at)) / 86400000);
      if (days > 30) {
        out.push(
          `Pasaron ${days} días desde el último arqueo. Cuanto más largo el período, más difícil encontrar de dónde viene.`
        );
      }
    } else {
      out.push('Es el primer arqueo de esta billetera, así que la diferencia puede venir de cualquier momento.');
    }

    return out;
  }, [result, matched, difference, transactions, walletId, lastCount]);

  const handleCount = async () => {
    if (submitting) return;
    if (parsed === null || parsed < 0) return setError('Ingresá cuánto contaste.');
    if (!wallet) return setError('No se encontró la billetera.');

    setError(null);
    setSubmitting(true);
    try {
      setResult(await recordReconciliation(wallet.id, parsed, note.trim() || undefined));
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar el arqueo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (resolution: 'adjusted' | 'explained') => {
    if (!result || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await resolveReconciliation(result.id, resolution, note.trim() || undefined);
      closeSheet();
    } catch (e: any) {
      setError(e?.message || 'No se pudo cerrar la diferencia.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Arqueo de {wallet?.name ?? 'billetera'}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            {result
              ? 'Comparación con lo que la app tenía calculado.'
              : 'Contá la plata que hay ahora mismo y anotala. No mires el saldo de la app antes de contar.'}
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>

        <ResponsiveModalBody className="space-y-3">
          {!result ? (
            <>
              {/* La billetera ya está en el título del modal: repetirla acá
                  hacía una etiqueta tan larga que se comía la fila entera. */}
              <Field
                label="Contás"
                htmlFor="arqueo-monto"
                hint={parsed !== null ? formatMoney(parsed, currency) : currency?.code}
              >
                <Input
                  id="arqueo-monto"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCount()}
                  className="text-base font-semibold tabular-nums"
                  autoFocus={autoFoco}
                />
              </Field>

              <Field label="Nota" hint="Opcional" htmlFor="arqueo-nota">
                <Textarea
                  id="arqueo-nota"
                  placeholder="Ej: contado con Joel al cierre"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxRows={3}
                />
              </Field>

              <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                Esto <strong className="text-foreground">no cambia</strong> el saldo inicial de la
                billetera. Queda registrado como un hecho con fecha y autor, y se compara contra lo
                que la app calculó a partir de los movimientos.
                {lastCount && (
                  <>
                    {' '}
                    El último arqueo fue el{' '}
                    {new Date(lastCount.counted_at).toLocaleDateString('es-AR')}.
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <div
                className={cn(
                  'rounded-2xl p-4',
                  matched ? 'bg-income/10' : 'bg-expense/10'
                )}
              >
                <div className="flex items-start gap-3">
                  {matched ? (
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-income" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-expense" />
                  )}
                  <div className="min-w-0">
                    <p className={cn('font-semibold', matched ? 'text-income' : 'text-expense')}>
                      {matched
                        ? 'Cuadra'
                        : difference < 0
                          ? `Faltan ${formatMoney(Math.abs(difference), currency)}`
                          : `Sobran ${formatMoney(difference, currency)}`}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {matched
                        ? 'Lo contado coincide con lo calculado. Queda registrado.'
                        : 'Hay que decidir qué hacer con la diferencia.'}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="space-y-2 text-sm">
                <Row label="Contaste" value={formatMoney(result.counted_amount, currency)} />
                <Row
                  label="La app calculaba"
                  value={formatMoney(result.expected_amount, currency)}
                />
                <Row
                  label="Diferencia"
                  value={formatMoney(difference, currency)}
                  tone={matched ? undefined : difference < 0 ? 'expense' : 'income'}
                />
              </dl>

              {!matched && (
                <div className="space-y-2 rounded-xl bg-muted p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <Lightbulb className="size-3.5" />
                    Por qué puede estar pasando
                  </p>
                  <ul className="space-y-1.5">
                    {hints.map((h, i) => (
                      <li key={i} className="text-xs leading-relaxed text-muted-foreground">
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/transactions?wallet=${walletId}`}
                    onClick={closeSheet}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Revisar los movimientos de esta billetera
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
            </>
          )}

          {!result && error && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </ResponsiveModalBody>

        {/* Las acciones secundarias van en el CUERPO, no en el footer.
            El footer aplica `h-14 flex-1` a sus hijos directos porque la regla
            es que el footer entero sea el botón: metiendo un <div> con tres
            botones adentro, ese div pasaba a ser "el botón" y todo quedaba
            apretado en una pastilla. */}
        {result && !matched && (
          <div className="shrink-0 space-y-2 border-t border-border/60 px-4 py-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleResolve('explained')}
                disabled={submitting}
                className="h-10 flex-1"
              >
                Ya sé por qué
              </Button>
              <Button variant="ghost" onClick={closeSheet} className="h-10 flex-1">
                Resolver después
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              El ajuste asienta un movimiento por la diferencia, así queda a la vista en vez de
              desaparecer.
            </p>
          </div>
        )}

        <ResponsiveModalFooter>
          {!result ? (
            <Button onClick={handleCount} disabled={submitting || parsed === null}>
              {submitting ? 'Registrando…' : 'Registrar arqueo'}
            </Button>
          ) : matched ? (
            <Button onClick={closeSheet}>Listo</Button>
          ) : (
            <Button onClick={() => handleResolve('adjusted')} disabled={submitting}>
              Asentar ajuste de {formatMoney(Math.abs(difference), currency)}
            </Button>
          )}
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'income' | 'expense';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-semibold tabular-nums',
          tone === 'income' && 'text-income',
          tone === 'expense' && 'text-expense'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
