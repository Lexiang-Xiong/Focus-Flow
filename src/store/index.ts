import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { sqliteStorage } from '@/lib/storage-adapter';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createZoneSlice, type ZoneSlice } from './slices/zoneSlice';
import { createTaskSlice, type TaskSlice } from './slices/taskSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice';

export type AppStore = UISlice & ZoneSlice & TaskSlice & HistorySlice & SettingsSlice;

// 组合所有 slices
export const useAppStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createUISlice(...a),
      ...createZoneSlice(...a),
      ...createTaskSlice(...a),
      ...createHistorySlice(...a),
      ...createSettingsSlice(...a),
    }),
    {
      name: 'focus-flow-storage-v4',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({
        currentView: state.currentView,
        activeZoneId: state.activeZoneId,
        focusedTaskId: state.focusedTaskId,
        activeHistoryId: state.activeHistoryId,
        zones: state.zones,
        tasks: state.tasks,
        currentWorkspace: state.currentWorkspace,
        historyWorkspaces: state.historyWorkspaces,
        customTemplates: state.customTemplates,
        settings: state.settings,
      }),
    }
  )
);
