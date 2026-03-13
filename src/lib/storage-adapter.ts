import type { StateStorage } from 'zustand/middleware';
import { dbGetItem, dbSetItem, dbRemoveItem } from '@/lib/db';
import { persistentLog } from './persistent-log';

// 记录应用的启动时间
// const bootTime = Date.now();
// 记录是否已完成水合
let _isHydrated = false;
// 切换锁：目录切换期间阻止所有写入
let _isSwitching = false;
// 标记是否正在进行目录切换（从 db.ts 设置）
let _isReloadingForSwitch = false;
// 🚀 关键：切换完成后跳过写入的锁（防止空状态覆盖正确数据）
let _skipWriteUntilChange = false;
// 重新加载回调函数列表
type ReloadCallback = () => void | Promise<void>;
const reloadCallbacks: ReloadCallback[] = [];

export function getIsHydrated() {
  return _isHydrated;
}

export function setIsHydrated(value: boolean, forceRehydrate: boolean = false) {
  // 如果是强制重新水合（目录切换后），需要先重置状态
  if (forceRehydrate) {
    _isHydrated = false;
  }
  _isHydrated = value;
  // hydration 完成后，清除 sessionStorage 中的备份标记
  if (value) {
    sessionStorage.removeItem('FOCUS_FLOW_BACKUP_USED');
    persistentLog('Storage', 'Hydration done, cleared backup marker', 'DEBUG');
  }
}

export function getIsSwitching() {
  return _isSwitching;
}

export function setIsSwitching(value: boolean) {
  _isSwitching = value;
}

/**
 * 设置目录切换状态（由 db.ts 调用）
 */
export function setIsReloadingForSwitch(value: boolean) {
  _isReloadingForSwitch = value;
  // [DEBUG] console.log('[Storage] _isReloadingForSwitch set to:', value);
}

/**
 * 获取目录切换状态
 */
export function getIsReloadingForSwitch() {
  return _isReloadingForSwitch;
}

/**
 * 设置切换完成后的写入跳过锁
 * 用于防止切换后 Zustand 将默认空状态写入数据库覆盖正确数据
 */
export function setSkipWriteUntilChange(value: boolean) {
  _skipWriteUntilChange = value;
  // [DEBUG] console.log('[Storage] _skipWriteUntilChange set to:', value);
}

/**
 * 获取切换完成后的写入跳过锁
 */
export function getSkipWriteUntilChange() {
  return _skipWriteUntilChange;
}

/**
 * 清除跳过写入锁，并标记用户已修改数据
 */
export function clearSkipWriteLock() {
  if (_skipWriteUntilChange) {
    // [DEBUG] console.log('[Storage] User data modified, clearing skip write lock');
    persistentLog('Storage', 'User modified data, skip lock cleared', 'INFO');
  }
  _skipWriteUntilChange = false;
}

/**
 * 注册重新加载回调
 */
export function onStoreReload(callback: ReloadCallback) {
  reloadCallbacks.push(callback);
  // 返回取消注册的函数
  return () => {
    const index = reloadCallbacks.indexOf(callback);
    if (index > -1) {
      reloadCallbacks.splice(index, 1);
    }
  };
}

/**
 * 触发 store 重新加载（目录切换时调用）
 */
export async function triggerStoreReload(): Promise<void> {
  console.log('[Storage] triggerStoreReload START, callbacks:', reloadCallbacks.length);
  persistentLog('Storage', 'triggerStoreReload called', 'INFO', { callbacks: reloadCallbacks.length });

  // 1. 重置 hydration 状态
  _isHydrated = false;
  _isSwitching = false;

  // 🚀 设置跳过写入锁，防止切换后的空状态覆盖正确数据
  _skipWriteUntilChange = true;

  // 2. 等待一小段时间确保状态重置完成
  await new Promise(resolve => setTimeout(resolve, 50));

  // 3. 通知所有监听器重新加载
  for (const callback of reloadCallbacks) {
    try {
      await callback();
    } catch (error) {
      console.error('[Storage] Error in reload callback:', error);
    }
  }

  persistentLog('Storage', 'triggerStoreReload completed', 'INFO');

  // 注意：不要在这里清除 _previousDataSnapshot
  // 它将由 getItem 在读取新数据后更新
  // _previousDataSnapshot = null;
}

