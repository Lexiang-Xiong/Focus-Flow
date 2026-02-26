import type { StateCreator } from 'zustand';
import type { AppState } from '@/types';

export interface UIState {
  currentView: AppState['currentView'];
  activeZoneId: string | null;
  focusedTaskId: string | null;
  activeHistoryId: string | null;
}

export interface UIActions {
  setCurrentView: (view: AppState['currentView']) => void;
  setActiveZoneId: (id: string | null) => void;
  setFocusedTaskId: (id: string | null) => void;
}

export type UISlice = UIState & UIActions;

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  currentView: 'zones',
  activeZoneId: null,
  focusedTaskId: null,
  activeHistoryId: null,

  setCurrentView: (view) => set({ currentView: view }),
  setActiveZoneId: (id) => set({ activeZoneId: id, focusedTaskId: null }),
  setFocusedTaskId: (id) => set({ focusedTaskId: id }),
});
