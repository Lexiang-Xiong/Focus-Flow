import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Task, Zone, AppState, TaskPriority, TaskUrgency, HistoryWorkspace } from '@/types';
import { DEFAULT_SETTINGS, PREDEFINED_TEMPLATES } from '@/types';
import { sqliteStorage } from '@/lib/storage-adapter';

// 定义 Store 的接口
interface AppStore extends AppState {
  // 视图与状态 Actions
  setCurrentView: (view: AppState['currentView']) => void;
  setActiveZoneId: (id: string | null) => void;
  setFocusedTaskId: (id: string | null) => void;
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
  expandTask: (id: string) => void;
  moveTaskNode: (activeId: string, newParentId: string | null, anchorId: string | null, zoneId: string) => void;

  // History Actions
  archiveCurrentWorkspace: (name?: string, summary?: string) => string;
  quickArchiveCurrentWorkspace: () => string | null; // 快速存档，返回历史ID，如果需要覆盖则返回null
  overwriteHistoryWorkspace: (historyId: string) => void; // 覆盖指定历史记录
  restoreFromHistory: (historyId: string) => void;
  createNewWorkspace: (name?: string, templateId?: string) => void;
  deleteHistoryWorkspace: (id: string) => void;
  renameHistoryWorkspace: (id: string, newName: string) => void;
  updateHistorySummary: (id: string, summary: string) => void;
  exportHistoryToJson: (historyId: string) => string | null;
  exportAllHistoryToJson: () => string;
  importHistoryFromJson: (jsonString: string) => boolean;
  importAllHistoryFromJson: (jsonString: string) => number; // 返回导入的数量

  // Computed helpers
  getTasksByZone: (zoneId: string) => Task[];
  getRootTasks: (zoneId: string) => Task[];
  getChildTasks: (parentId: string) => Task[];
  getStats: () => { total: number; completed: number; pending: number; highPriority: number; urgent: number };

  // Timer helpers - 计时时累加时间到当前任务和所有父任务
  addWorkTime: (taskId: string, seconds: number) => void;
  getTotalWorkTime: (taskId: string) => number;
  getEstimatedTime: (taskId: string) => number;
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
      focusedTaskId: null,
      activeHistoryId: null,
      currentWorkspace: createWorkspaceData(),
      historyWorkspaces: [],
      settings: DEFAULT_SETTINGS,

      // --- Actions ---

      setCurrentView: (view) => set({ currentView: view }),
      setActiveZoneId: (id) => set({ activeZoneId: id, focusedTaskId: null }), // 切换分区时重置聚焦任务
      setFocusedTaskId: (id) => set({ focusedTaskId: id }),
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
          order: maxOrder + 1, createdAt: Date.now(), totalWorkTime: 0, ownTime: 0
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

      // 展开任务（用于添加子任务时强制展开父节点）
      expandTask: (id) => set((state) => ({
        currentWorkspace: {
          ...state.currentWorkspace,
          tasks: state.currentWorkspace.tasks.map(t =>
            t.id === id ? { ...t, isCollapsed: false } : t
          ),
          lastModified: Date.now()
        }
      })),