/**
 * 重置存储适配器状态（切换目录时调用）
 */
export function resetStorageState() {
  _isHydrated = false;
  _isSwitching = false;
  persistentLog('Storage', 'Storage state reset', 'DEBUG');
}

// 页面卸载时重置 hydration 状态
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    _isHydrated = false;
  });
}

function logTrace(_action: string, _data: string | null, _source: string) {
  // [DEBUG] 详细追踪功能，生产环境可关闭
  // if (process.env.NODE_ENV !== 'development') return;
  // const timeSinceBoot = Date.now() - bootTime;
  // const dataSize = data ? (new Blob([data]).size / 1024).toFixed(2) + 'kb' : 'EMPTY/NULL';
  // console.log(`[STORAGE_TRACE] [${timeSinceBoot}ms] [${action}] Size: ${dataSize} | Source: ${source}`);
}

// 记录 getItem 是否曾经返回过非空数据
let _hasReadValidData = false;
// 🚀 存储从 SQLite 加载的有效数据（用于对比空状态写入）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// let _loadedValidData: string | null = null;
// 🚀 存储加载时的有效任务/区域数量
let _loadedTasksCount = 0;
let _loadedZonesCount = 0;
// 🚀 记录切换前的数据快照（用于判断数据是否"变少"）
let _previousDataSnapshot: { tasks: number; zones: number } | null = null;

// 🚀 导出函数：在切换目录前记录当前数据状态
export function recordDataSnapshotForSwitch(): void {
  _previousDataSnapshot = { tasks: _loadedTasksCount, zones: _loadedZonesCount };
  // [DEBUG] console.log('[Storage] 📸 Recorded previous data snapshot:', _previousDataSnapshot);
}

