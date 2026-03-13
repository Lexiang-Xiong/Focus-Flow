import Database from '@tauri-apps/plugin-sql';
import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir} from '@tauri-apps/plugin-fs';
import type { Task, CurrentWorkspace, HistoryWorkspace, Template } from '@/types';
import { setIsSwitching, setIsReloadingForSwitch } from './storage-adapter';
import { persistentLog } from './persistent-log';

const DB_FILENAME = 'focus_flow.db';
const PATH_STORAGE_KEY = 'FOCUS_FLOW_DB_PATH';

// 新增：全局唯一的会话 ID。每次页面刷新都会生成新的，用于防范跨页面的幽灵 Promise 写入。
const CURRENT_SESSION_ID = Math.random().toString(36).substring(2, 15);
console.log('[DB] New session started, ID:', CURRENT_SESSION_ID);
persistentLog('DB', 'Session started', 'INFO', { sessionId: CURRENT_SESSION_ID });

// 修复：使用 Promise 缓存，解决并发冲突
let dbPromise: Promise<Database> | null = null;
let dbInstance: Database | null = null;
// 记录当前数据库路径，用于检测路径变化
let currentDbPath: string | null = null;

/**
 * 清除数据库缓存 - 在切换目录时调用
 */
export function clearDbCache(): void {
  console.log('[DB] Clearing database cache');
  dbPromise = null;
  dbInstance = null;
  currentDbPath = null;
}

/**
 * 获取当前的数据库绝对路径（高容错版）
 */
export async function getDbPath(): Promise<string> {
  // 1. 优先读取用户自定义路径
  const customPath = localStorage.getItem(PATH_STORAGE_KEY);
  // [DEBUG] console.log('[DB] getDbPath - PATH_STORAGE_KEY value:', customPath);
  if (customPath) {
    // [DEBUG] console.log('[DB] getDbPath - Returning customPath:', customPath);
    return customPath;
  }
  // [DEBUG] console.log('[DB] getDbPath - No custom path, using fallback');

  try {
    // 2. 尝试获取系统 AppData 目录
    const appDataDirPath = await appDataDir();
    const dbPath = await join(appDataDirPath, DB_FILENAME);

    // 3. 尝试创建目录（如果因为权限报错，我们捕获它但不阻断流程）
    try {
      const dirExists = await exists(appDataDirPath);
      if (!dirExists) {
        await mkdir(appDataDirPath, { recursive: true });
      }
    } catch (fsError) {
      console.warn('[DB] FS permission warning (mkdir/exists):', fsError);
    }

    return dbPath;
  } catch (error) {
    // 4. 终极兜底：如果不在 Tauri 环境或缺少 Path 权限，返回相对路径
    console.error('[DB] Failed to resolve absolute DB path, falling back to relative:', error);
    return DB_FILENAME;
  }
}

/**
 * 更改数据库存储目录（单页切换版，不使用 reload）
 */
