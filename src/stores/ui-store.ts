import { create } from 'zustand';

interface UIState {
  // Modals / Sheets
  activeSheet: string | null;
  sheetData: Record<string, unknown> | undefined;

  // Actions
  openSheet: (id: string, data?: Record<string, unknown>) => void;
  closeSheet: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  activeSheet: null,
  sheetData: undefined,

  openSheet: (id, data) => set({ activeSheet: id, sheetData: data }),
  closeSheet: () => set({ activeSheet: null, sheetData: undefined }),
}));
