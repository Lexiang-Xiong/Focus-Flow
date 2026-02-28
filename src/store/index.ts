import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { sqliteStorage } from '@/lib/storage-adapter';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createZoneSlice, type ZoneSlice } from './slices/zoneSlice';
import { createTaskSlice, type TaskSlice } from './slices/taskSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice';
import { createUndoSlice, type UndoSlice } from './slices/undoSlice';
import { DEFAULT_SETTINGS } from '@/types';

export type AppStore = UISlice & ZoneSlice & TaskSlice & HistorySlice & SettingsSlice & UndoSlice;

// 合并函数：确保新添加的设置字段使用默认值
const mergeSettings = <T, S>(persistedState: T | undefined, currentState: S): T & S => {
  const persisted = persistedState as Record<string, unknown> || {};

  const persistedSettings = persisted.settings as Record<string, unknown> || {};

  // 对每个设置字段应用默认值
  const mergedSettings = { ...DEFAULT_SETTINGS };
  Object.keys(mergedSettings).forEach((key) => {
    // 如果持久化状态中有该值，使用持久化值
    if (persistedSettings[key] !== undefined) {
      (mergedSettings as Record<string, unknown>)[key] = persistedSettings[key];
    }
  });

  return {
    ...(currentState as Record<string, unknown>),
    ...persisted,
    settings: mergedSettings,
  } as T & S;
};

// 组合所有 slices
export const useAppStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createUISlice(...a),
      ...createZoneSlice(...a),
      ...createTaskSlice(...a),
      ...createHistorySlice(...a),
      ...createSettingsSlice(...a),
      ...createUndoSlice(...a),
    }),
    {
      name: 'focus-flow-storage-v4',
      storage: createJSONStorage(() => sqliteStorage),
      merge: mergeSettings,
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
        configProfiles: state.configProfiles || [],
        settings: state.settings,
        recurringTemplates: state.recurringTemplates || [],
      }),
    }
  )
);
