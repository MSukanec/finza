import { create } from 'zustand';

export type ToastTone = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  /** Acción opcional, p. ej. "Reintentar" tras una escritura fallida. */
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

// Un error se queda hasta que lo cierren: si una escritura no llegó al
// servidor, que el aviso desaparezca solo es peor que no tenerlo.
const AUTO_CLOSE: Record<ToastTone, number | null> = {
  error: null,
  success: 3000,
  info: 4000,
};

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));

    const ms = AUTO_CLOSE[toast.tone];
    if (ms !== null) setTimeout(() => get().dismiss(id), ms);

    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Atajo para usar fuera de React (el store de finanzas, sobre todo). */
export const toast = {
  error: (message: string, action?: Toast['action']) =>
    useToastStore.getState().push({ tone: 'error', message, action }),
  success: (message: string) => useToastStore.getState().push({ tone: 'success', message }),
  info: (message: string) => useToastStore.getState().push({ tone: 'info', message }),
};