export async function changeDbPath(newFolder: string): Promise<void> {
  console.log('[DB] changeDbPath START - newFolder:', newFolder);
  const currentPath = await getDbPath();
  const _pathFromStorage = localStorage.getItem(PATH_STORAGE_KEY);
  console.log(`[DB] changeDbPath - From: ${currentPath}, To: ${newFolder}, Storage: ${_pathFromStorage}`);
  persistentLog('DB', 'changeDbPath START', 'INFO', { from: currentPath, to: newFolder, storageKey: _pathFromStorage });

  // 🚨 开启切换锁，阻止所有写入
  setIsSwitching(true);
  // [DEBUG] console.log('[DB] changeDbPath - Switching lock set to TRUE');

  try {
    const currentPath = await getDbPath();
    persistentLog('DB', 'Current path', 'DEBUG', { currentPath });

    let newPath = '';

    try {
      newPath = await join(newFolder, DB_FILENAME);
    } catch (e) {
      console.error('[DB] Failed to join path:', e);
      throw new Error('Failed to join path');
    }

    if (currentPath === newPath) {
      // [DEBUG] console.log('[DB] Same path, skipping');
      // 重要：即使路径相同，也需要重置切换锁！
      setIsSwitching(false);
      return;
    }

    // 注意：切换目录时不再复制数据！
    // 每个目录应该独立存储自己的数据
    // 切换目录只是切换数据库文件路径
    try {
      const newPathExists = await exists(newPath);
      // [DEBUG] console.log('[DB] newPathExists:', newPathExists);
      persistentLog('DB', 'Switching directory (no copy)', 'INFO', { newPathExists });
    } catch (e) {
      console.warn('[DB] Error checking path:', e);
    }

    // === 保存切换日志到 localStorage，便于查看 ===
    const switchLogs = JSON.parse(localStorage.getItem('SWITCH_LOGS') || '[]');
    const now = new Date().toISOString();
    switchLogs.push({
      time: now,
      action: 'BEFORE_SWITCH',
      newPath,
      message: 'About to switch directory (single-page)'
    });
    localStorage.setItem('SWITCH_LOGS', JSON.stringify(switchLogs.slice(-20)));

    // 保存新路径到 localStorage
    localStorage.setItem(PATH_STORAGE_KEY, newPath);

    // 清除数据库缓存，并显式关闭当前数据库连接！
    if (dbInstance) {
      try {
        await dbInstance.close();
        // [DEBUG] console.log('[DB] Database connection closed before switch.');
        persistentLog('DB', 'Database closed before switch', 'INFO');
      } catch (e) {
        console.error('[DB] Error closing database:', e);
      }
    }
    clearDbCache();

    // 🚀 同步点 1：先强制加载新数据库，确认完全就绪
    console.log('[DB] About to call getDb()...');
    await getDb();
    console.log('[DB] Database pre-loaded, now triggering store reload');

    // 🚀 单页切换：触发 store 重新加载，而不是 reload 页面
    // [DEBUG] console.log('[DB] Switching directory, triggering store reload...');
    persistentLog('DB', 'Triggering store reload', 'INFO', { newPath });

    // 设置切换状态
    setIsReloadingForSwitch(true);

    // 动态导入并触发应用重新加载数据
    const { triggerStoreReload } = await import('./storage-adapter');
    await triggerStoreReload();

    // 🚨 自动化测试：如果有测试状态，继续执行测试
    try {
      const { AutoTester } = await import('./auto-tester');
      AutoTester.checkAndRun();
    } catch (e) {
      // 忽略自动化测试错误
    }

    // 重置切换标记
    setIsReloadingForSwitch(false);
    // 注意：skipWrite 锁不再在这里清除
    // 而是在 storage-adapter.ts 的 getItem 中，当成功读取到有效数据后才清除
    // [DEBUG] console.log('[DB] changeDbPath completed successfully');
    persistentLog('DB', 'changeDbPath completed', 'INFO');

  } catch (error) {
    console.error('[DB] changeDbPath error:', error);
    console.warn('切换目录失败: ' + error);
    setIsReloadingForSwitch(false);
    setIsSwitching(false);
    // 注意：skipWrite 锁也不在这里清除，让 storage-adapter 处理
  }
}

/**
 * 获取数据库实例
 */
export async function getDb(): Promise<Database> {
  // 详细日志：追踪路径变化
  const dbPath = await getDbPath();
  // [DEBUG] console.log('[DB] getDb - getDbPath():', dbPath);
  // [DEBUG] console.log('[DB] getDb - currentDbPath:', currentDbPath);

  // 检查路径是否变化，如果变化则清除缓存
  if (currentDbPath !== null && currentDbPath !== dbPath) {
    // [DEBUG] console.log('[DB] Path changed from', currentDbPath, 'to', dbPath, '- clearing cache');
    clearDbCache();
  }

  if (dbPromise) {
    // [DEBUG] console.log('[DB] getDb - Returning cached promise for:', currentDbPath);
    return dbPromise;
  }

  dbPromise = (async () => {
    try {
      const dbPath = await getDbPath();
      currentDbPath = dbPath; // 记录当前路径
      // [DEBUG] console.log('[DB] Loading database from:', dbPath);

      dbInstance = await Database.load(`sqlite:${dbPath}`);
      await initializeTables(dbInstance);

      return dbInstance;
    } catch (error) {
      console.error('[DB] Failed to load database:', error);
      dbPromise = null;
      throw error;
    }
  })();

  return dbPromise;
}

