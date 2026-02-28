import type { StateCreator } from 'zustand';
import type { HistoryWorkspace, CurrentWorkspace, Zone, Task } from '@/types';
import type { TaskSlice } from './taskSlice';
import type { ZoneSlice } from './zoneSlice';
import i18n from '@/lib/i18n';

export interface HistoryState {
  historyWorkspaces: HistoryWorkspace[];
  currentWorkspace: CurrentWorkspace;
}

export interface HistoryActions {
  archiveCurrentWorkspace: (name?: string, summary?: string) => string;
  quickArchiveCurrentWorkspace: () => string | null;
  autoSaveSnapshot: () => string | null;
  overwriteHistoryWorkspace: (historyId: string) => void;
  restoreFromHistory: (historyId: string) => void;
  createNewWorkspace: (name?: string, templateId?: string) => void;
  deleteHistoryWorkspace: (id: string) => void;
  renameHistoryWorkspace: (id: string, newName: string) => void;
  updateHistorySummary: (id: string, summary: string) => void;
  exportHistoryToJson: (historyId: string) => string | null;
  exportAllHistoryToJson: () => string;
  importHistoryFromJson: (jsonString: string) => boolean;
  importAllHistoryFromJson: (jsonString: string) => number;
  hasUnsavedChanges: () => boolean;
}

export type HistorySlice = HistoryState & HistoryActions;

