'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Person } from '@/lib/types';

export interface Conectado extends Person {
  /** Cuándo se anunció. Sirve para "hace 2 min" cuando la pestaña quedó abierta. */
  desde: string;
}

/**
 * Quién más del espacio está con la app abierta.
 *
 * Usa Presence de Supabase Realtime y no una columna `last_seen`: no escribe en
 * la base, no hay nada que limpiar, y la desconexión la detecta el servidor
 * cuando se cae el websocket. Una columna de heartbeat obliga a escribir cada
 * pocos segundos por cada persona y a decidir a mano cuándo alguien "ya no
 * está".
 *
 * El canal es privado: la política de `realtime.messages` (DB/039) sólo deja
 * entrar a los miembros del espacio. Sin eso, cualquiera con el uuid podría
 * escuchar quién trabaja acá y a qué hora.
 */
export function usePresence(workspaceId: string | null, yo: Person | null): Conectado[] {
  const [otros, setOtros] = useState<Conectado[]>([]);

  useEffect(() => {
    if (!workspaceId || !yo) return;

    const canal = supabase.channel(`presencia:${workspaceId}`, {
      config: { presence: { key: yo.id }, private: true },
    });

    const volcar = () => {
      const estado = canal.presenceState<Conectado>();
      const gente: Conectado[] = [];

      for (const [clave, entradas] of Object.entries(estado)) {
        if (clave === yo.id) continue; // uno mismo no cuenta
        const primera = entradas[0];
        if (primera) gente.push(primera);
      }

      // Estable por nombre: sin esto la lista se reordena sola cada vez que
      // alguien abre otra pestaña.
      gente.sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
      setOtros(gente);
    };

    canal
      .on('presence', { event: 'sync' }, volcar)
      .on('presence', { event: 'join' }, volcar)
      .on('presence', { event: 'leave' }, volcar)
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') {
          canal.track({
            id: yo.id,
            full_name: yo.full_name,
            email: yo.email,
            avatar_url: yo.avatar_url,
            desde: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(canal);
    };
    // Se depende de los campos y no del objeto `yo`: viene de un mapa que se
    // rearma en cada hydrate, así que su identidad cambia sin que cambie la
    // persona, y el canal se resuscribiría de más.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, yo?.id, yo?.full_name, yo?.avatar_url, yo?.email]);

  // Derivado y no un setState en el efecto: al salir del espacio la lista tiene
  // que quedar vacía en el mismo render, sin un ciclo extra.
  return workspaceId && yo ? otros : [];
}
