import type { StateCreator } from 'zustand';
import type { Task, TaskPriority, TaskUrgency, DeadlineType, RecurringTemplate } from '@/types';
import type { UndoSlice } from './undoSlice';
import i18n from '@/lib/i18n';

export interface TaskComputedTime {
  totalWorkTime: number;
  estimatedTime: number;
}

export interface TaskState {
  tasks: Task[];
  // 预计算的任务时间，避免渲染时递归计算
  taskComputedTimes: Record<string, TaskComputedTime>;
  // 定时任务模板
  recurringTemplates: RecurringTemplate[];
}

export interface TaskActions {
  addTask: (zoneId: string, title: string, description: string, priority?: TaskPriority, urgency?: TaskUrgency, deadline?: number | null, deadlineType?: DeadlineType, parentId?: string | null) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (zoneId: string, newTasks: Task[]) => void;
  clearCompleted: (zoneId?: string) => void;
  toggleExpanded: (id: string) => void;
  toggleSubtasksCollapsed: (id: string) => void;
  expandTask: (id: string) => void;
  moveTaskNode: (activeId: string, newParentId: string | null, anchorId: string | null, zoneId: string) => void;
  // 定时任务相关
  addRecurringTemplate: (template: Omit<RecurringTemplate, 'id' | 'lastTriggeredAt'>) => void;
  updateRecurringTemplate: (id: string, updates: Partial<RecurringTemplate>) => void;
  deleteRecurringTemplate: (id: string) => void;
  checkRecurringTasks: () => void;
}

export interface TaskComputed {
  getTasksByZone: (zoneId: string) => Task[];
  getRootTasks: (zoneId: string) => Task[];
  getChildTasks: (parentId: string) => Task[];
  getStats: () => { total: number; completed: number; pending: number; highPriority: number; urgent: number };
}

export interface TaskTimerActions {
  addWorkTime: (taskId: string, seconds: number) => void;
  getTotalWorkTime: (taskId: string) => number;
  getEstimatedTime: (taskId: string) => number;
}

export type TaskSlice = TaskState & TaskActions & TaskComputed & TaskTimerActions;

// 辅助函数：向上递归更新所有父任务的 totalWorkTime
const updateParentWorkTimes = (tasks: Task[], childId: string, addedSeconds: number): void => {
  const child = tasks.find(t => t.id === childId);
  if (!child?.parentId) return;

  const parent = tasks.find(t => t.id === child.parentId);
  if (!parent) return;

  const parentIndex = tasks.findIndex(t => t.id === parent.id);
  if (parentIndex === -1) return;

  tasks[parentIndex] = {
    ...parent,
    totalWorkTime: (parent.totalWorkTime || 0) + addedSeconds
  };

  updateParentWorkTimes(tasks, parent.id, addedSeconds);
};

// 辅助函数：递归计算任务的 totalWorkTime
const recalculateTotalWorkTime = (tasks: Task[], taskId: string): number => {
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return 0;

  const task = tasks[taskIndex];
  const childTasks = tasks.filter(t => t.parentId === taskId);

  const childrenTotalTime = childTasks.reduce((sum, child) => {
    return sum + recalculateTotalWorkTime(tasks, child.id);
  }, 0);

  const totalWorkTime = (task.ownTime || 0) + childrenTotalTime;

  tasks[taskIndex] = { ...task, totalWorkTime };

  return totalWorkTime;
};

// 辅助函数：递归计算任务的 estimatedTime
const recalculateEstimatedTime = (tasks: Task[], taskId: string): number => {
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return 0;

  const task = tasks[taskIndex];

  if (task.estimatedTime !== undefined && task.estimatedTime > 0) {
    return task.estimatedTime;
  }

  const childTasks = tasks.filter(t => t.parentId === taskId);
  const childrenEstimatedTime = childTasks.reduce((sum, child) => {
    return sum + recalculateEstimatedTime(tasks, child.id);
  }, 0);

  if (childrenEstimatedTime > 0) {
    tasks[taskIndex] = { ...task, estimatedTime: childrenEstimatedTime };
  }

  return childrenEstimatedTime;
};

// 辅助函数：更新父任务的 estimatedTime
const updateParentEstimatedTime = (tasks: Task[], parentId: string): void => {
  const parent = tasks.find(t => t.id === parentId);
  if (!parent) return;

  if (parent.estimatedTime === undefined) {
    recalculateEstimatedTime(tasks, parentId);
  }

  if (parent.parentId) {
    updateParentEstimatedTime(tasks, parent.parentId);
  }
};

