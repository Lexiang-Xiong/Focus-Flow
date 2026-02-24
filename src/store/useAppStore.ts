import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Task, Zone, AppState, TaskPriority, TaskUrgency, HistoryWorkspace } from '@/types';
import { DEFAULT_SETTINGS, PREDEFINED_TEMPLATES } from '@/types';

// 定义 Store 的接口
interface AppStore extends AppState {
  // 视图与状态 Actions
  setCurrentView: (view: AppState['currentView']) => void;
  setActiveZoneId: (id: string | null) => void;
  updateSettings: (settings: Partial<AppState['settings']>) => void;

  // Zone Actions
  addZone: (name: string, color: string) => void;
  updateZone: (id: string, updates: Partial<Zone>) => void;
  deleteZone: (id: string) => void;
  reorderZones: (newOrder: Zone[]) => void;
  applyTemplate: (templateId: string) => void;
  getZoneById: (id: string) => Zone | undefined;

  // Task Actions
  addTask: (zoneId: string, title: string, description: string, priority?: TaskPriority, urgency?: TaskUrgency, parentId?: string | null) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (zoneId: string, newTasks: Task[]) => void;
  clearCompleted: (zoneId?: string) => void;
  toggleExpanded: (id: string) => void;
  toggleSubtasksCollapsed: (id: string) => void;
  moveTaskNode: (activeId: string, newParentId: string | null, targetIndex: number, zoneId: string) => void;

  // History Actions
  archiveCurrentWorkspace: (name?: string, summary?: string) => string;
  restoreFromHistory: (historyId: string) => void;
  createNewWorkspace: (name?: string, templateId?: string) => void;
  deleteHistoryWorkspace: (id: string) => void;
  renameHistoryWorkspace: (id: string, newName: string) => void;
  updateHistorySummary: (id: string, summary: string) => void;

  // Computed helpers
  getTasksByZone: (zoneId: string) => Task[];
  getRootTasks: (zoneId: string) => Task[];
  getChildTasks: (parentId: string) => Task[];
  getStats: () => { total: number; completed: number; pending: number; highPriority: number; urgent: number };
}

