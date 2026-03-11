import { create } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';
import { sqliteStorage, setIsHydrated, onStoreReload, resetStorageState } from '@/lib/storage-adapter';
import { persistentLog } from '@/lib/persistent-log';
import { clearDbCache } from '@/lib/db';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createZoneSlice, type ZoneSlice } from './slices/zoneSlice';
import { createTaskSlice, type TaskSlice } from './slices/taskSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice';
import { createUndoSlice, type UndoSlice } from './slices/undoSlice';
import { DEFAULT_SETTINGS } from '@/types';

export type AppStore = UISlice & ZoneSlice & TaskSlice & HistorySlice & SettingsSlice & UndoSlice;

// 合并函数：确保新添加的设置字段使用默认值
// 关键：persistedState 必须优先于 currentState，否则会导致数据丢失
const mergeSettings = <T, S>(persistedState: T | undefined, currentState: S): T & S => {
  // 如果没有持久化数据，直接返回当前状态（默认状态）
  if (!persistedState) {
    console.log('[MERGE] No persisted state, using currentState');
    return currentState as T & S;
  }

  const persisted = persistedState as Record<string, unknown>;
  const persistedSettings = persisted.settings as Record<string, unknown> || {};
  const stateNested = persisted.state as Record<string, unknown> | undefined;

  // 调试：打印原始 persisted 数据
  console.log('[MERGE] Raw persisted:', JSON.stringify(persisted).substring(0, 500));

  // 处理可能的嵌套结构 { state: { tasks, zones } } 或扁平结构 { tasks, zones }
  let tasks = persisted.tasks || stateNested?.tasks;
  let zones = persisted.zones || stateNested?.zones;

  const tasksArr = tasks as unknown[];
  const zonesArr = zones as unknown[];
  console.log('[MERGE] Extracted tasks:', tasksArr?.length, 'zones:', zonesArr?.length);

  // 对每个设置字段应用默认值
  const mergedSettings = { ...DEFAULT_SETTINGS };
  Object.keys(mergedSettings).forEach((key) => {
    // 如果持久化状态中有该值，使用持久化值
    if (persistedSettings[key] !== undefined) {
      (mergedSettings as Record<string, unknown>)[key] = persistedSettings[key];
    }
  });

  // 关键修复：persisted 必须放在 currentState 之后，这样 persisted 的数据会覆盖 currentState
  const result = {
    ...(currentState as Record<string, unknown>),
    ...persisted,
    tasks: tasksArr || [],
    zones: zonesArr || [],
    settings: mergedSettings,
  } as T & S;

  const resultTyped = result as Record<string, unknown>;
  const resultTasks = resultTyped.tasks as unknown[];
  const resultZones = resultTyped.zones as unknown[];
  console.log('[MERGE] Result tasks:', resultTasks?.length, 'zones:', resultZones?.length);

  return result;
};

// 组合所有 slices
// 先创建 store 的基础实现
const storeImpl = (...a: Parameters<typeof createUISlice>) => ({
  ...createUISlice(...a),
  ...createZoneSlice(...a),
  ...createTaskSlice(...a),
  ...createHistorySlice(...a),
  ...createSettingsSlice(...a),
  ...createUndoSlice(...a),
});

// persist 配置
const persistOptions: Parameters<typeof persist>[1] = {
  name: 'focus-flow-storage-v4',
  storage: createJSONStorage(() => sqliteStorage),
  merge: mergeSettings,
  // 监控水合状态
  onRehydrateStorage: () => {
    return (state, error) => {
      if (error) {
        console.error('[ZUSTAND] Hydration failed', error);
        persistentLog('Store', 'Hydration FAILED', 'ERROR', String(error));
      } else {
        console.log('[ZUSTAND] Hydration complete, tasks:', state?.tasks?.length);
        persistentLog('Store', 'Hydration complete', 'INFO', { tasks: state?.tasks?.length, zones: state?.zones?.length });
        // 标记水合完成
        setIsHydrated(true);
      }
    };
  },
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
};

// 创建带有 persist 中间件的 store
export const useAppStore = create<AppStore>()(
  persist(storeImpl, persistOptions)
);

// 🚀 注册单页切换后的重新加载回调
let unregisterReload: (() => void) | null = null;

export function initStoreReloadHandler() {
  // 如果已经注册过，先取消注册
  if (unregisterReload) {
    unregisterReload();
  }

  // 注册新的 reload 回调
  unregisterReload = onStoreReload(async () => {
    console.log('[Store] Reload callback triggered');
    persistentLog('Store', 'Reload callback triggered', 'INFO');

    try {
      // 1. 重置存储状态
      resetStorageState();
      clearDbCache();

      // 2. 强制 Zustand 重新 hydration
      // @ts-ignore - persist 内部 API
      const persistImpl = useAppStore.persist;

      if (persistImpl) {
        // 清除当前的 persisted state
        // @ts-ignore
        persistImpl.setOptions({ ...persistOptions, storage: createJSONStorage(() => sqliteStorage) });

        // 🚀 关键修复：清除 Zustand 内部缓存，强制从数据库重新读取
        // @ts-ignore - persist 内部 API
        try {
          // 清除 storedState 缓存
          persistImpl.setState({ storedState: undefined }, true);
        } catch (e) {
          console.log('[Store] Could not clear storedState cache, trying alternative method');
        }

        // 重新触发 hydration
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

// 在模块加载时初始化 reload handler
if (typeof window !== 'undefined') {
  // 延迟执行，确保所有模块都已加载
  setTimeout(() => {
    initStoreReloadHandler();
  }, 0);
}