// 预计算所有任务的时间
const computeAllTaskTimes = (tasks: Task[]): Record<string, TaskComputedTime> => {
  const computed: Record<string, TaskComputedTime> = {};

  // 先计算所有任务的 estimatedTime（自底向上）
  const rootTasks = tasks.filter(t => !t.parentId);
  const computeEstimated = (taskId: string): number => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return 0;

    if (task.estimatedTime !== undefined && task.estimatedTime > 0) {
      computed[taskId] = computed[taskId] || { totalWorkTime: 0, estimatedTime: 0 };
      computed[taskId].estimatedTime = task.estimatedTime;
      return task.estimatedTime;
    }

    const children = tasks.filter(t => t.parentId === taskId);
    const childrenEst = children.reduce((sum, child) => sum + computeEstimated(child.id), 0);

    computed[taskId] = computed[taskId] || { totalWorkTime: 0, estimatedTime: 0 };
    computed[taskId].estimatedTime = childrenEst;
    return childrenEst;
  };

  rootTasks.forEach(t => computeEstimated(t.id));

  // 再计算所有任务的 totalWorkTime（自底向上）
  const computeTotalWorkTime = (taskId: string): number => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return 0;

    const children = tasks.filter(t => t.parentId === taskId);
    const childrenTotal = children.reduce((sum, child) => sum + computeTotalWorkTime(child.id), 0);

    const total = (task.ownTime || 0) + childrenTotal;

    if (!computed[taskId]) {
      computed[taskId] = { totalWorkTime: 0, estimatedTime: 0 };
    }
    computed[taskId].totalWorkTime = total;

    return total;
  };

  rootTasks.forEach(t => computeTotalWorkTime(t.id));

  return computed;
};