// 初始化关系型表结构
async function initializeTables(db: Database): Promise<void> {
  // app_settings 表 (单行配置)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 1,
      work_duration INTEGER NOT NULL DEFAULT 1500,
      break_duration INTEGER NOT NULL DEFAULT 300,
      long_break_duration INTEGER NOT NULL DEFAULT 900,
      auto_start_break INTEGER NOT NULL DEFAULT 0,
      sound_enabled INTEGER NOT NULL DEFAULT 1,
      collapsed INTEGER NOT NULL DEFAULT 0,
      collapse_position_x REAL NOT NULL DEFAULT 100,
      collapse_position_y REAL NOT NULL DEFAULT 100,
      sort_mode TEXT NOT NULL DEFAULT 'zone',
      priority_weight REAL NOT NULL DEFAULT 0.4,
      urgency_weight REAL NOT NULL DEFAULT 0.6
    )
  `);

  // 插入默认设置（如果不存在）
  await db.execute(`
    INSERT OR IGNORE INTO app_settings (id, version) VALUES (1, 1)
  `);

  // workspaces 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_modified INTEGER NOT NULL,
      source_history_id TEXT,
      is_current INTEGER NOT NULL DEFAULT 1
    )
  `);

  // history_workspaces 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS history_workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      summary TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      last_modified INTEGER NOT NULL
    )
  `);

  // zones 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      workspace_id TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  // tasks 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      zone_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      urgency TEXT NOT NULL DEFAULT 'low',
      deadline INTEGER,
      deadline_type TEXT DEFAULT 'none',
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      expanded INTEGER NOT NULL DEFAULT 0,
      is_collapsed INTEGER NOT NULL DEFAULT 0,
      total_work_time INTEGER NOT NULL DEFAULT 0,
      own_time INTEGER NOT NULL DEFAULT 0,
      workspace_id TEXT NOT NULL,
      estimated_time,
      prevent_auto_complete INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  // pomodoro_sessions 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      completed INTEGER NOT NULL DEFAULT 0,
      workspace_id TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    )
  `);

  // custom_templates 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS custom_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT 'LayoutGrid',
      created_at INTEGER NOT NULL
    )
  `);

  // template_zones 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS template_zones (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES custom_templates(id) ON DELETE CASCADE
    )
  `);

  // store_snapshots 表（用于 Zustand 持久化）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS store_snapshots (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // 创建索引
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_zone_id ON tasks(zone_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_zones_workspace_id ON zones(workspace_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_task_id ON pomodoro_sessions(task_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON pomodoro_sessions(workspace_id)`);
}

// ========== Workspace CRUD ==========

export async function saveWorkspace(workspace: CurrentWorkspace): Promise<void> {
  const db = await getDb();

  await db.execute(
    `INSERT OR REPLACE INTO workspaces (id, name, created_at, last_modified, source_history_id, is_current)
     VALUES ($1, $2, $3, $4, $5, 1)`,
    [workspace.id, workspace.name, workspace.createdAt, workspace.lastModified, workspace.sourceHistoryId || null]
  );

  // 删除旧的 zones 和 tasks
  await db.execute(`DELETE FROM zones WHERE workspace_id = $1`, [workspace.id]);
  await db.execute(`DELETE FROM tasks WHERE workspace_id = $1`, [workspace.id]);
  await db.execute(`DELETE FROM pomodoro_sessions WHERE workspace_id = $1`, [workspace.id]);

  // 插入 zones
  for (const zone of workspace.zones) {
    await db.execute(
      `INSERT INTO zones (id, name, color, "order", created_at, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [zone.id, zone.name, zone.color, zone.order, zone.createdAt, workspace.id]
    );
  }

  // 插入 tasks
  for (const task of workspace.tasks) {
    await db.execute(
      `INSERT INTO tasks (id, zone_id, parent_id, title, description, completed, priority, urgency, "order", created_at, completed_at, expanded, is_collapsed, total_work_time, own_time, estimated_time, prevent_auto_complete, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [task.id, task.zoneId, task.parentId, task.title, task.description, task.completed ? 1 : 0, task.priority, task.urgency, task.order, task.createdAt, task.completedAt || null, task.expanded ? 1 : 0, task.isCollapsed ? 1 : 0, task.totalWorkTime, task.ownTime || 0, task.estimatedTime || null, task.preventAutoComplete ? 1 : 0, workspace.id]
    );
  }

  // 插入 sessions
  for (const session of workspace.sessions) {
    await db.execute(
      `INSERT INTO pomodoro_sessions (id, task_id, start_time, end_time, completed, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.id, session.taskId, session.startTime, session.endTime || null, session.completed ? 1 : 0, workspace.id]
    );
  }
}

export async function loadWorkspace(workspaceId: string): Promise<CurrentWorkspace | null> {
  const db = await getDb();

  const wsResult = await db.select<{ id: string; name: string; created_at: number; last_modified: number; source_history_id: string | null }[]>(
    `SELECT * FROM workspaces WHERE id = $1`,
    [workspaceId]
  );

  if (wsResult.length === 0) return null;

  const ws = wsResult[0];

  const zonesResult = await db.select<{ id: string; name: string; color: string; order: number; created_at: number }[]>(
    `SELECT * FROM zones WHERE workspace_id = $1 ORDER BY "order"`,
    [workspaceId]
  );

  const tasksResult = await db.select<{
    id: string; zone_id: string; parent_id: string | null; title: string; description: string;
    completed: number; priority: string; urgency: string; deadline: number | null; deadline_type: string;
    order: number; created_at: number;
    completed_at: number | null; expanded: number; is_collapsed: number; total_work_time: number;
    own_time: number; estimated_time: number | null; prevent_auto_complete: number;
  }[]>(
    `SELECT * FROM tasks WHERE workspace_id = $1 ORDER BY "order"`,
    [workspaceId]
  );

  const sessionsResult = await db.select<{ id: string; task_id: string; start_time: number; end_time: number | null; completed: number }[]>(
    `SELECT * FROM pomodoro_sessions WHERE workspace_id = $1`,
    [workspaceId]
  );

  return {
    id: ws.id,
    name: ws.name,
    zones: zonesResult.map(z => ({
      id: z.id,
      name: z.name,
      color: z.color,
      order: z.order,
      createdAt: z.created_at
    })),
    tasks: tasksResult.map(t => ({
      id: t.id,
      zoneId: t.zone_id,
      parentId: t.parent_id,
      title: t.title,
      description: t.description,
      completed: t.completed === 1,
      priority: t.priority as Task['priority'],
      urgency: t.urgency as Task['urgency'],
      deadline: t.deadline || null,
      deadlineType: (t.deadline_type || 'none') as Task['deadlineType'],
      order: t.order,
      createdAt: t.created_at,
      completedAt: t.completed_at || undefined,
      expanded: t.expanded === 1,
      isCollapsed: t.is_collapsed === 1,
      totalWorkTime: t.total_work_time,
      ownTime: t.own_time,
      estimatedTime: t.estimated_time || undefined,
      preventAutoComplete: t.prevent_auto_complete === 1
    })),
    sessions: sessionsResult.map(s => ({
      id: s.id,
      taskId: s.task_id,
      startTime: s.start_time,
      endTime: s.end_time || undefined,
      completed: s.completed === 1
    })),
    createdAt: ws.created_at,
    lastModified: ws.last_modified,
    sourceHistoryId: ws.source_history_id || undefined
  };
}

export async function getCurrentWorkspaceId(): Promise<string | null> {
  const db = await getDb();
  const result = await db.select<{ id: string }[]>(
    `SELECT id FROM workspaces WHERE is_current = 1 LIMIT 1`
  );
  return result.length > 0 ? result[0].id : null;
}

export async function setCurrentWorkspace(workspaceId: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE workspaces SET is_current = 0`);
  await db.execute(`UPDATE workspaces SET is_current = 1 WHERE id = $1`, [workspaceId]);
}

// ========== History Workspace CRUD ==========

export async function saveHistoryWorkspace(history: HistoryWorkspace): Promise<void> {
  const db = await getDb();

  await db.execute(
    `INSERT OR REPLACE INTO history_workspaces (id, name, summary, created_at, last_modified)
     VALUES ($1, $2, $3, $4, $5)`,
    [history.id, history.name, history.summary, history.createdAt, history.lastModified]
  );

  // 删除旧数据
  await db.execute(`DELETE FROM zones WHERE workspace_id = $1`, [history.id]);
  await db.execute(`DELETE FROM tasks WHERE workspace_id = $1`, [history.id]);
  await db.execute(`DELETE FROM pomodoro_sessions WHERE workspace_id = $1`, [history.id]);

  // 插入 zones（使用历史ID作为workspace_id）
  for (const zone of history.zones) {
    await db.execute(
      `INSERT INTO zones (id, name, color, "order", created_at, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [zone.id, zone.name, zone.color, zone.order, zone.createdAt, history.id]
    );
  }

  // 插入 tasks
  for (const task of history.tasks) {
    await db.execute(
      `INSERT INTO tasks (id, zone_id, parent_id, title, description, completed, priority, urgency, "order", created_at, completed_at, expanded, is_collapsed, total_work_time, own_time, estimated_time, prevent_auto_complete, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [task.id, task.zoneId, task.parentId, task.title, task.description, task.completed ? 1 : 0, task.priority, task.urgency, task.order, task.createdAt, task.completedAt || null, task.expanded ? 1 : 0, task.isCollapsed ? 1 : 0, task.totalWorkTime, task.ownTime || 0, task.estimatedTime || null, task.preventAutoComplete ? 1 : 0, history.id]
    );
  }

  // 插入 sessions
  for (const session of history.sessions) {
    await db.execute(
      `INSERT INTO pomodoro_sessions (id, task_id, start_time, end_time, completed, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.id, session.taskId, session.startTime, session.endTime || null, session.completed ? 1 : 0, history.id]
    );
  }
}

