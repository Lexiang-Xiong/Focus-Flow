import { legacyDb, saveWorkspace, saveHistoryWorkspace, saveSettings, setDbVersion, getDbVersion, saveCustomTemplate as dbSaveCustomTemplate } from './db';
import type { CurrentWorkspace } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

const STORAGE_KEY_V4 = 'focus-flow-storage-v4';

export async function runMigrations(): Promise<void> {
  const currentVersion = await getDbVersion();

  if (currentVersion < 1) {
    await migrateV0ToV1();
  }
}

async function migrateV0ToV1(): Promise<void> {
  console.log('[Migration] Starting v0 -> v1 migration...');

  try {
    // 1. 从旧 store_snapshots 读取数据
    const legacyData = await legacyDb.getItem(STORAGE_KEY_V4);

    if (!legacyData) {
      console.log('[Migration] No legacy data found, creating default workspace');
      await createDefaultWorkspace();
      await setDbVersion(1);
      return;
    }

    const parsed = JSON.parse(legacyData);

    // 2. 迁移当前工作区
    if (parsed.currentWorkspace) {
      await saveWorkspace(parsed.currentWorkspace);
      console.log('[Migration] Migrated current workspace:', parsed.currentWorkspace.name);
    }

    // 3. 迁移历史工作区
    if (parsed.historyWorkspaces && Array.isArray(parsed.historyWorkspaces)) {
      for (const history of parsed.historyWorkspaces) {
        await saveHistoryWorkspace(history);
      }
      console.log('[Migration] Migrated', parsed.historyWorkspaces.length, 'history workspaces');
    }

    // 4. 迁移设置
    const settings = parsed.settings || DEFAULT_SETTINGS;
    await saveSettings({
      work_duration: settings.workDuration,
      break_duration: settings.breakDuration,
      long_break_duration: settings.longBreakDuration,
      auto_start_break: settings.autoStartBreak ? 1 : 0,
      sound_enabled: settings.soundEnabled ? 1 : 0,
      collapsed: settings.collapsed ? 1 : 0,
      collapse_position_x: settings.collapsePosition?.x ?? 100,
      collapse_position_y: settings.collapsePosition?.y ?? 100,
      sort_mode: settings.globalViewSort?.mode ?? 'zone',
      priority_weight: settings.globalViewSort?.priorityWeight ?? 0.4,
      urgency_weight: settings.globalViewSort?.urgencyWeight ?? 0.6
    });
    console.log('[Migration] Migrated settings');

    // 5. 迁移自定义模板
    if (parsed.customTemplates && Array.isArray(parsed.customTemplates)) {
      for (const template of parsed.customTemplates) {
        await dbSaveCustomTemplate(template);
      }
      console.log('[Migration] Migrated', parsed.customTemplates.length, 'custom templates');
    }

    // 6. 更新版本号
    await setDbVersion(1);
    console.log('[Migration] Migration completed successfully');
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    throw error;
  }
}

async function createDefaultWorkspace(): Promise<void> {
  const now = Date.now();
  const defaultWorkspace: CurrentWorkspace = {
    id: `ws-${now}`,
    name: '我的工作区',
    zones: [
      { id: `zone-${now}-1`, name: '工作', color: '#3b82f6', order: 0, createdAt: now },
      { id: `zone-${now}-2`, name: '学习', color: '#8b5cf6', order: 1, createdAt: now },
      { id: `zone-${now}-3`, name: '生活', color: '#22c55e', order: 2, createdAt: now }
    ],
    tasks: [],
    sessions: [],
    createdAt: now,
    lastModified: now
  };

  await saveWorkspace(defaultWorkspace);
}

// 导出设置转换为应用格式
export function convertDbSettingsToApp(settings: {
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
} | null): {
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  autoStartBreak: boolean;
  soundEnabled: boolean;
  collapsed: boolean;
  collapsePosition: { x: number; y: number };
  globalViewSort: { mode: string; priorityWeight: number; urgencyWeight: number };
} {
  if (!settings) {
    return DEFAULT_SETTINGS;
  }

  return {
    workDuration: settings.work_duration,
    breakDuration: settings.break_duration,
    longBreakDuration: settings.long_break_duration,
    autoStartBreak: settings.auto_start_break === 1,
    soundEnabled: settings.sound_enabled === 1,
    collapsed: settings.collapsed === 1,
    collapsePosition: {
      x: settings.collapse_position_x,
      y: settings.collapse_position_y
    },
    globalViewSort: {
      mode: settings.sort_mode as 'zone' | 'priority' | 'urgency' | 'weighted' | 'workTime' | 'estimatedTime' | 'timeDiff',
      priorityWeight: settings.priority_weight,
      urgencyWeight: settings.urgency_weight
    }
  };
}
