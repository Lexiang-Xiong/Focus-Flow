import { create, type StateCreator } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';
import { sqliteStorage, setIsHydrated, onStoreReload, resetStorageState } from '@/lib/storage-adapter';
import { persistentLog } from '@/lib/persistent-log';
import { clearDbCache } from '@/lib/db';
import { initFileMirror } from '@/lib/file-mirror';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createZoneSlice, type ZoneSlice } from './slices/zoneSlice';
import { createTaskSlice, type TaskSlice } from './slices/taskSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice';
import { createUndoSlice, type UndoSlice } from './slices/undoSlice';
import { createExecutionPlanSlice, type ExecutionPlanSlice } from './slices/executionPlanSlice';
import { DEFAULT_SETTINGS } from '@/types';

export type AppStore = UISlice & ZoneSlice & TaskSlice & HistorySlice & SettingsSlice & UndoSlice & ExecutionPlanSlice;

// 迁移旧版任务的 dailyPlanSpanIds / dailyPlanSpanOrder 字段
// v1: dailyPlanSpanIds: Record<date, string>; dailyPlanSpanOrder: Record<spanId, number>
// v2: dailyPlanSpanIds: Record<date, string[]>; dailyPlanSpanOrder: Record<date, Record<spanId, number>>
function migrateTaskSpanFields(task: Record<string, unknown>): Record<string, unknown> {
  if (!task.dailyPlanSpanIds && !task.dailyPlanSpanOrder) return task;

  const newTask = { ...task };
  const spanIdsValues = Object.values(task.dailyPlanSpanIds || {});

  // 旧版是 string -> 新版是 string[]
  if (
    task.dailyPlanSpanIds &&
    spanIdsValues.length > 0 &&
    typeof spanIdsValues[0] === 'string'
  ) {
    const oldSpanIds = task.dailyPlanSpanIds as Record<string, string>;
    const newSpanIds: Record<string, string[]> = {};
    for (const [date, spanId] of Object.entries(oldSpanIds)) {
      newSpanIds[date] = [spanId];
    }
    newTask.dailyPlanSpanIds = newSpanIds;
  }

  const spanOrderValues = Object.values(task.dailyPlanSpanOrder || {});
  // 旧版是 number -> 新版是 Record<string, number>
  if (
    task.dailyPlanSpanOrder &&
    spanOrderValues.length > 0 &&
    typeof spanOrderValues[0] === 'number'
  ) {
    const oldSpanOrder = task.dailyPlanSpanOrder as Record<string, number>;
    const newSpanOrder: Record<string, Record<string, number>> = {};
    const migratedSpanIds = (newTask.dailyPlanSpanIds || task.dailyPlanSpanIds) as Record<string, string[]> | undefined;
    if (migratedSpanIds) {
      for (const [date, spanIds] of Object.entries(migratedSpanIds)) {
        for (const spanId of spanIds) {
          if (oldSpanOrder[spanId] !== undefined) {
            newSpanOrder[date] = { ...(newSpanOrder[date] || {}), [spanId]: oldSpanOrder[spanId] };
          }
        }
      }
    }
    newTask.dailyPlanSpanOrder = newSpanOrder;
  }

  return newTask;
}

// 合并函数：确保新添加的设置字段使用默认值
// 关键：将 persistedState 定义为 unknown 匹配 Zustand 内部签名
const mergeSettings = (persistedState: unknown, currentState: AppStore): AppStore => {
  if (!persistedState) {
    console.log('[MERGE] No persisted state, using currentState');
    return currentState;
  }

  const persisted = persistedState as Record<string, unknown>;
  const persistedSettings = (persisted.settings as Record<string, unknown>) || {};
  const stateNested = persisted.state as Record<string, unknown> | undefined;

  // 调试：打印原始 persisted 数据
  console.log('[MERGE] Raw persisted:', JSON.stringify(persisted).substring(0, 500));

  const tasks = persisted.tasks || stateNested?.tasks;
  const zones = persisted.zones || stateNested?.zones;
  const planGroups = persisted.planGroups || stateNested?.planGroups;
  const dailyPlanSpans = persisted.dailyPlanSpans || stateNested?.dailyPlanSpans;

  const tasksArr = ((tasks as unknown[]) || []).map(t => migrateTaskSpanFields(t as Record<string, unknown>));
  const zonesArr = (zones as unknown[]) || [];
  const planGroupsArr = (planGroups as unknown[]) || [];
  const dailyPlanSpansArr = (dailyPlanSpans as unknown[]) || [];
  console.log('[MERGE] Extracted tasks:', tasksArr.length, 'zones:', zonesArr.length, 'planGroups:', planGroupsArr.length, 'dailyPlanSpans:', dailyPlanSpansArr.length);

  const mergedSettings = { ...DEFAULT_SETTINGS };
  Object.keys(mergedSettings).forEach((key) => {
    if (persistedSettings[key] !== undefined) {
      (mergedSettings as Record<string, unknown>)[key] = persistedSettings[key];
    }
  });
  
  // 🌍 国际化：如果用户没有设置过语言偏好，根据系统语言自动设置
  if (persistedSettings.language === undefined) {
    // 使用异步版本以支持 Tauri API
    import('@/lib/language-utils').then(({ getSystemLanguageAsync }) => {
      getSystemLanguageAsync().then((lang) => {
        console.log('[MERGE] No language preference, using system language:', lang);
        // 使用 set 更新语言设置
        useAppStore.getState().updateSettings({ language: lang });
      });
    });
    // 先使用同步版本作为初始值
    const { getSystemLanguage } = require('@/lib/language-utils');
    mergedSettings.language = getSystemLanguage();
  }

  return {
    ...currentState,
    ...persisted,
    tasks: tasksArr as any,
    zones: zonesArr as any,
    planGroups: planGroupsArr as any,
    dailyPlanSpans: dailyPlanSpansArr as any,
    settings: mergedSettings as typeof DEFAULT_SETTINGS,
  } as AppStore;
};