export async function loadAllHistoryWorkspaces(): Promise<HistoryWorkspace[]> {
  const db = await getDb();

  const historyResult = await db.select<{ id: string; name: string; summary: string; created_at: number; last_modified: number }[]>(
    `SELECT * FROM history_workspaces ORDER BY last_modified DESC`
  );

  const histories: HistoryWorkspace[] = [];

  for (const h of historyResult) {
    const zonesResult = await db.select<{ id: string; name: string; color: string; order: number; created_at: number }[]>(
      `SELECT * FROM zones WHERE workspace_id = $1 ORDER BY "order"`,
      [h.id]
    );

    const tasksResult = await db.select<{
      id: string; zone_id: string; parent_id: string | null; title: string; description: string;
      completed: number; priority: string; urgency: string; deadline: number | null; deadline_type: string;
      order: number; created_at: number;
      completed_at: number | null; expanded: number; is_collapsed: number; total_work_time: number;
      own_time: number; estimated_time: number | null; prevent_auto_complete: number;
    }[]>(
      `SELECT * FROM tasks WHERE workspace_id = $1 ORDER BY "order"`,
      [h.id]
    );

    const sessionsResult = await db.select<{ id: string; task_id: string; start_time: number; end_time: number | null; completed: number }[]>(
      `SELECT * FROM pomodoro_sessions WHERE workspace_id = $1`,
      [h.id]
    );

    histories.push({
      id: h.id,
      name: h.name,
      summary: h.summary,
      zones: zonesResult.map(z => ({
        id: z.id,
        name: z.name,
        color: z.color,
        order: z.order,
        createdAt: z.created_at
      })),
      tasks: tasksResult.map(t => ({
        id: t.id,
        zoneId: t.zone_id,
        parentId: t.parent_id,
        title: t.title,
        description: t.description,
        completed: t.completed === 1,
        priority: t.priority as Task['priority'],
        urgency: t.urgency as Task['urgency'],
        deadline: t.deadline || null,
        deadlineType: (t.deadline_type || 'none') as Task['deadlineType'],
        order: t.order,
        createdAt: t.created_at,
        completedAt: t.completed_at || undefined,
        expanded: t.expanded === 1,
        isCollapsed: t.is_collapsed === 1,
        totalWorkTime: t.total_work_time,
        ownTime: t.own_time,
        estimatedTime: t.estimated_time || undefined,
        preventAutoComplete: t.prevent_auto_complete === 1
      })),
      sessions: sessionsResult.map(s => ({
        id: s.id,
        taskId: s.task_id,
        startTime: s.start_time,
        endTime: s.end_time || undefined,
        completed: s.completed === 1
      })),
      createdAt: h.created_at,
      lastModified: h.last_modified
    });
  }

  return histories;
}

