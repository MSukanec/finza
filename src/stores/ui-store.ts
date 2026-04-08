import { create } from 'zustand';

type SheetType = 'new-transaction' | 'edit-transaction' | 'new-account' | 'edit-account' | 'new-category' | 'edit-category' | 'new-budget' | 'edit-budget' | 'new-debt' | 'edit-debt' | null;

interface UIState {
  // Modals / Sheets
  activeSheet: SheetType;
  sheetData: Record<string, unknown> | undefined;

  // Actions
  openSheet: (id: SheetType, data?: Record<string, unknown>) => void;
  closeSheet: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  activeSheet: null,
  sheetData: undefined,

  openSheet: (id, data) => set({ activeSheet: id, sheetData: data }),
  closeSheet: () => set({ activeSheet: null, sheetData: undefined }),
}));