// 💡 关键修复1：为 storeImpl 显式标注 StateCreator<AppStore> 类型
const storeImpl: StateCreator<AppStore> = (set, get, api) => ({
  ...createUISlice(set, get, api),
  ...createZoneSlice(set, get, api),
  ...createTaskSlice(set, get, api),
  ...createHistorySlice(set, get, api),
  ...createSettingsSlice(set, get, api),
  ...createExecutionPlanSlice(set, get, api),
  ...createUndoSlice(set, get, api),
});

// 💡 关键修复2：为 persistOptions 显式标注 PersistOptions<AppStore> 类型
const persistOptions: PersistOptions<AppStore> = {
  name: 'focus-flow-storage-v4',
  storage: createJSONStorage(() => sqliteStorage),
  merge: mergeSettings,
  onRehydrateStorage: () => {
    return (state: AppStore | undefined, error: unknown) => {
      if (error) {
        console.error('[ZUSTAND] Hydration failed', error);
        persistentLog('Store', 'Hydration FAILED', 'ERROR', String(error));
      } else {
        console.log('[ZUSTAND] Hydration complete, tasks:', state?.tasks?.length);
        persistentLog('Store', 'Hydration complete', 'INFO', { tasks: state?.tasks?.length, zones: state?.zones?.length });
        setIsHydrated(true);
      }
    };
  },
  // @ts-expect-error - Zustand v5 partialize 类型定义与实际使用不匹配
  partialize: (state: AppStore) => ({
    currentView: state.currentView,
    activeZoneId: state.activeZoneId,
    focusedTaskId: state.focusedTaskId,
    activeHistoryId: state.activeHistoryId,
    zones: state.zones,
    tasks: state.tasks,
    planGroups: state.planGroups || [],
    dailyPlanSpans: state.dailyPlanSpans || [],
    currentWorkspace: state.currentWorkspace,
    historyWorkspaces: state.historyWorkspaces,
    customTemplates: state.customTemplates,
    configProfiles: state.configProfiles ||[],
    settings: state.settings,
    recurringTemplates: state.recurringTemplates ||[],
  }),
};

// 创建带有 persist 中间件的 store
export const useAppStore = create<AppStore>()(
  persist(storeImpl, persistOptions)
);

// 🚀 注册单页切换后的重新加载回调
let unregisterReload: (() => void) | null = null;

export function initStoreReloadHandler() {
  if (unregisterReload) {
    unregisterReload();
  }

  unregisterReload = onStoreReload(async () => {
    console.log('[Store] Reload callback triggered');
    persistentLog('Store', 'Reload callback triggered', 'INFO');

    try {
      resetStorageState();
      clearDbCache();

      // @ts-ignore - persist 内部 API
      const persistImpl = useAppStore.persist;

      if (persistImpl) {
        // @ts-ignore
        persistImpl.setOptions({ ...persistOptions, storage: createJSONStorage(() => sqliteStorage) });

        // 🚀 关键修复3：Zustand v5 API变化，我们只需重新触发 hydration，不再使用未知的 setState api 破环缓存
        await persistImpl.rehydrate();

        console.log('[Store] Rehydration complete');
        persistentLog('Store', 'Rehydration complete', 'INFO');
      }
    } catch (error) {
      console.error('[Store] Error during reload:', error);
      persistentLog('Store', 'Reload error', 'ERROR', String(error));
    }
  });

  console.log('[Store] Reload handler registered');
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    initStoreReloadHandler();
    // 🚀 启动任务的本地 JSON 镜像层（双向同步 + cc 可编辑）
    initFileMirror();
  }, 0);
}