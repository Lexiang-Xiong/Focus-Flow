import { useState, useEffect, useCallback } from 'react';
import type { AppState, CurrentWorkspace, HistoryWorkspace, Zone, Task } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

const STORAGE_KEY = 'floating-todo-data-v3';

// 创建新的空工作区
const createNewWorkspace = (name: string = '当前工作'): CurrentWorkspace => ({
  id: `workspace-${Date.now()}`,
  name,
  zones: [
    { id: `zone-${Date.now()}`, name: '默认', color: '#3b82f6', order: 0, createdAt: Date.now() },
  ],
  tasks: [],
  sessions: [],
  createdAt: Date.now(),
  lastModified: Date.now(),
});

const defaultState: AppState = {
  currentView: 'zones',
  activeZoneId: null,
  activeHistoryId: null,
  currentWorkspace: createNewWorkspace(),
  historyWorkspaces: [],
  settings: DEFAULT_SETTINGS,
};

export function useStorage() {
  const [data, setData] = useState<AppState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with default state to ensure all fields exist
        setData({
          ...defaultState,
          ...parsed,
          currentWorkspace: {
            ...defaultState.currentWorkspace,
            ...parsed.currentWorkspace,
          },
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        });
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        console.error('Failed to save data:', error);
      }
    }
  }, [data, isLoaded]);

  // 更新当前工作区的 zones
  const updateZones = useCallback((zones: Zone[]) => {
    setData((prev) => ({
      ...prev,
      currentWorkspace: {
        ...prev.currentWorkspace,
        zones,
        lastModified: Date.now(),
      },
    }));
  }, []);

  // 更新当前工作区的 tasks
  const updateTasks = useCallback((tasks: Task[]) => {
    setData((prev) => ({
      ...prev,
      currentWorkspace: {
        ...prev.currentWorkspace,
        tasks,
        lastModified: Date.now(),
      },
    }));
  }, []);

  // 更新历史工作区列表
  const updateHistoryWorkspaces = useCallback((historyWorkspaces: HistoryWorkspace[]) => {
    setData((prev) => ({ ...prev, historyWorkspaces }));
  }, []);

  // 更新设置
  const updateSettings = useCallback((settings: Partial<AppState['settings']>) => {
    setData((prev) => ({ ...prev, settings: { ...prev.settings, ...settings } }));
  }, []);

  // 设置当前视图
  const setCurrentView = useCallback((view: AppState['currentView']) => {
    setData((prev) => ({ ...prev, currentView: view }));
  }, []);

  // 设置当前活动分区
  const setActiveZoneId = useCallback((zoneId: string | null) => {
    setData((prev) => ({ ...prev, activeZoneId: zoneId }));
  }, []);

  // 设置当前查看的历史工作区
  const setActiveHistoryId = useCallback((historyId: string | null) => {
    setData((prev) => ({ ...prev, activeHistoryId: historyId }));
  }, []);

  // 将当前工作区存入历史
  const archiveCurrentWorkspace = useCallback((name?: string, summary?: string) => {
    const historyWorkspace: HistoryWorkspace = {
      id: `history-${Date.now()}`,
      name: name || data.currentWorkspace.name,
      summary: summary || `包含 ${data.currentWorkspace.zones.length} 个分区，${data.currentWorkspace.tasks.length} 个任务`,
      createdAt: Date.now(),
      lastModified: Date.now(),
      zones: data.currentWorkspace.zones.map(z => ({ ...z })),
      tasks: data.currentWorkspace.tasks.map(t => ({ ...t })),
      sessions: data.currentWorkspace.sessions.map(s => ({ ...s })),
    };

    setData((prev) => ({
      ...prev,
      historyWorkspaces: [historyWorkspace, ...prev.historyWorkspaces],
    }));

    return historyWorkspace.id;
  }, [data.currentWorkspace]);

  // 从历史工作区恢复到当前
  const restoreFromHistory = useCallback((historyId: string) => {
    const historyWorkspace = data.historyWorkspaces.find(h => h.id === historyId);
    if (!historyWorkspace) return false;

    setData((prev) => ({
      ...prev,
      currentWorkspace: {
        id: `workspace-${Date.now()}`,
        name: historyWorkspace.name,
        zones: historyWorkspace.zones.map(z => ({ ...z })),
        tasks: historyWorkspace.tasks.map(t => ({ ...t })),
        sessions: historyWorkspace.sessions.map(s => ({ ...s })),
        createdAt: Date.now(),
        lastModified: Date.now(),
      },
      activeZoneId: historyWorkspace.zones.length > 0 ? historyWorkspace.zones[0].id : null,
      activeHistoryId: historyId,
    }));

    return true;
  }, [data.historyWorkspaces]);

  // 创建新工作区（自动存档当前）
  const createNewWorkspace = useCallback((name?: string, templateId?: string) => {
    // 先存档当前工作区（如果有任务）
    if (data.currentWorkspace.tasks.length > 0) {
      const historyWorkspace: HistoryWorkspace = {
        id: `history-${Date.now()}`,
        name: data.currentWorkspace.name || '未命名工作区',
        summary: `包含 ${data.currentWorkspace.zones.length} 个分区，${data.currentWorkspace.tasks.length} 个任务`,
        createdAt: Date.now(),
        lastModified: Date.now(),
        zones: data.currentWorkspace.zones.map(z => ({ ...z })),
        tasks: data.currentWorkspace.tasks.map(t => ({ ...t })),
        sessions: data.currentWorkspace.sessions.map(s => ({ ...s })),
      };

      setData((prev) => ({
        ...prev,
        historyWorkspaces: [historyWorkspace, ...prev.historyWorkspaces],
        currentWorkspace: {
          id: `workspace-${Date.now() + 1}`,
          name: name || '新工作区',
          zones: templateId ? [] : [{ id: `zone-${Date.now() + 1}`, name: '默认', color: '#3b82f6', order: 0, createdAt: Date.now() }],
          tasks: [],
          sessions: [],
          createdAt: Date.now(),
          lastModified: Date.now(),
        },
        activeZoneId: null,
        activeHistoryId: null,
      }));
    } else {
      // 如果没有任务，直接创建新工作区
      setData((prev) => ({
        ...prev,
        currentWorkspace: {
          id: `workspace-${Date.now()}`,
          name: name || '新工作区',
          zones: [{ id: `zone-${Date.now()}`, name: '默认', color: '#3b82f6', order: 0, createdAt: Date.now() }],
          tasks: [],
          sessions: [],
          createdAt: Date.now(),
          lastModified: Date.now(),
        },
        activeZoneId: null,
        activeHistoryId: null,
      }));
    }
  }, [data.currentWorkspace]);

  // 删除历史工作区
  const deleteHistoryWorkspace = useCallback((historyId: string) => {
    setData((prev) => ({
      ...prev,
      historyWorkspaces: prev.historyWorkspaces.filter(h => h.id !== historyId),
    }));
  }, []);

  // 重命名历史工作区
  const renameHistoryWorkspace = useCallback((historyId: string, newName: string) => {
    setData((prev) => ({
      ...prev,
      historyWorkspaces: prev.historyWorkspaces.map(h =>
        h.id === historyId ? { ...h, name: newName.trim() } : h
      ),
    }));
  }, []);

  // 更新历史工作区的摘要
  const updateHistorySummary = useCallback((historyId: string, summary: string) => {
    setData((prev) => ({
      ...prev,
      historyWorkspaces: prev.historyWorkspaces.map(h =>
        h.id === historyId ? { ...h, summary: summary.trim() } : h
      ),
    }));
  }, []);

  return {
    data,
    isLoaded,
    updateZones,
    updateTasks,
    updateSettings,
    setCurrentView,
    setActiveZoneId,
    setActiveHistoryId,
    archiveCurrentWorkspace,
    restoreFromHistory,
    createNewWorkspace,
    deleteHistoryWorkspace,
    renameHistoryWorkspace,
    updateHistorySummary,
    updateHistoryWorkspaces,
  };
}