export async function deleteHistoryWorkspace(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM pomodoro_sessions WHERE workspace_id = $1`, [id]);
  await db.execute(`DELETE FROM tasks WHERE workspace_id = $1`, [id]);
  await db.execute(`DELETE FROM zones WHERE workspace_id = $1`, [id]);
  await db.execute(`DELETE FROM history_workspaces WHERE id = $1`, [id]);
}

// ========== Settings ==========

export interface AppSettingsRow {
  work_duration: number;
  break_duration: number;
  long_break_duration: number;
  auto_start_break: number;
  sound_enabled: number;
  collapsed: number;
  collapse_position_x: number;
  collapse_position_y: number;
  sort_mode: string;
  priority_weight: number;
  urgency_weight: number;
}

export async function loadSettings(): Promise<AppSettingsRow | null> {
  const db = await getDb();
  const result = await db.select<AppSettingsRow[]>(`SELECT * FROM app_settings WHERE id = 1`);
  return result.length > 0 ? result[0] : null;
}

export async function saveSettings(settings: Partial<AppSettingsRow>): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: (string | number)[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(settings)) {
    fields.push(`${key} = $${paramIndex}`);
    values.push(value as string | number);
    paramIndex++;
  }

  if (fields.length > 0) {
    await db.execute(`UPDATE app_settings SET ${fields.join(', ')} WHERE id = 1`, values);
  }
}

// ========== Templates ==========

export async function saveCustomTemplate(template: Template): Promise<void> {
  const db = await getDb();

  await db.execute(
    `INSERT OR REPLACE INTO custom_templates (id, name, description, icon, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [template.id, template.name, template.description, template.icon, Date.now()]
  );

  // 删除旧的 zones
  await db.execute(`DELETE FROM template_zones WHERE template_id = $1`, [template.id]);

  // 插入 zones
  for (const zone of template.zones) {
    await db.execute(
      `INSERT INTO template_zones (id, template_id, name, color, "order")
       VALUES ($1, $2, $3, $4, $5)`,
      [`${template.id}-${zone.order}`, template.id, zone.name, zone.color, zone.order]
    );
  }
}