// 创建新工作区结构
const createWorkspaceData = (name = i18n.t('workspace.defaultName')): CurrentWorkspace => ({
  id: `workspace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name,
  zones: [],
  tasks: [],
  sessions: [],
  createdAt: Date.now(),
  lastModified: Date.now(),
});

export const createHistorySlice: StateCreator<HistorySlice & TaskSlice & ZoneSlice, [], [], HistorySlice> = (set, get) => ({
  historyWorkspaces: [],
  currentWorkspace: createWorkspaceData(),

  archiveCurrentWorkspace: (name, summary) => {
    const historyId = `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const state = get() as unknown as { zones: Zone[]; tasks: Task[]; currentWorkspace: CurrentWorkspace; historyWorkspaces: HistoryWorkspace[] };
    const zones = state.zones;
    const tasks = state.tasks;

    const history: HistoryWorkspace = {
      ...state.currentWorkspace,
      id: historyId,
      name: name || state.currentWorkspace.name,
      zones,
      tasks,
      sessions: [],
      summary: summary || i18n.t('workspace.defaultSummary', { zones: zones.length, tasks: tasks.length }),
      lastModified: Date.now(),
    };

    set({
      historyWorkspaces: [history, ...state.historyWorkspaces],
      currentWorkspace: createWorkspaceData(state.currentWorkspace.name),
      zones: [],
      tasks: [],
    });

    return historyId;
  },

  quickArchiveCurrentWorkspace: () => {
    const state = get() as unknown as { zones: Zone[]; tasks: Task[]; currentWorkspace: CurrentWorkspace; historyWorkspaces: HistoryWorkspace[] };
    const zones = state.zones;
    const tasks = state.tasks;

    if (zones.length === 0 && tasks.length === 0) {
      return null;
    }

    const historyId = `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const history: HistoryWorkspace = {
      ...state.currentWorkspace,
      id: historyId,
      zones,
      tasks,
      sessions: [],
      summary: i18n.t('workspace.defaultSummary', { zones: zones.length, tasks: tasks.length }),
      lastModified: Date.now(),
    };

    set({
      historyWorkspaces: [history, ...state.historyWorkspaces],
      currentWorkspace: createWorkspaceData(state.currentWorkspace.name),
      zones: [],
      tasks: [],
    });

    return historyId;
  },

  // 自动保存快照 - 覆盖式更新策略
  autoSaveSnapshot: () => {
    const state = get() as unknown as { zones: Zone[]; tasks: Task[]; currentWorkspace: CurrentWorkspace; historyWorkspaces: HistoryWorkspace[] };
    const zones = state.zones;
    const tasks = state.tasks;

    if (zones.length === 0 && tasks.length === 0) {
      return null;
    }

    // 固定的自动保存ID
    const AUTO_SAVE_ID = 'auto-save-fixed-slot';

    const snapshot: HistoryWorkspace = {
      ...state.currentWorkspace,
      id: AUTO_SAVE_ID,
      name: i18n.t('workspace.autoSaveName'),
      zones: JSON.parse(JSON.stringify(zones)),
      tasks: JSON.parse(JSON.stringify(tasks)),
      sessions: [],
      summary: i18n.t('workspace.defaultSummary', { zones: zones.length, tasks: tasks.length }),
      lastModified: Date.now(),
    };

    const newHistories = [...state.historyWorkspaces];
    const existingIndex = newHistories.findIndex(h => h.id === AUTO_SAVE_ID);

    if (existingIndex !== -1) {
      // 已存在则覆盖并移到最前面
      newHistories.splice(existingIndex, 1);
      newHistories.unshift(snapshot);
    } else {
      // 不存在则插入头部
      newHistories.unshift(snapshot);
    }

    set({
      historyWorkspaces: newHistories.slice(0, 100),
    });

    return AUTO_SAVE_ID;
  },

  overwriteHistoryWorkspace: (historyId) => {
    set((state) => {
      const historyIndex = state.historyWorkspaces.findIndex(h => h.id === historyId);
      if (historyIndex === -1) return state;

      const stateWithData = state as unknown as { zones: Zone[]; tasks: Task[]; currentWorkspace: CurrentWorkspace };
      const currentZones = stateWithData.zones;
      const currentTasks = stateWithData.tasks;

      const history = state.historyWorkspaces[historyIndex];
      const overwritten: HistoryWorkspace = {
        ...history,
        zones: currentZones,
        tasks: currentTasks,
        sessions: [],
        summary: i18n.t('workspace.defaultSummary', { zones: currentZones.length, tasks: currentTasks.length }),
        lastModified: Date.now(),
      };

      const newHistory = [...state.historyWorkspaces];
      newHistory[historyIndex] = overwritten;

      return {
        historyWorkspaces: newHistory,
        currentWorkspace: { ...history, sourceHistoryId: historyId, zones: currentZones, tasks: currentTasks },
        zones: currentZones,
        tasks: currentTasks,
      };
    });
  },

  restoreFromHistory: (historyId) => {
    set((state) => {
      const history = state.historyWorkspaces.find(h => h.id === historyId);
      if (!history) return state;

      return {
        currentWorkspace: { ...history, sourceHistoryId: historyId },
        zones: history.zones,
        tasks: history.tasks,
      };
    });
  },

  createNewWorkspace: (name, _templateId) => {
    const state = get();
    const workspaceName = name || state.currentWorkspace.name;

    set({
      currentWorkspace: createWorkspaceData(workspaceName),
      zones: [],
      tasks: [],
    });
  },

  deleteHistoryWorkspace: (id) => set((state) => ({
    historyWorkspaces: state.historyWorkspaces.filter(h => h.id !== id)
  })),

  renameHistoryWorkspace: (id, newName) => set((state) => ({
    historyWorkspaces: state.historyWorkspaces.map(h =>
      h.id === id ? { ...h, name: newName, lastModified: Date.now() } : h
    )
  })),

  updateHistorySummary: (id, summary) => set((state) => ({
    historyWorkspaces: state.historyWorkspaces.map(h =>
      h.id === id ? { ...h, summary, lastModified: Date.now() } : h
    )
  })),

  exportHistoryToJson: (historyId) => {
    const history = get().historyWorkspaces.find(h => h.id === historyId);
    if (!history) return null;
    return JSON.stringify(history, null, 2);
  },

  exportAllHistoryToJson: () => {
    return JSON.stringify(get().historyWorkspaces, null, 2);
  },

  importHistoryFromJson: (jsonString) => {
    try {
      const parsed = JSON.parse(jsonString);
      // 兼容旧格式：允许 zones/tasks 为空或不存在
      if (!parsed.id || !parsed.name) {
        return false;
      }

      // 生成新的 ID 避免冲突
      const newHistory: HistoryWorkspace = {
        id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: parsed.name || i18n.t('common.unnamed'),
        summary: parsed.summary || '',
        createdAt: parsed.createdAt || Date.now(),
        lastModified: Date.now(),
        zones: parsed.zones || [],
        tasks: parsed.tasks || [],
        sessions: parsed.sessions || [],
      };

      set((state) => ({
        historyWorkspaces: [newHistory, ...state.historyWorkspaces]
      }));

      return true;
    } catch {
      return false;
    }
  },

  importAllHistoryFromJson: (jsonString) => {
    try {
      const parsed = JSON.parse(jsonString);
      // 兼容：可能是单个对象或数组
      const histories = Array.isArray(parsed) ? parsed : [parsed];
      if (!Array.isArray(histories)) return 0;

      let imported = 0;
      const newHistories = histories.map(h => {
        if (!h.id || !h.name) return null;
        imported++;
        return {
          id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: h.name || i18n.t('common.unnamed'),
          summary: h.summary || '',
          createdAt: h.createdAt || Date.now(),
          lastModified: Date.now(),
          zones: h.zones || [],
          tasks: h.tasks || [],
          sessions: h.sessions || [],
        };
      }).filter(Boolean) as HistoryWorkspace[];

      set((state) => ({
        historyWorkspaces: [...newHistories, ...state.historyWorkspaces]
      }));

      return imported;
    } catch {
      return 0;
    }
  },

  hasUnsavedChanges: () => {
    const state = get();
    // 检查当前工作区是否有内容（zones 或 tasks 存储在 store 顶层）
    return (state as unknown as { zones: unknown[]; tasks: unknown[] }).zones.length > 0 ||
           (state as unknown as { zones: unknown[]; tasks: unknown[] }).tasks.length > 0;
  },
});
