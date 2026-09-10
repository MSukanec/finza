'use client';

import { useEffect, useState } from 'react';
import { useFinanceStore } from '@/stores/finance-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Crown, Mail, Trash2, UserPlus, Clock } from 'lucide-react';
import type { WorkspaceMember } from '@/lib/types';
import { useGlobalDialog } from '@/components/providers/dialog-provider';

export function WorkspaceMembersDialog({
  workspaceId,
  workspaceName,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  workspaceName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const members = useFinanceStore((s) => s.members);
  const appUserId = useFinanceStore((s) => s.appUserId);
  const workspaces = useFinanceStore((s) => s.workspaces);
  const loadMembers = useFinanceStore((s) => s.loadMembers);
  const inviteMember = useFinanceStore((s) => s.inviteMember);
  const removeMember = useFinanceStore((s) => s.removeMember);
  const dialog = useGlobalDialog();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isOwner = workspaces.find((w) => w.id === workspaceId)?.role === 'owner';

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice(null);
    setListLoading(true);
    loadMembers(workspaceId)
      .catch((e: any) => setError(e.message || 'No se pudieron cargar los miembros.'))
      .finally(() => setListLoading(false));
  }, [open, workspaceId, loadMembers]);

  const handleInvite = async () => {
    const value = email.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await inviteMember(workspaceId, value);
      setEmail('');
      setNotice(
        result === 'added'
          ? `Listo, ${value} ya tiene acceso al espacio.`
          : `${value} todavía no tiene cuenta en Finza. La invitación queda pendiente y se activa sola cuando se registre con ese email.`
      );
    } catch (e: any) {
      setError(e.message || 'No se pudo invitar.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (m: WorkspaceMember) => {
    const label = m.pending ? `la invitación a ${m.email}` : `a ${m.email} del espacio`;
    const ok = await dialog.confirm('Quitar del espacio', `¿Quitar ${label}?`);
    if (!ok) return;
    setError(null);
    try {
      await removeMember(workspaceId, m);
    } catch (e: any) {
      setError(e.message || 'No se pudo quitar.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Miembros de «{workspaceName}»</DialogTitle>
          <DialogDescription>
            Todos los miembros ven y editan los mismos movimientos, cuentas y categorías de este
            espacio. No acceden a tus otros espacios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {isOwner && (
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-xs text-muted-foreground">
                Invitar por email
              </Label>
              <div className="flex gap-2">
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="socio@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  disabled={loading}
                />
                <Button onClick={handleInvite} disabled={!email.trim() || loading} className="shrink-0">
                  <UserPlus className="size-4 mr-1.5" />
                  {loading ? 'Invitando…' : 'Invitar'}
                </Button>
              </div>
            </div>
          )}

          {notice && (
            <p className="text-sm text-muted-foreground bg-accent/50 rounded-xl p-3">{notice}</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            {listLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

            {!listLoading &&
              members.map((m) => {
                const isMe = m.user_id === appUserId;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/60',
                      m.pending && 'opacity-70 border-dashed'
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      {m.pending ? <Clock className="size-4" /> : <Mail className="size-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">
                        {m.full_name || m.email}
                        {isMe && <span className="text-muted-foreground font-normal"> (vos)</span>}
                      </p>
                      {m.full_name && (
                        <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                      )}
                    </div>

                    {m.pending ? (
                      <Badge variant="outline" className="shrink-0">Pendiente</Badge>
                    ) : m.role === 'owner' ? (
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <Crown className="size-3" />
                        Dueño
                      </Badge>
                    ) : null}

                    {isOwner && !isMe && (
                      <button
                        onClick={() => handleRemove(m)}
                        className="p-1.5 -m-1 rounded-md text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        title={m.pending ? 'Cancelar invitación' : 'Quitar del espacio'}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>

          {!isOwner && (
            <p className="text-xs text-muted-foreground">
              Solo el dueño del espacio puede invitar o quitar miembros.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