export async function loadCustomTemplates(): Promise<Template[]> {
  const db = await getDb();

  const templatesResult = await db.select<{ id: string; name: string; description: string; icon: string; created_at: number }[]>(
    `SELECT * FROM custom_templates ORDER BY created_at DESC`
  );

  const templates: Template[] = [];

  for (const t of templatesResult) {
    const zonesResult = await db.select<{ id: string; name: string; color: string; order: number }[]>(
      `SELECT * FROM template_zones WHERE template_id = $1 ORDER BY "order"`,
      [t.id]
    );

    templates.push({
      id: t.id,
      name: t.name,
      description: t.description,
      icon: t.icon,
      zones: zonesResult.map(z => ({
        name: z.name,
        color: z.color,
        order: z.order
      }))
    });
  }

  return templates;
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM template_zones WHERE template_id = $1`, [id]);
  await db.execute(`DELETE FROM custom_templates WHERE id = $1`, [id]);
}

// ========== 版本管理 ==========

export async function getDbVersion(): Promise<number> {
  const db = await getDb();
  const result = await db.select<{ version: number }[]>(`SELECT version FROM app_settings WHERE id = 1`);
  return result.length > 0 ? result[0].version : 0;
}

export async function setDbVersion(version: number): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE app_settings SET version = $1 WHERE id = 1`, [version]);
}

// ========== 兼容旧版 Key-Value API（用于 Zustand 存储） ==========
// 直接在 db.ts 中实现，确保使用同一个数据库连接

// 确保 store_snapshots 表存在（向后兼容旧数据库）
async function ensureStoreSnapshotsTable(db: Database): Promise<void> {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS store_snapshots (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  } catch (e) {
    console.warn('[DB] Failed to create store_snapshots table:', e);
  }
}

