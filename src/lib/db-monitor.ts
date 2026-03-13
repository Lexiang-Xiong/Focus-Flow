/**
 * 数据变化实时监控模块
 *
 * 用于追踪：
 * 1. 数据库中数据的变化（任务数、区域数）
 * 2. 内存状态与数据库状态的一致性
 */

import { getDbPath, getDb } from './db';
import { persistentLog } from './persistent-log';

let _dbMonitorInterval: ReturnType<typeof setInterval> | null = null;
let _memoryMonitorInterval: ReturnType<typeof setInterval> | null = null;

// 数据库快照
let _lastDbData: { path: string; tasks: number; zones: number; timestamp: number } | null = null;
// 内存快照（从 Zustand store）
let _lastMemoryData: { tasks: number; zones: number; timestamp: number } | null = null;

/**
 * 从 SQLite 数据中解析任务数和区域数
 */
function parseDataCounts(value: string): { tasks: number; zones: number } {
  try {
    const parsed = JSON.parse(value);
    const tasks = parsed?.state?.tasks?.length || parsed?.tasks?.length || 0;
    const zones = parsed?.state?.zones?.length || parsed?.zones?.length || 0;
    return { tasks, zones };
  } catch {
    return { tasks: 0, zones: 0 };
  }
}

/**
 * 获取数据库当前状态
 */
async function getDbState(): Promise<{ path: string; tasks: number; zones: number } | null> {
  try {
    const dbPath = await getDbPath();
    const db = await getDb();
    const result = await db.select<{ value: string }[]>(
      'SELECT value FROM store_snapshots WHERE key = $1',
      ['focus-flow-storage-v4']
    );

    if (result.length === 0) {
      return { path: dbPath, tasks: 0, zones: 0 };
    }

    const { tasks, zones } = parseDataCounts(result[0].value);
    return { path: dbPath, tasks, zones };
  } catch (e) {
    console.log('[MONITOR-DB] Error getting db state:', e);
    return null;
  }
}

/**
 * 启动数据监控
 */
export function startDataMonitor(): void {
  if (_dbMonitorInterval) {
    console.log('[MONITOR] Already running');
    return;
  }

  console.log('[MONITOR] 🔥 Data monitor started');

  // === 监控1：数据库数据变化 ===
  _dbMonitorInterval = setInterval(async () => {
    const dbState = await getDbState();
    if (!dbState) return;

    const { path: dbPath, tasks: currentTasks, zones: currentZones } = dbState;

    if (_lastDbData && _lastDbData.path === dbPath) {
      // 检测数据减少
      if (currentTasks < _lastDbData.tasks) {
        const delta = _lastDbData.tasks - currentTasks;
        console.error(`[MONITOR-DB] 🔥🔥🔥 DATA LOSS in DB! Tasks: ${_lastDbData.tasks}→${currentTasks} (-${delta})`);
        console.error(`[MONITOR-DB] Time delta: ${Date.now() - _lastDbData.timestamp}ms`);
        console.error(`[MONITOR-DB] Current call stack:`, new Error().stack);
        persistentLog('MONITOR', 'DB DATA LOSS', 'ERROR', {
          wasTasks: _lastDbData.tasks,
          nowTasks: currentTasks,
          delta,
          timeDelta: Date.now() - _lastDbData.timestamp,
        });
      }
      if (currentZones < _lastDbData.zones) {
        const delta = _lastDbData.zones - currentZones;
        console.error(`[MONITOR-DB] 🔥🔥🔥 ZONES DATA LOSS in DB! Zones: ${_lastDbData.zones}→${currentZones} (-${delta})`);
        console.error(`[MONITOR-DB] Time delta: ${Date.now() - _lastDbData.timestamp}ms`);
      }
    }

    _lastDbData = {
      path: dbPath,
      tasks: currentTasks,
      zones: currentZones,
      timestamp: Date.now(),
    };
  }, 200); // 200ms 采样

  // === 监控2：内存 vs 数据库 一致性 ===
  _memoryMonitorInterval = setInterval(async () => {
    // 动态导入以避免循环依赖
    const { useAppStore } = await import('@/store');

    try {
      // 获取内存状态
      const storeState = useAppStore.getState();
      const memoryTasks = storeState.tasks?.length || 0;
      const memoryZones = storeState.zones?.length || 0;

      // 获取数据库状态
      const dbState = await getDbState();
      if (!dbState) return;

      const { tasks: dbTasks, zones: dbZones } = dbState;

      // 对比内存与数据库
      if (memoryTasks !== dbTasks || memoryZones !== dbZones) {
        console.warn(`[MONITOR-MEM] ⚠️ MEMORY vs DB MISMATCH! Memory: ${memoryTasks}t/${memoryZones}z, DB: ${dbTasks}t/${dbZones}z`);
        persistentLog('MONITOR', 'MEMORY vs DB MISMATCH', 'WARN', {
          memory: { tasks: memoryTasks, zones: memoryZones },
          db: { tasks: dbTasks, zones: dbZones },
        });
      }

      _lastMemoryData = {
        tasks: memoryTasks,
        zones: memoryZones,
        timestamp: Date.now(),
      };
    } catch (e) {
      console.log('[MONITOR-MEM] Error:', e);
    }
  }, 500); // 500ms 采样（较低频率）
}