export const sqliteStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const pathFromStorage = localStorage.getItem('FOCUS_FLOW_DB_PATH');
    logTrace('GET_START', null, 'SQLite');
    const isHydrated = getIsHydrated();
    // [DEBUG] console.log(`[Storage] getItem - Key: ${name}, Hydrated: ${isHydrated}, Path: ${pathFromStorage}, HasReadValidData: ${_hasReadValidData}`);

    // 调试：打印调用栈
    // const stack = new Error().stack;
    // [DEBUG] console.log(`[Storage] getItem call stack:`, stack);

    persistentLog('Storage', 'getItem START', 'DEBUG', { key: name, hydrated: isHydrated, path: pathFromStorage });

    // === 简化：只使用 SQLite，不依赖 localStorage 备份 ===
    // 每次 getItem 都从 SQLite 读取，确保读取的是当前目录的数据库

    try {
      const sqliteValue = await dbGetItem(name);
      persistentLog('Storage', 'getItem from SQLite', 'DEBUG', { size: sqliteValue?.length });

      if (sqliteValue) {
        // 验证数据
        let tasks = 0, zones = 0;
        try {
          const parsed = JSON.parse(sqliteValue);
          tasks = parsed?.state?.tasks?.length || parsed?.tasks?.length || 0;
          zones = parsed?.state?.zones?.length || parsed?.zones?.length || 0;
          persistentLog('Storage', 'SQLite data valid', 'DEBUG', { tasks, zones });
        } catch (e) {}

        // 🚀 保存加载的有效数据，用于后续对比
        // _loadedValidData = sqliteValue;
        _loadedTasksCount = tasks;
        _loadedZonesCount = zones;
        _hasReadValidData = true;

        // 🚀 设置新目录的数据基准，这样后续写入时才能正确比较
        // 每次 getItem 都要更新快照为当前目录的数据
        console.log('[Storage] Updating data snapshot in getItem to current directory data: tasks=', tasks, 'zones=', zones);
        _previousDataSnapshot = { tasks, zones };

        // 🚀 打印日志，但不清除 skipWrite
        // skipWrite 将由 setItem 在写入有效数据后清除
        if (tasks > 0) {
          // [DEBUG] console.log(`[Storage] Valid data loaded in getItem, keeping skipWrite until setItem (tasks: ${tasks}, zones: ${zones})`);
          persistentLog('Storage', 'Valid data in getItem, skipWrite preserved', 'DEBUG', { tasks, zones });
        } else {
          // 数据为空，保持 skipWrite 锁为 true，防止空状态覆盖
          // [DEBUG] console.log(`[Storage] getItem - Empty data, keeping skipWrite lock active`);
          persistentLog('Storage', 'Empty data in SQLite, skipWrite remains', 'DEBUG');
        }

        // [DEBUG] console.log(`[Storage] getItem - Key: ${name}, Found: true, Tasks: ${tasks}, Zones: ${zones}`);
        return sqliteValue;
      }

      // [DEBUG] console.log(`[Storage] getItem - Key: ${name}, Found: false`);
      persistentLog('Storage', 'SQLite returned null', 'DEBUG');
      return null;
    } catch (error) {
      // [DEBUG] console.log(`[Storage] getItem - Key: ${name}, ERROR: ${error}`);
      persistentLog('Storage', 'SQLite ERROR', 'ERROR', String(error));
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    // 🚨 打印完整调用栈来确认触发来源
    // const stack = new Error().stack;
    // [DEBUG] console.log(`[Storage] ⚠️⚠️⚠️ setItem TRIGGERED! Key: ${name}`);
    // [DEBUG] console.log(`[Storage] ⚠️⚠️⚠️ Call stack:`, stack);

    const isSwitching = getIsSwitching();
    const isHydrated = getIsHydrated();
    const isReloading = getIsReloadingForSwitch();
    const skipWrite = getSkipWriteUntilChange();

    // 解析 value 来检查数据
    let valueTasks = 0, valueZones = 0;
    try {
      const parsed = JSON.parse(value);
      valueTasks = parsed?.state?.tasks?.length || parsed?.tasks?.length || 0;
      valueZones = parsed?.state?.zones?.length || parsed?.zones?.length || 0;
    } catch (e) {}

    logTrace('SET_TRIGGERED', value, 'Zustand');
    // [DEBUG] console.log(`[Storage] setItem - Key: ${name}, Size: ${value.length}, Tasks: ${valueTasks}, Zones: ${valueZones}, Hydrated: ${isHydrated}, Switching: ${isSwitching}, Reloading: ${isReloading}, SkipWrite: ${skipWrite}, HasReadValidData: ${_hasReadValidData}`);
    // [DEBUG] console.log(`[Storage] setItem - Value preview:`, value.substring(0, 200));
    persistentLog('Storage', 'setItem triggered', 'DEBUG', { size: value.length, tasks: valueTasks, zones: valueZones, hydrated: isHydrated, switching: isSwitching, reloading: isReloading, skipWrite, hasReadValidData: _hasReadValidData });

    // 🚨 目录切换期间拒绝所有写入（包括单页切换期间）
    if (isSwitching || isReloading) {
      // [DEBUG] console.log(`[Storage] BLOCKED - Switch/Reload lock active for key: ${name}, isSwitching: ${isSwitching}, isReloading: ${isReloading}`);
      persistentLog('Storage', 'BLOCKED - Switch/Reload lock active', 'WARN', { isSwitching, isReloading });
      return;
    }

    // 🚨 如果还没有 Hydrate 完成，阻止所有写入！
    if (!isHydrated) {
      // [DEBUG] console.log(`[Storage] BLOCKED - Not hydrated yet for key: ${name}`);
      persistentLog('Storage', 'BLOCKED - Not hydrated yet', 'WARN', { size: value.length });
      return;
    }

    // 🚀 同步点 2：检查数据是否"变少"
    // 只有当数据变少时才阻止写入，防止切换导致的数据丢失
    if (skipWrite && _previousDataSnapshot) {
      const wasTasksMore = _previousDataSnapshot.tasks > valueTasks;
      const wasZonesMore = _previousDataSnapshot.zones > valueZones;

      if (wasTasksMore || wasZonesMore) {
        // 数据变少，可能是切换导致的数据丢失，阻止写入
        console.warn(`[Storage] BLOCKED - Data would decrease! Was: ${_previousDataSnapshot.tasks} tasks, ${_previousDataSnapshot.zones} zones, Now: ${valueTasks} tasks, ${valueZones} zones`);
        return;
      } else if (valueTasks > _previousDataSnapshot.tasks || valueZones > _previousDataSnapshot.zones) {
        // 数据确实增加了，清除锁并允许写入
        console.log('[Storage] Data increased, clearing skipWrite lock');
        _skipWriteUntilChange = false;
        _previousDataSnapshot = null;
      } else {
        // 数据相等或没有变化，保持 skipWrite 锁
        console.log('[Storage] Data unchanged, keeping skipWrite lock');
      }
    } else if (skipWrite && !_previousDataSnapshot) {
      // 🚀 没有快照但 skipWrite 为 true
      // 这种情况发生在刚切换完目录、还没有读取到数据时
      // 必须阻止写入，直到读取到有效数据（由 getItem 清除锁）
      console.warn('[Storage] BLOCKED - No data snapshot yet, waiting for hydration');
      return;
    }

    // 🚨 关键检查：如果曾经读取到有效数据，但现在写入的是空数据，这可能是状态被错误覆盖
    // 只有当数据确实为空时才允许写入
    if (_hasReadValidData && valueTasks === 0 && valueZones === 0) {
      console.warn(`[Storage] ⚠️ WARNING - Was about to write empty data after valid read! Tasks: ${valueTasks}, Zones: ${valueZones}`);
      console.warn(`[Storage] ⚠️ This may indicate state corruption!`);
      // 不阻止写入，但记录警告 - 这样可以观察实际情况
    }

    // 记录保存的数据内容
    try {
      const parsed = JSON.parse(value);
      const tasks = parsed?.state?.tasks || parsed?.tasks;
      const zones = parsed?.state?.zones || parsed?.zones;
      persistentLog('Storage', 'setItem - saving data', 'INFO', { tasks: tasks?.length, zones: zones?.length });
    } catch (e) {
      // ignore
    }

    // 写入 localStorage（确保 changeDbPath 备份可以读取到正确数据）
    localStorage.setItem(name, value);
    persistentLog('Storage', 'setItem to localStorage', 'DEBUG');

    // 同时写入 SQLite
    try {
      // 写入前再次检查路径是否匹配
      const currentPath = localStorage.getItem('FOCUS_FLOW_DB_PATH');
      const dbPath = await import('@/lib/db').then(m => m.getDbPath());
      if (currentPath !== dbPath) {
        console.error(`[Storage] ⚠️ PATH MISMATCH! localStorage: ${currentPath}, getDbPath: ${dbPath}`);
        persistentLog('Storage', 'PATH MISMATCH!', 'ERROR', { localStoragePath: currentPath, dbPath });
      }

      await dbSetItem(name, value);
      persistentLog('Storage', 'setItem SUCCESS', 'DEBUG');
    } catch (error) {
      persistentLog('Storage', 'setItem SQLite ERROR', 'ERROR', String(error));
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await dbRemoveItem(name);
    } catch (error) {
      console.error('[Storage] Error removing state:', error);
    }
  },
};