export async function dbSetItem(key: string, value: string): Promise<void> {
  // 1. 捕获发起此请求的会话 ID
  const invocationSessionId = CURRENT_SESSION_ID;
  const initialPath = localStorage.getItem(PATH_STORAGE_KEY);

  // 记录详细日志
  const dbPath = await getDbPath();
  const pathFromStorage = localStorage.getItem(PATH_STORAGE_KEY);
  // [DEBUG] console.log('[DB] dbSetItem - Session ID:', invocationSessionId, 'Current Session:', CURRENT_SESSION_ID);
  // [DEBUG] console.log('[DB] dbSetItem - PATH_STORAGE_KEY:', pathFromStorage);
  // [DEBUG] console.log('[DB] dbSetItem - getDbPath():', dbPath);

  // 2. 会话级终极防御：如果执行到这里，发现它不属于当前存活的 JS 会话，必定是 reload 遗留的幽灵任务！直接阻断！
  if (invocationSessionId !== CURRENT_SESSION_ID) {
    console.warn('[DB] ABORT dbSetItem: Ghost request from previous session detected. Prevented catastrophic corruption!');
    persistentLog('DB', 'ABORT dbSetItem - Ghost request from previous session', 'ERROR', { invocationSessionId, currentSessionId: CURRENT_SESSION_ID });
    return;
  }

  // 3. 核心防御：如果等待 getDbPath 期间路径被 changeDbPath 修改了，直接阻断！
  if (initialPath !== pathFromStorage) {
    console.warn('[DB] ABORT dbSetItem: Path changed during execution. Prevented cross-directory corruption.');
    persistentLog('DB', 'ABORT dbSetItem - Path changed during execution', 'WARN', { initialPath, currentPath: pathFromStorage });
    return;
  }

  const isLargeData = value.length > 10000; // 大于 10KB 视为大数据
  let dataSummary = { size: value.length, tasks: 0, zones: 0 };
  try {
    const parsed = JSON.parse(value);
    dataSummary.tasks = parsed?.state?.tasks?.length || parsed?.tasks?.length || 0;
    dataSummary.zones = parsed?.state?.zones?.length || parsed?.zones?.length || 0;
  } catch (e) {
    // ignore parse error
  }
  // [DEBUG] console.log(`[DB] dbSetItem - Path: ${dbPath}, Key: ${key}, Size: ${dataSummary.size}, Tasks: ${dataSummary.tasks}, Zones: ${dataSummary.zones}, LargeData: ${isLargeData}`);
  persistentLog('DB', 'dbSetItem', 'DEBUG', { path: dbPath, key, ...dataSummary, isLargeData });

  const db = await getDb();

  // 确保表存在（向后兼容）
  await ensureStoreSnapshotsTable(db);

  // 再次核对会话状态，防止 getDb 的漫长等待中被页面卸载
  if (invocationSessionId !== CURRENT_SESSION_ID) {
    console.warn('[DB] ABORT dbSetItem: Session changed during getDb wait.');
    persistentLog('DB', 'ABORT dbSetItem - Session changed during getDb', 'ERROR');
    return;
  }

  // 4. 终极防御：如果 getDb() 返回的实例连接的不是初始路径，阻断！
  if (currentDbPath !== dbPath) {
    console.warn('[DB] ABORT dbSetItem: Database connection shifted. Prevented cross-directory corruption.');
    persistentLog('DB', 'ABORT dbSetItem - Connection shifted', 'WARN', { initialPath, currentDbPath, expectedPath: dbPath });
    return;
  }

  // 5. 执行写入
  const now = Date.now();
  // [DEBUG] console.log(`[DB] ⚠️⚠️⚠️ ABOUT TO WRITE - Path: ${dbPath}, Key: ${key}, Tasks: ${dataSummary.tasks}, Zones: ${dataSummary.zones}`);
  await db.execute(
    `INSERT INTO store_snapshots (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now]
  );
  // [DEBUG] console.log(`[DB] ⚠️⚠️⚠️ WRITE EXECUTED - Path: ${dbPath}`);

  // 大数据写入后等待一下，确保写入完成
  if (isLargeData) {
    // [DEBUG] console.log('[DB] Large data written, executing WAL checkpoint...');
    // 关键修复：显式执行 WAL checkpoint，确保数据从 WAL 合并到主数据库
    // 否则验证查询可能读不到 WAL 中的数据
    await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  // ===== 写入后验证数据 =====
  // 关键修复：在验证之前，再次检查路径是否一致！
  // 因为切换可能在写入后、验证前发生
  const pathBeforeVerify = await getDbPath();
  if (pathBeforeVerify !== dbPath) {
    // [DEBUG] console.warn(`[DB] 🔍 VERIFY - Path changed during write! Was: ${dbPath}, Now: ${pathBeforeVerify}. Skipping verification to avoid false positive.`);
    return; // 跳过验证，避免误报
  }

  // 这是关键：写入后立刻读取，确认数据真的写入了
  const verifyResult = await db.select<{ value: string }[]>(
    `SELECT value FROM store_snapshots WHERE key = $1`,
    [key]
  );
  if (verifyResult.length > 0) {
    const savedValue = verifyResult[0].value;
    let savedTasks = 0, savedZones = 0;
    try {
      const parsed = JSON.parse(savedValue);
      savedTasks = parsed?.state?.tasks?.length || parsed?.tasks?.length || 0;
      savedZones = parsed?.state?.zones?.length || parsed?.zones?.length || 0;
    } catch (e) {}
    // [DEBUG] console.log(`[DB] ⚠️⚠️⚠️ WRITE COMPLETE - Path: ${dbPath}, Verified Tasks: ${savedTasks}, Zones: ${savedZones}`);
    if (savedTasks !== dataSummary.tasks || savedZones !== dataSummary.zones) {
      console.error(`[DB] 🔥 DATA CORRUPTION DETECTED! Written: ${dataSummary.tasks} tasks, ${dataSummary.zones} zones, But saved: ${savedTasks} tasks, ${savedZones} zones!`);
      persistentLog('DB', 'DATA CORRUPTION!', 'ERROR', { written: dataSummary, saved: { tasks: savedTasks, zones: savedZones } });
    }
  } else {
    // [DEBUG] console.warn(`[DB] 🔍 VERIFY - No data found after write!`);
  }
  // ===== 验证结束 =====
}

export async function dbGetItem(key: string): Promise<string | null> {
  // 会话级防御：确保读取的是当前会话的数据
  const invocationSessionId = CURRENT_SESSION_ID;

  const dbPath = await getDbPath();
  const db = await getDb();

  // 会话校验
  if (invocationSessionId !== CURRENT_SESSION_ID) {
    console.warn('[DB] ABORT dbGetItem: Ghost request from previous session detected.');
    persistentLog('DB', 'ABORT dbGetItem - Ghost request', 'ERROR');
    return null;
  }

  // 确保表存在（向后兼容）
  await ensureStoreSnapshotsTable(db);

  const result = await db.select<{ value: string }[]>(
    `SELECT value FROM store_snapshots WHERE key = $1`,
    [key]
  );

  if (result.length > 0) {
    const value = result[0].value;
    let dataSummary = { size: value.length, tasks: 0, zones: 0 };
    try {
      const parsed = JSON.parse(value);
      dataSummary.tasks = parsed?.state?.tasks?.length || parsed?.tasks?.length || 0;
      dataSummary.zones = parsed?.state?.zones?.length || parsed?.zones?.length || 0;
    } catch (e) {
      // ignore parse error
    }
    console.log(`[DB] dbGetItem - Path: ${dbPath}, Key: ${key}, Found: true, Size: ${dataSummary.size}, Tasks: ${dataSummary.tasks}, Zones: ${dataSummary.zones}`);
    persistentLog('DB', 'dbGetItem found', 'DEBUG', { path: dbPath, key, ...dataSummary });
    return value;
  }

  console.log(`[DB] dbGetItem - Path: ${dbPath}, Key: ${key}, Found: false`);
  persistentLog('DB', 'dbGetItem not found', 'DEBUG', { path: dbPath, key });
  return null;
}

export async function dbRemoveItem(key: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM store_snapshots WHERE key = $1`, [key]);
}