      // 使用锚点定位法移动任务节点
      moveTaskNode: (activeId, newParentId, anchorId, zoneId) => set((state) => {
        const allTasks = [...state.currentWorkspace.tasks];
        const activeTask = allTasks.find(t => t.id === activeId);
        if (!activeTask) return state;

        // 1. 修改父级和区域
        activeTask.parentId = newParentId;
        activeTask.zoneId = zoneId;

        // 2. 获取该父级下的所有兄弟节点
        const siblings = allTasks
          .filter(t => t.zoneId === zoneId && t.parentId === newParentId && t.id !== activeId)
          .sort((a, b) => a.order - b.order);

        // 3. 根据锚点插入任务
        if (anchorId) {
          const anchorIdx = siblings.findIndex(t => t.id === anchorId);
          if (anchorIdx !== -1) {
            siblings.splice(anchorIdx + 1, 0, activeTask);
          } else {
            siblings.push(activeTask);
          }
        } else {
          siblings.unshift(activeTask); // 没有锚点说明排第一
        }

        // 4. 批量更新 order
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

      // 计时时只更新当前任务的 ownTime（独立计时时间）
      // totalWorkTime 通过 getTotalWorkTime 动态计算
      addWorkTime: (taskId, seconds) => set((state) => {
        const tasks = [...state.currentWorkspace.tasks];

        // 只更新当前任务的 ownTime
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return state;

        tasks[taskIndex] = {
          ...tasks[taskIndex],
          ownTime: (tasks[taskIndex].ownTime || 0) + seconds
        };

        return {
          currentWorkspace: { ...state.currentWorkspace, tasks, lastModified: Date.now() }
        };
      }),

      // 动态计算任务的总工作时间（ownTime + 所有子任务的 totalWorkTime）
      getTotalWorkTime: (taskId) => {
        const tasks = get().currentWorkspace.tasks;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return 0;

        // 获取所有直接子任务
        const childTasks = tasks.filter(t => t.parentId === taskId);
        const childrenTotalTime = childTasks.reduce((sum, child) => {
          return sum + get().getTotalWorkTime(child.id);
        }, 0);

        return (task.ownTime || 0) + childrenTotalTime;
      },

      // 动态计算任务的预期时间（手动设置的值，或所有子任务预期时间之和）
      getEstimatedTime: (taskId) => {
        const tasks = get().currentWorkspace.tasks;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return 0;

        // 如果手动设置了预期时间，返回手动值
        if (task.estimatedTime !== undefined && task.estimatedTime > 0) {
          return task.estimatedTime;
        }

        // 否则计算所有子任务的预期时间之和
        const childTasks = tasks.filter(t => t.parentId === taskId);
        const childrenEstimatedTime = childTasks.reduce((sum, child) => {
          return sum + get().getEstimatedTime(child.id);
        }, 0);

        return childrenEstimatedTime;
      },

      // --- History Logic ---
      archiveCurrentWorkspace: (name, summary) => {
        const historyId = `history-${Date.now()}`;
        set((state) => {
          const history: HistoryWorkspace = {
            ...state.currentWorkspace,
            id: historyId,
            // createdAt 继承 currentWorkspace 的创建时间（工作区最初创建的时间）
            name: name || state.currentWorkspace.name,
            summary: summary || `包含 ${state.currentWorkspace.zones.length} 个分区，${state.currentWorkspace.tasks.length} 个任务`,
            lastModified: Date.now(), // 修改时间为当前存入时间
          };
          return {
            historyWorkspaces: [history, ...state.historyWorkspaces],
            // 存入历史后创建全新的空白工作区（无分区、无任务）
            currentWorkspace: {
              id: `workspace-${Date.now()}`,
              name: state.currentWorkspace.name, // 保留原名称
              zones: [],
              tasks: [],
              sessions: [],
              createdAt: Date.now(), // 新的创建时间
              lastModified: Date.now(),
              sourceHistoryId: undefined, // 清空来源记录
            },
            activeZoneId: null, // 清空当前分区
          };
        });
        return historyId;
      },

      // 快速存档：直接执行存档，不做覆盖检查
      quickArchiveCurrentWorkspace: () => {
        const now = new Date();
        const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;
        const defaultName = `存档 ${dateStr}`;
        return get().archiveCurrentWorkspace(defaultName, '');
      },

      // 覆盖指定历史记录
      overwriteHistoryWorkspace: (historyId) => {
        set((state) => {
          const existingHistory = state.historyWorkspaces.find(h => h.id === historyId);
          if (!existingHistory) return state;

          const updatedHistory: HistoryWorkspace = {
            ...state.currentWorkspace,
            id: historyId,
            name: existingHistory.name, // 保留原名称
            // createdAt 保留原创建时间
            summary: existingHistory.summary, // 保留原摘要
            lastModified: Date.now(), // 更新修改时间
          };

          return {
            historyWorkspaces: state.historyWorkspaces.map(h =>
              h.id === historyId ? updatedHistory : h
            ),
            // 覆盖历史后创建全新的空白工作区
            currentWorkspace: {
              id: `workspace-${Date.now()}`,
              name: state.currentWorkspace.name, // 保留原名称
              zones: [],
              tasks: [],
              sessions: [],
              createdAt: Date.now(), // 新的创建时间
              lastModified: Date.now(),
              sourceHistoryId: undefined, // 清空来源记录
            },
            activeZoneId: null, // 清空当前分区
          };
        });
      },

      restoreFromHistory: (historyId) => set((state) => {
        const history = state.historyWorkspaces.find(h => h.id === historyId);
        if (!history) return state;

        return {
          currentWorkspace: {
            ...history,
            id: `workspace-${Date.now()}`,
            createdAt: history.createdAt, // 继承历史的创建时间（工作区最初创建的时间）
            lastModified: Date.now(),
            sourceHistoryId: historyId // 记录来自哪个历史记录
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

      // 导出历史工作区为 JSON 字符串
      exportHistoryToJson: (historyId) => {
        const state = get();
        const history = state.historyWorkspaces.find(h => h.id === historyId);
        if (!history) return null;
        return JSON.stringify(history, null, 2);
      },

      // 从 JSON 字符串导入历史工作区
      importHistoryFromJson: (jsonString) => {
        try {
          const data = JSON.parse(jsonString);
          // 验证数据结构
          if (!data.name || !data.zones || !Array.isArray(data.zones) || !data.tasks || !Array.isArray(data.tasks)) {
            console.error('Invalid history data structure');
            return false;
          }

          // 生成新的 ID 以避免冲突
          const importedHistory: HistoryWorkspace = {
            ...data,
            id: `history-${Date.now()}`,
            createdAt: Date.now(),
            lastModified: Date.now(),
          };

          set(state => ({
            historyWorkspaces: [importedHistory, ...state.historyWorkspaces]
          }));

          return true;
        } catch (error) {
          console.error('Failed to import history:', error);
          return false;
        }
      },

      // 导出所有历史工作区为 JSON 数组
      exportAllHistoryToJson: () => {
        const state = get();
        return JSON.stringify(state.historyWorkspaces, null, 2);
      },

      // 批量导入历史工作区（支持单个或数组）
      importAllHistoryFromJson: (jsonString: string) => {
        try {
          const data = JSON.parse(jsonString);
          let histories: HistoryWorkspace[] = [];

          // 支持单个对象或数组
          if (Array.isArray(data)) {
            histories = data;
          } else if (data.name && data.zones) {
            histories = [data];
          } else {
            console.error('Invalid data format');
            return 0;
          }

          // 验证并处理每个历史记录
          const validHistories: HistoryWorkspace[] = histories.filter(h =>
            h.name && h.zones && Array.isArray(h.zones) && h.tasks && Array.isArray(h.tasks)
          ).map(h => ({
            ...h,
            id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: Date.now(),
            lastModified: Date.now(),
          }));

          if (validHistories.length === 0) {
            console.error('No valid histories found');
            return 0;
          }

          set(state => ({
            // 保持原有顺序：现有历史在前，导入的在后
            historyWorkspaces: [...state.historyWorkspaces, ...validHistories]
          }));

          return validHistories.length;
        } catch (error) {
          console.error('Failed to import histories:', error);
          return 0;
        }
      },
    }),
    {
      name: 'focus-flow-storage-v4', // 保持 Key 不变，以便适配器能找到旧数据进行迁移
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
);
