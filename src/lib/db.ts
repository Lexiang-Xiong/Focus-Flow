import Database from '@tauri-apps/plugin-sql';
import type { Task, CurrentWorkspace, HistoryWorkspace, Template } from '@/types';

const DB_NAME = 'focus_flow.db';

// 单例模式保持数据库连接
let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  try {
    dbInstance = await Database.load(`sqlite:${DB_NAME}`);
    await initializeTables(dbInstance);
    return dbInstance;
  } catch (error) {
    console.error('Failed to load database:', error);
    throw error;
  }
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

// ========== 兼容旧版 Key-Value API（用于迁移） ==========

import { dbSetItem as legacyDbSetItem, dbGetItem as legacyDbGetItem, dbRemoveItem as legacyDbRemoveItem } from './db-legacy';

export const legacyDb = {
  setItem: legacyDbSetItem,
  getItem: legacyDbGetItem,
  removeItem: legacyDbRemoveItem
};