// ========== 调试工具 ==========
// 导出函数用于显示切换日志（在控制台调用）
export function printSwitchLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem('SWITCH_LOGS') || '[]');
    if (logs.length > 0) {
      console.log('========== 历史切换日志 ==========');
      logs.forEach((log: { time: string; action: string; message: string }, index: number) => {
        console.log(`[${index + 1}] ${log.time} - ${log.action}: ${log.message}`);
      });
      console.log('==================================');
    } else {
      console.log('[DB] 无切换日志');
    }
  } catch (e) {
    console.log('[DB] 无切换日志');
  }
}

// 挂载到 window 上
if (typeof window !== 'undefined') {
  (window as unknown as { printSwitchLogs: typeof printSwitchLogs }).printSwitchLogs = printSwitchLogs;
  (window as unknown as { getDbPath: typeof getDbPath }).getDbPath = getDbPath;
}

// ========== 诊断工具 ==========
export async function diagnoseDatabase(): Promise<void> {
  console.log('========== 数据库诊断 ==========');
  const dbPath = await getDbPath();
  console.log('当前数据库路径:', dbPath);
  console.log('localStorage PATH_STORAGE_KEY:', localStorage.getItem(PATH_STORAGE_KEY));
  console.log('currentDbPath 变量:', currentDbPath);
  console.log('CURRENT_SESSION_ID:', CURRENT_SESSION_ID);

  try {
    const db = await getDb();

    // 检查表是否存在
    const tables = await db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    console.log('数据库中的表:', tables.map(t => t.name).join(', '));

    // 检查 store_snapshots 表
    const hasSnapshotsTable = tables.some(t => t.name === 'store_snapshots');
    if (hasSnapshotsTable) {
      const snapshots = await db.select<{ key: string; value: string; updated_at: number }[]>(
        'SELECT * FROM store_snapshots'
      );
      console.log('store_snapshots 表中的数据:');
      snapshots.forEach(s => {
        let tasks = 0, zones = 0;
        try {
          const parsed = JSON.parse(s.value);
          tasks = parsed?.state?.tasks?.length || parsed?.tasks?.length || 0;
          zones = parsed?.state?.zones?.length || parsed?.zones?.length || 0;
        } catch (e) {}
        console.log(`  - key: ${s.key}, tasks: ${tasks}, zones: ${zones}, updated_at: ${new Date(s.updated_at).toLocaleString()}`);
      });
    } else {
      console.warn('⚠️ store_snapshots 表不存在!');
    }
  } catch (e) {
    console.error('诊断失败:', e);
  }
  console.log('==============================');
}

// 挂载诊断函数
if (typeof window !== 'undefined') {
  (window as unknown as { diagnoseDatabase: typeof diagnoseDatabase }).diagnoseDatabase = diagnoseDatabase;
}