export const createTaskSlice: StateCreator<TaskSlice & UndoSlice, [], [], TaskSlice> = (set, get) => ({
  tasks: [],
  taskComputedTimes: {},
  recurringTemplates: [],

  addTask: (zoneId, title, description, priority = 'medium', urgency = 'low', deadline = null, deadlineType = 'none', parentId = null) => {
    get().saveSnapshot?.();
    set((state) => {
      const tasks = [...state.tasks];
    const siblings = tasks.filter(t =>
      parentId ? t.parentId === parentId : (t.zoneId === zoneId && !t.parentId)
    );
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(t => t.order)) : -1;

    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      zoneId, parentId, title, description, priority, urgency,
      deadline,
      deadlineType,
      completed: false, isCollapsed: false, expanded: false,
      order: maxOrder + 1, createdAt: Date.now(), totalWorkTime: 0, ownTime: 0
    };

    const newTasks = [...tasks, newTask];

    if (parentId) {
      updateParentEstimatedTime(newTasks, parentId);
    }

    // 预计算所有任务时间
    const computedTimes = computeAllTaskTimes(newTasks);

    return { tasks: newTasks, taskComputedTimes: computedTimes };
    });
  },

  updateTask: (id, updates) => {
    get().saveSnapshot?.();
    set((state) => {
    const tasks = [...state.tasks];
    const taskIndex = tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return state;

    const task = tasks[taskIndex];
    const hasEstimatedTimeUpdate = 'estimatedTime' in updates;

    const newTasks = tasks.map(t => t.id === id ? { ...t, ...updates } : t);

    if (hasEstimatedTimeUpdate && task.parentId) {
      updateParentEstimatedTime(newTasks, task.parentId);
    }

    // 预计算所有任务时间
    const computedTimes = computeAllTaskTimes(newTasks);

    return { tasks: newTasks, taskComputedTimes: computedTimes };
    });
  },

  toggleTask: (id) => {
    get().saveSnapshot?.();
    set((state) => {
    const tasks = [...state.tasks];
    const targetIndex = tasks.findIndex(t => t.id === id);
    if (targetIndex === -1) return state;

    const targetTask = tasks[targetIndex];
    const newCompleted = !targetTask.completed;
    const now = Date.now();

    tasks[targetIndex] = {
      ...targetTask,
      completed: newCompleted,
      completedAt: newCompleted ? now : undefined
    };

    // 向下递归：更新所有子孙
    const updateDescendants = (parentId: string, isCompleted: boolean) => {
      tasks.forEach((t, idx) => {
        if (t.parentId === parentId) {
          tasks[idx] = { ...t, completed: isCompleted, completedAt: isCompleted ? now : undefined };
          updateDescendants(t.id, isCompleted);
        }
      });
    };
    updateDescendants(id, newCompleted);

    // 向上递归：更新所有祖先的完成状态
    const updateAncestors = (childId: string, isCompleted: boolean) => {
      const child = tasks.find(t => t.id === childId);
      if (!child?.parentId) return;

      const parent = tasks.find(t => t.id === child.parentId);
      if (!parent) return;

      // 检查是否所有子任务都完成
      const siblings = tasks.filter(t => t.parentId === parent.id);
      const allSiblingsCompleted = siblings.every(t => t.completed);

      // 只有当父任务没有开启"preventAutoComplete"时，才自动更新完成状态
      if (allSiblingsCompleted !== parent.completed && !parent.preventAutoComplete) {
        const parentIndex = tasks.findIndex(t => t.id === parent.id);
        tasks[parentIndex] = {
          ...parent,
          completed: allSiblingsCompleted,
          completedAt: allSiblingsCompleted ? now : undefined
        };
      }

      updateAncestors(parent.id, isCompleted);
    };
    updateAncestors(id, newCompleted);

    return { tasks };
    });
  },

  deleteTask: (id) => {
    get().saveSnapshot?.();
    set((state) => {
    const getAllDescendantIds = (parentId: string, allTasks: Task[]): string[] => {
      const children = allTasks.filter(t => t.parentId === parentId);
      return children.flatMap(child => [child.id, ...getAllDescendantIds(child.id, allTasks)]);
    };

    const idsToDelete = [id, ...getAllDescendantIds(id, state.tasks)];
    const deletedTask = state.tasks.find(t => t.id === id);
    const parentId = deletedTask?.parentId;

    const tasks = [...state.tasks];
    const newTasks = tasks.filter(t => !idsToDelete.includes(t.id));

    if (parentId) {
      updateParentEstimatedTime(newTasks, parentId);
    }

    return { tasks: newTasks };
    });
  },

  reorderTasks: (zoneId, newTasks) => set((state) => {
    const otherTasks = state.tasks.filter(t => t.zoneId !== zoneId);
    return { tasks: [...otherTasks, ...newTasks] };
  }),

  clearCompleted: (zoneId) => {
    get().saveSnapshot?.();
    set((state) => {
    const tasks = zoneId
      ? state.tasks.filter(t => !(t.zoneId === zoneId && t.completed))
      : state.tasks.filter(t => !t.completed);
    return { tasks };
    });
  },

  toggleExpanded: (id) => set((state) => ({
    tasks: state.tasks.map(t => t.id === id ? { ...t, expanded: !t.expanded } : t)
  })),

  toggleSubtasksCollapsed: (id) => set((state) => ({
    tasks: state.tasks.map(t => t.id === id ? { ...t, isCollapsed: !t.isCollapsed } : t)
  })),

  expandTask: (id) => set((state) => {
    const expandRecursive = (taskId: string, taskList: Task[]): Task[] => {
      return taskList.map(t => {
        if (t.id === taskId) {
          return { ...t, expanded: true, isCollapsed: false };
        }
        if (t.parentId === taskId) {
          // 递归展开子任务
          const expandedChild = expandRecursive(t.id, taskList);
          return expandedChild.find(ct => ct.id === t.id) || t;
        }
        return t;
      });
    };
    return { tasks: expandRecursive(id, state.tasks) };
  }),

  moveTaskNode: (activeId, newParentId, anchorId, zoneId) => set((state) => {
    const tasks = [...state.tasks];
    const activeIndex = tasks.findIndex(t => t.id === activeId);
    if (activeIndex === -1) return state;

    const activeTask = { ...tasks[activeIndex], zoneId, parentId: newParentId };

    // 获取目标路径（Zone + Parent）下除了当前任务以外的所有兄弟任务，并按顺序排列
    const siblings = tasks
      .filter(t => t.zoneId === zoneId && t.parentId === newParentId && t.id !== activeId)
      .sort((a, b) => a.order - b.order);

    // 计算插入位置：如果有锚点，插在锚点之后；否则插在最前面（索引 0）
    let insertIndex = 0;
    if (anchorId) {
      const anchorSiblingIndex = siblings.findIndex(t => t.id === anchorId);
      if (anchorSiblingIndex !== -1) {
        insertIndex = anchorSiblingIndex + 1;
      }
    }

    // 将当前任务插入到兄弟数组的正确位置
    siblings.splice(insertIndex, 0, activeTask);

    // 统一更新该路径下所有兄弟任务的 order 值
    siblings.forEach((s, idx) => {
      const taskIdx = tasks.findIndex(t => t.id === s.id);
      if (taskIdx !== -1) {
        tasks[taskIdx] = { ...tasks[taskIdx], order: idx, zoneId, parentId: newParentId };
      }
    });

    return { tasks };
  }),

  // Computed helpers
  getTasksByZone: (zoneId) => get().tasks.filter(t => t.zoneId === zoneId),

  getRootTasks: (zoneId) => get().tasks
    .filter(t => t.zoneId === zoneId && !t.parentId)
    .sort((a, b) => a.order - b.order),

  getChildTasks: (parentId) => get().tasks
    .filter(t => t.parentId === parentId)
    .sort((a, b) => a.order - b.order),

  getStats: () => {
    const tasks = get().tasks;
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const highPriority = tasks.filter(t => t.priority === 'high' && !t.completed).length;
    const urgent = tasks.filter(t => t.urgency === 'urgent' && !t.completed).length;
    return { total, completed, pending, highPriority, urgent };
  },

  // Timer helpers
  addWorkTime: (taskId, seconds) => set((state) => {
    const tasks = [...state.tasks];
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return state;

    const task = tasks[taskIndex];
    const oldTotalWorkTime = task.totalWorkTime || 0;
    const newOwnTime = (task.ownTime || 0) + seconds;

    tasks[taskIndex] = { ...task, ownTime: newOwnTime };

    recalculateTotalWorkTime(tasks, taskId);

    const newTask = tasks.find(t => t.id === taskId);
    const newTotalWorkTime = newTask?.totalWorkTime || 0;

    const delta = newTotalWorkTime - oldTotalWorkTime;
    if (delta > 0) {
      updateParentWorkTimes(tasks, taskId, delta);
    }

    // 预计算所有任务时间
    const computedTimes = computeAllTaskTimes(tasks);

    return { tasks, taskComputedTimes: computedTimes };
  }),

  getTotalWorkTime: (taskId) => {
    const task = get().tasks.find(t => t.id === taskId);
    return task?.totalWorkTime || 0;
  },

  getEstimatedTime: (taskId) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (!task) return 0;
    if (task.estimatedTime !== undefined && task.estimatedTime > 0) {
      return task.estimatedTime;
    }
    const childTasks = get().tasks.filter(t => t.parentId === taskId);
    return childTasks.reduce((sum, child) => sum + get().getEstimatedTime(child.id), 0);
  },

  // 定时任务模板相关
  addRecurringTemplate: (template) => set((state) => ({
    recurringTemplates: [
      ...(state.recurringTemplates || []),
      {
        ...template,
        id: `rec-${Date.now()}`,
        lastTriggeredAt: Date.now(),
        isActive: template.isActive ?? true,
        scope: template.scope || 'global',
      },
    ],
  })),

  updateRecurringTemplate: (id, updates) => set((state) => ({
    recurringTemplates: (state.recurringTemplates || []).map(t =>
      t.id === id ? { ...t, ...updates } : t
    ),
  })),

  deleteRecurringTemplate: (id) => set((state) => ({
    recurringTemplates: (state.recurringTemplates || []).filter(t => t.id !== id),
  })),

  checkRecurringTasks: () => set((state) => {
    const now = Date.now();
    const templates = state.recurringTemplates || [];
    let hasChanges = false;
    let newTasks = [...state.tasks];
    const newTemplates = [...templates];

    templates.forEach((tpl, index) => {
      if (!tpl.isActive) return;

      // 计算时间差 (分钟)
      const diffMinutes = (now - tpl.lastTriggeredAt) / 1000 / 60;

      if (diffMinutes >= tpl.intervalMinutes) {
        hasChanges = true;

        // 生成新任务
        const deadline = tpl.deadlineOffsetHours > 0
          ? now + (tpl.deadlineOffsetHours * 60 * 60 * 1000)
          : null;

        const newTask: Task = {
          id: `task-auto-${Date.now()}-${index}`,
          zoneId: tpl.zoneId,
          parentId: null,
          title: tpl.title,
          description: tpl.description + '\n(' + i18n.t('recurring.autoGeneratedSuffix') + ')',
          priority: tpl.priority,
          urgency: 'low',
          deadline: deadline,
          deadlineType: deadline ? 'exact' : 'none',
          completed: false,
          isCollapsed: false,
          expanded: false,
          order: 0,
          createdAt: now,
          totalWorkTime: 0,
          ownTime: 0,
          isRecurring: true,
        };

        newTasks.unshift(newTask);

        // 更新模板最后触发时间
        newTemplates[index] = { ...tpl, lastTriggeredAt: now };
      }
    });

    if (hasChanges) {
      // 预计算时间
      const computedTimes = computeAllTaskTimes(newTasks);
      return { tasks: newTasks, recurringTemplates: newTemplates, taskComputedTimes: computedTimes };
    }
    return {};
  }),
});