// 辅助函数：创建新工作区结构
const createWorkspaceData = (name = '当前工作') => ({
  id: `workspace-${Date.now()}`,
  name,
  zones: [{ id: `zone-${Date.now()}`, name: '默认', color: '#3b82f6', order: 0, createdAt: Date.now() }],
  tasks: [] as Task[],
  sessions: [],
  createdAt: Date.now(),
  lastModified: Date.now(),
});

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // 初始状态
      currentView: 'zones',
      activeZoneId: null,
      activeHistoryId: null,
      currentWorkspace: createWorkspaceData(),
      historyWorkspaces: [],
      settings: DEFAULT_SETTINGS,

      // --- Actions ---

      setCurrentView: (view) => set({ currentView: view }),
      setActiveZoneId: (id) => set({ activeZoneId: id }),
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),

      // --- Zone Logic ---
      addZone: (name, color) => set((state) => {
        const zones = state.currentWorkspace.zones;
        const maxOrder = zones.length > 0 ? Math.max(...zones.map(z => z.order)) : -1;
        const newZone: Zone = {
          id: Date.now().toString(),
          name, color, order: maxOrder + 1, createdAt: Date.now()
        };
        return {
          currentWorkspace: { ...state.currentWorkspace, zones: [...zones, newZone], lastModified: Date.now() }
        };
      }),

      updateZone: (id, updates) => set((state) => ({
        currentWorkspace: {
          ...state.currentWorkspace,
          zones: state.currentWorkspace.zones.map(z => z.id === id ? { ...z, ...updates } : z),
          lastModified: Date.now()
        }
      })),

      deleteZone: (id) => set((state) => {
        const newZones = state.currentWorkspace.zones.filter(z => z.id !== id);
        const newTasks = state.currentWorkspace.tasks.filter(t => t.zoneId !== id);

        // 如果删光了，兜底创建一个
        if (newZones.length === 0) {
           const defaultZone = { id: 'default', name: '默认', color: '#3b82f6', order: 0, createdAt: Date.now() };
           return {
             currentWorkspace: { ...state.currentWorkspace, zones: [defaultZone], tasks: newTasks, lastModified: Date.now() },
             activeZoneId: 'default'
           };
        }

        return {
          currentWorkspace: { ...state.currentWorkspace, zones: newZones, tasks: newTasks, lastModified: Date.now() },
          activeZoneId: state.activeZoneId === id ? newZones[0].id : state.activeZoneId
        };
      }),

      reorderZones: (newOrder) => set((state) => {
        // 重置 order 索引
        const updatedZones = newOrder.map((z, idx) => ({ ...z, order: idx }));
        return {
          currentWorkspace: { ...state.currentWorkspace, zones: updatedZones, lastModified: Date.now() }
        };
      }),

      applyTemplate: (templateId) => {
        const template = PREDEFINED_TEMPLATES.find(t => t.id === templateId);
        if (!template) return;
        const newZones = template.zones.map((z, i) => ({
          ...z, id: `zone-${Date.now()}-${i}`, createdAt: Date.now(), order: i
        }));
        set(state => ({
          currentWorkspace: { ...state.currentWorkspace, zones: newZones, tasks: [], lastModified: Date.now() },
          activeZoneId: newZones[0]?.id || null
        }));
      },

      getZoneById: (id) => {
        return get().currentWorkspace.zones.find(z => z.id === id);
      },

      // --- Task Logic ---

      addTask: (zoneId, title, description, priority = 'medium', urgency = 'low', parentId = null) => set((state) => {
        const tasks = state.currentWorkspace.tasks;
        // 计算 Order：如果是子任务，找同级最大；如果是根任务，找同区最大
        const siblings = tasks.filter(t =>
          parentId ? t.parentId === parentId : (t.zoneId === zoneId && !t.parentId)
        );
        const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(t => t.order)) : -1;

        const newTask: Task = {
          id: `task-${Date.now()}`,
          zoneId, parentId, title, description, priority, urgency,
          completed: false, isCollapsed: false, expanded: false,
          order: maxOrder + 1, createdAt: Date.now(), totalWorkTime: 0
        };

        return {
          currentWorkspace: { ...state.currentWorkspace, tasks: [...tasks, newTask], lastModified: Date.now() }
        };
      }),

      updateTask: (id, updates) => set((state) => ({
        currentWorkspace: {
          ...state.currentWorkspace,
          tasks: state.currentWorkspace.tasks.map(t => t.id === id ? { ...t, ...updates } : t),
          lastModified: Date.now()
        }
      })),

      // 核心：递归完成逻辑
      toggleTask: (id) => set((state) => {
        const tasks = [...state.currentWorkspace.tasks];
        const targetIndex = tasks.findIndex(t => t.id === id);
        if (targetIndex === -1) return state;

        const targetTask = tasks[targetIndex];
        const newCompleted = !targetTask.completed;
        const now = Date.now();

        // 1. 更新自身
        tasks[targetIndex] = {
          ...targetTask,
          completed: newCompleted,
          completedAt: newCompleted ? now : undefined
        };

        // 2. 向下递归：更新所有子孙
        const updateDescendants = (parentId: string, isCompleted: boolean) => {
          tasks.forEach((t, idx) => {
            if (t.parentId === parentId) {
              tasks[idx] = { ...t, completed: isCompleted, completedAt: isCompleted ? now : undefined };
              updateDescendants(t.id, isCompleted);
            }
          });
        };
        updateDescendants(id, newCompleted);

        // 3. 向上递归：检查父级状态
        let currentParentId = targetTask.parentId;
        while (currentParentId) {
          const parentIndex = tasks.findIndex(t => t.id === currentParentId);
          if (parentIndex === -1) break;

          const parent = tasks[parentIndex];
          const siblings = tasks.filter(t => t.parentId === parent.id);
          const allSiblingsCompleted = siblings.every(t => t.completed);

          if (allSiblingsCompleted && !parent.completed) {
            tasks[parentIndex] = { ...parent, completed: true, completedAt: now };
          } else if (!allSiblingsCompleted && parent.completed) {
            tasks[parentIndex] = { ...parent, completed: false, completedAt: undefined };
          } else {
            break;
          }
          currentParentId = parent.parentId;
        }

        return { currentWorkspace: { ...state.currentWorkspace, tasks, lastModified: Date.now() } };
      }),

      deleteTask: (id) => set((state) => {
        // 递归查找所有需要删除的 ID
        const getAllDescendantIds = (parentId: string, allTasks: Task[]): string[] => {
          const children = allTasks.filter(t => t.parentId === parentId);
          return children.flatMap(child => [child.id, ...getAllDescendantIds(child.id, allTasks)]);
        };

        const idsToDelete = [id, ...getAllDescendantIds(id, state.currentWorkspace.tasks)];
        return {
          currentWorkspace: {
            ...state.currentWorkspace,
            tasks: state.currentWorkspace.tasks.filter(t => !idsToDelete.includes(t.id)),
            lastModified: Date.now()
          }
        };
      }),

      reorderTasks: (_zoneId, newTasks) => set((state) => {
        const orderMap = new Map(newTasks.map((t, i) => [t.id, i]));
        const updatedTasks = state.currentWorkspace.tasks.map(t => {
          if (orderMap.has(t.id)) {
            return { ...t, order: orderMap.get(t.id)! };
          }
          return t;
        });
        return {
          currentWorkspace: { ...state.currentWorkspace, tasks: updatedTasks, lastModified: Date.now() }
        };
      }),

      clearCompleted: (zoneId?: string) => set((state) => {
        let newTasks: Task[];
        if (zoneId) {
          // 清除指定区域的已完成任务
          newTasks = state.currentWorkspace.tasks.filter(t => !(t.zoneId === zoneId && t.completed));
        } else {
          // 清除所有已完成任务
          newTasks = state.currentWorkspace.tasks.filter(t => !t.completed);
        }
        return {
          currentWorkspace: { ...state.currentWorkspace, tasks: newTasks, lastModified: Date.now() }
        };
      }),

      toggleExpanded: (id) => set((state) => ({
        currentWorkspace: {
          ...state.currentWorkspace,
          tasks: state.currentWorkspace.tasks.map(t =>
            t.id === id ? { ...t, expanded: !t.expanded } : t
          ),
          lastModified: Date.now()
        }
      })),

      toggleSubtasksCollapsed: (id) => set((state) => ({
        currentWorkspace: {
          ...state.currentWorkspace,
          tasks: state.currentWorkspace.tasks.map(t =>
            t.id === id ? { ...t, isCollapsed: !t.isCollapsed } : t
          ),
          lastModified: Date.now()
        }
      })),

      moveTaskNode: (activeId, newParentId, targetIndex, zoneId) => set((state) => {
        const allTasks = [...state.currentWorkspace.tasks];
        const activeTask = allTasks.find(t => t.id === activeId);
        if (!activeTask) return state;

        // 1. 修改父级和区域
        activeTask.parentId = newParentId;
        activeTask.zoneId = zoneId;

        // 2. 获取该父级下的所有兄弟节点，重新排序
        const siblings = allTasks
          .filter(t => t.zoneId === zoneId && t.parentId === newParentId && t.id !== activeId)
          .sort((a, b) => a.order - b.order);

        // 将当前任务插入到合适的位置
        siblings.splice(targetIndex, 0, activeTask);

        // 3. 批量更新 order
        siblings.forEach((t, idx) => {
          t.order = idx;
        });

        return { currentWorkspace: { ...state.currentWorkspace, tasks: allTasks, lastModified: Date.now() } };
      }),

      // --- Computed Helpers ---
      getTasksByZone: (zoneId) => {
        const tasks = get().currentWorkspace.tasks;
        return tasks.filter(t => t.zoneId === zoneId).sort((a, b) => a.order - b.order);
      },

      getRootTasks: (zoneId) => {
        const tasks = get().currentWorkspace.tasks;
        return tasks
          .filter(t => t.zoneId === zoneId && !t.parentId)
          .sort((a, b) => a.order - b.order);
      },

      getChildTasks: (parentId) => {
        const tasks = get().currentWorkspace.tasks;
        return tasks.filter(t => t.parentId === parentId).sort((a, b) => a.order - b.order);
      },

      getStats: () => {
        const tasks = get().currentWorkspace.tasks;
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const pending = total - completed;
        const highPriority = tasks.filter(t => t.priority === 'high' && !t.completed).length;
        const urgent = tasks.filter(t => t.urgency === 'urgent' && !t.completed).length;
        return { total, completed, pending, highPriority, urgent };
      },

      // --- History Logic ---
      archiveCurrentWorkspace: (name, summary) => {
        const historyId = `history-${Date.now()}`;
        set((state) => {
          const history: HistoryWorkspace = {
            ...state.currentWorkspace,
            id: historyId,
            name: name || state.currentWorkspace.name,
            summary: summary || `包含 ${state.currentWorkspace.zones.length} 个分区，${state.currentWorkspace.tasks.length} 个任务`,
            lastModified: Date.now(),
          };
          return {
            historyWorkspaces: [history, ...state.historyWorkspaces]
          };
        });
        return historyId;
      },

      restoreFromHistory: (historyId) => set((state) => {
        const history = state.historyWorkspaces.find(h => h.id === historyId);
        if (!history) return state;

        return {
          currentWorkspace: {
            ...history,
            id: `workspace-${Date.now()}`,
            lastModified: Date.now()
          },
          activeZoneId: history.zones[0]?.id || null,
          currentView: 'zones'
        };
      }),

      createNewWorkspace: (name, templateId) => {
        const state = get();
        // 自动存档逻辑
        if (state.currentWorkspace.tasks.length > 0) {
           get().archiveCurrentWorkspace();
        }

        let newZones = [{ id: `zone-${Date.now()}`, name: '默认', color: '#3b82f6', order: 0, createdAt: Date.now() }];

        if (templateId) {
           const template = PREDEFINED_TEMPLATES.find(t => t.id === templateId);
           if (template) {
             newZones = template.zones.map((z, i) => ({ ...z, id: `zone-${Date.now()}-${i}`, createdAt: Date.now(), order: i }));
           }
        }

        set({
          currentWorkspace: {
            id: `workspace-${Date.now()}`,
            name: name || '新工作区',
            zones: newZones,
            tasks: [],
            sessions: [],
            createdAt: Date.now(),
            lastModified: Date.now()
          },
          activeZoneId: newZones[0]?.id || null,
          currentView: 'zones'
        });
      },

      deleteHistoryWorkspace: (id) => set(state => ({
        historyWorkspaces: state.historyWorkspaces.filter(h => h.id !== id)
      })),

      renameHistoryWorkspace: (id, newName) => set(state => ({
        historyWorkspaces: state.historyWorkspaces.map(h =>
          h.id === id ? { ...h, name: newName.trim() } : h
        )
      })),

      updateHistorySummary: (id, summary) => set(state => ({
        historyWorkspaces: state.historyWorkspaces.map(h =>
          h.id === id ? { ...h, summary: summary.trim() } : h
        )
      })),
    }),
    {
      name: 'focus-flow-storage-v4', // 新的存储 key，与旧版隔离
      storage: createJSONStorage(() => localStorage),
    }
  )
);