/**
 * 停止数据监控
 */
export function stopDataMonitor(): void {
  if (_dbMonitorInterval) {
    clearInterval(_dbMonitorInterval);
    _dbMonitorInterval = null;
    console.log('[MONITOR] DB monitor stopped');
  }
  if (_memoryMonitorInterval) {
    clearInterval(_memoryMonitorInterval);
    _memoryMonitorInterval = null;
    console.log('[MONITOR] MEM monitor stopped');
  }
}

/**
 * 获取当前监控状态（用于调试）
 */
export function getMonitorStatus(): {
  db: typeof _lastDbData;
  memory: typeof _lastMemoryData;
  running: boolean;
} {
  return {
    db: _lastDbData,
    memory: _lastMemoryData,
    running: _dbMonitorInterval !== null,
  };
}

/**
 * 手动触发一次数据检查（用于调试）
 */
export async function checkDataNow(): Promise<void> {
  console.log('[MONITOR] Manual check triggered');
  const dbState = await getDbState();
  if (dbState) {
    console.log('[MONITOR] Current DB state:', dbState);
  }

  const { useAppStore } = await import('@/store');
  const storeState = useAppStore.getState();
  console.log('[MONITOR] Current Memory state:', {
    tasks: storeState.tasks?.length || 0,
    zones: storeState.zones?.length || 0,
  });
}

// 挂载到 window 用于调试
if (typeof window !== 'undefined') {
  (window as unknown as { startDataMonitor: typeof startDataMonitor; stopDataMonitor: typeof stopDataMonitor; checkDataNow: typeof checkDataNow; getMonitorStatus: typeof getMonitorStatus }).startDataMonitor = startDataMonitor;
  (window as unknown as { startDataMonitor: typeof startDataMonitor; stopDataMonitor: typeof stopDataMonitor; checkDataNow: typeof checkDataNow; getMonitorStatus: typeof getMonitorStatus }).stopDataMonitor = stopDataMonitor;
  (window as unknown as { startDataMonitor: typeof startDataMonitor; stopDataMonitor: typeof stopDataMonitor; checkDataNow: typeof checkDataNow; getMonitorStatus: typeof getMonitorStatus }).checkDataNow = checkDataNow;
  (window as unknown as { startDataMonitor: typeof startDataMonitor; stopDataMonitor: typeof stopDataMonitor; checkDataNow: typeof checkDataNow; getMonitorStatus: typeof getMonitorStatus }).getMonitorStatus = getMonitorStatus;
}
