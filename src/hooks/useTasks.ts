import { useCallback, useMemo } from 'react';
import type { Task, TaskPriority, TaskUrgency } from '@/types';

export function useTasks(tasks: Task[], onUpdateTasks: (tasks: Task[]) => void) {
  // Get all tasks sorted
  const allTasks = useMemo(() => {
    return [...tasks].sort((a, b) => a.order - b.order);
  }, [tasks]);

  // Get tasks for a specific zone
  const getTasksByZone = useCallback((zoneId: string) => {
    return tasks
      .filter((t) => t.zoneId === zoneId)
      .sort((a, b) => a.order - b.order);
  }, [tasks]);

  // Get root tasks (no parent) for a zone
  const getRootTasks = useCallback((zoneId: string) => {
    return tasks
      .filter((t) => t.zoneId === zoneId && (t.parentId === null || t.parentId === undefined))
      .sort((a, b) => a.order - b.order);
  }, [tasks]);

  // Get child tasks for a specific parent
  const getChildTasks = useCallback((parentId: string) => {
    return tasks
      .filter((t) => t.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  }, [tasks]);

  // Get all descendants (recursive)
  const getAllDescendants = useCallback((parentId: string): Task[] => {
    const children = tasks.filter((t) => t.parentId === parentId);
    let descendants: Task[] = [...children];
    children.forEach((child) => {
      descendants = [...descendants, ...getAllDescendants(child.id)];
    });
    return descendants;
  }, [tasks]);

  // Check if task has children
  const hasChildren = useCallback((taskId: string) => {
    return tasks.some((t) => t.parentId === taskId);
  }, [tasks]);

  // Get incomplete tasks
  const incompleteTasks = useMemo(() => {
    return tasks.filter((t) => !t.completed);
  }, [tasks]);

  // Get completed tasks
  const completedTasks = useMemo(() => {
    return tasks.filter((t) => t.completed);
  }, [tasks]);

  // Add a new task
  const addTask = useCallback((
    zoneId: string,
    title: string,
    description: string = '',
    priority: TaskPriority = 'medium',
    urgency: TaskUrgency = 'low',
    parentId: string | null = null
  ) => {
    // Get tasks in the same zone and parent
    const siblingTasks = parentId
      ? getChildTasks(parentId)
      : getRootTasks(zoneId);
    const maxOrder = siblingTasks.length > 0 ? Math.max(...siblingTasks.map((t) => t.order)) : -1;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      zoneId,
      parentId,
      isCollapsed: true,
      title: title.trim(),
      description: description.trim(),
      completed: false,
      priority,
      urgency,
      order: maxOrder + 1,
      createdAt: Date.now(),
      expanded: false,
      totalWorkTime: 0,
    };
    onUpdateTasks([...tasks, newTask]);
    return newTask.id;
  }, [tasks, getRootTasks, getChildTasks, onUpdateTasks]);

  // Helper: Check and update parent completion status (recursive upward)
  const checkParentCompletion = useCallback((currentTasks: Task[], parentId: string): Task[] => {
    const parent = currentTasks.find((t) => t.id === parentId);
    if (!parent) return currentTasks;

    const siblings = currentTasks.filter((t) => t.parentId === parentId);
    const allSiblingsCompleted = siblings.every((t) => t.completed);

    if (allSiblingsCompleted && !parent.completed) {
      // All children completed, mark parent as completed
      let updatedTasks = currentTasks.map((t) =>
        t.id === parentId ? { ...t, completed: true, completedAt: Date.now() } : t
      );
      // Recursively check parent's parent
      if (parent.parentId) {
        updatedTasks = checkParentCompletion(updatedTasks, parent.parentId);
      }
      return updatedTasks;
    } else if (!allSiblingsCompleted && parent.completed) {
      // Some children are now incomplete, uncheck parent
      let updatedTasks = currentTasks.map((t) =>
        t.id === parentId ? { ...t, completed: false, completedAt: undefined } : t
      );
      // Recursively uncheck parent's parent
      if (parent.parentId) {
        updatedTasks = checkParentCompletion(updatedTasks, parent.parentId);
      }
      return updatedTasks;
    }
    return currentTasks;
  }, []);

  // Helper: Mark all descendants (recursive downward)
  const markDescendants = useCallback((currentTasks: Task[], parentId: string, completed: boolean): Task[] => {
    const children = currentTasks.filter((t) => t.parentId === parentId);
    let updatedTasks = currentTasks.map((t) => {
      if (t.parentId === parentId) {
        return {
          ...t,
          completed,
          completedAt: completed ? Date.now() : undefined,
        };
      }
      return t;
    });

    // Recursively update children
    children.forEach((child) => {
      updatedTasks = markDescendants(updatedTasks, child.id, completed);
    });

    return updatedTasks;
  }, []);

  // Toggle task completion
  const toggleTask = useCallback((id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const newCompleted = !task.completed;
    let updatedTasks = tasks.map((t) =>
      t.id === id
        ? { ...t, completed: newCompleted, completedAt: newCompleted ? Date.now() : undefined }
        : t
    );

    // Downward: If completing parent, complete all children
    if (newCompleted) {
      updatedTasks = markDescendants(updatedTasks, id, true);
    } else {
      // If uncompleting, also uncomplete all children
      updatedTasks = markDescendants(updatedTasks, id, false);
    }

    // Upward: Check parent completion status
    if (task.parentId) {
      updatedTasks = checkParentCompletion(updatedTasks, task.parentId);
    }

    onUpdateTasks(updatedTasks);
  }, [tasks, markDescendants, checkParentCompletion, onUpdateTasks]);

  // Delete a task (cascade delete)
  const deleteTask = useCallback((id: string) => {
    // Get all descendants to delete
    const idsToDelete = [id, ...getAllDescendants(id).map((t) => t.id)];
    onUpdateTasks(tasks.filter((task) => !idsToDelete.includes(task.id)));
  }, [tasks, getAllDescendants, onUpdateTasks]);

  // Update task
  const updateTask = useCallback((id: string, updates: Partial<Omit<Task, 'id'>>) => {
    onUpdateTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      )
    );
  }, [tasks, onUpdateTasks]);

  // Toggle task expanded state
  const toggleExpanded = useCallback((id: string) => {
    onUpdateTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, expanded: !task.expanded } : task
      )
    );
  }, [tasks, onUpdateTasks]);

  // Toggle subtask collapsed state
  const toggleSubtasksCollapsed = useCallback((id: string) => {
    onUpdateTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, isCollapsed: !task.isCollapsed } : task
      )
    );
  }, [tasks, onUpdateTasks]);

  // Set task priority
  const setTaskPriority = useCallback((id: string, priority: TaskPriority) => {
    onUpdateTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, priority } : task
      )
    );
  }, [tasks, onUpdateTasks]);

  // Set task urgency
  const setTaskUrgency = useCallback((id: string, urgency: TaskUrgency) => {
    onUpdateTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, urgency } : task
      )
    );
  }, [tasks, onUpdateTasks]);

  // Move task to different zone
  const moveTaskToZone = useCallback((taskId: string, newZoneId: string) => {
    const targetZoneTasks = getTasksByZone(newZoneId);
    const maxOrder = targetZoneTasks.length > 0 ? Math.max(...targetZoneTasks.map((t) => t.order)) : -1;

    onUpdateTasks(
      tasks.map((task) =>
        task.id === taskId ? { ...task, zoneId: newZoneId, order: maxOrder + 1 } : task
      )
    );
  }, [tasks, getTasksByZone, onUpdateTasks]);

  // Reorder tasks within a zone (Safe Version - preserves all tasks)
  const reorderTasks = useCallback((_zoneId: string, newOrder: Task[]) => {
    // 创建一个 ID 到新 Order 的映射表
    const newOrderMap = new Map(newOrder.map((t, index) => [t.id, index]));

    // 遍历所有任务，只修改在映射表中的任务的 order，其余原样保留
    const updatedTasks = tasks.map(t => {
      if (newOrderMap.has(t.id)) {
        return { ...t, order: newOrderMap.get(t.id)! };
      }
      return t;
    });

    onUpdateTasks(updatedTasks);
  }, [tasks, onUpdateTasks]);

  // Get path for breadcrumbs (from root to current task)
  const getTaskPath = useCallback((taskId: string | null): Task[] => {
    if (!taskId) return [];
    const path: Task[] = [];
    let current: Task | undefined = tasks.find(t => t.id === taskId);
    while (current) {
      path.unshift(current);
      if (!current.parentId) break;
      current = tasks.find(t => t.id === current!.parentId);
    }
    return path;
  }, [tasks]);

  // Clear completed tasks
  const clearCompleted = useCallback(() => {
    // Also clear completed subtasks
    const completedTaskIds = new Set(
      tasks.filter((t) => t.completed).map((t) => t.id)
    );
    // Keep root tasks that are not completed, and their incomplete descendants
    onUpdateTasks(
      tasks.filter((task) => {
        if (completedTaskIds.has(task.id)) {
          // If it's a completed task, check if it's a descendant of another completed task
          // Actually, we want to delete ALL completed tasks including subtasks
          return false;
        }
        return true;
      })
    );
  }, [tasks, onUpdateTasks]);

  // Get task stats
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const pending = total - completed;
    const highPriority = tasks.filter((t) => t.priority === 'high' && !t.completed).length;
    const urgent = tasks.filter((t) => t.urgency === 'urgent' && !t.completed).length;

    return {
      total,
      completed,
      pending,
      highPriority,
      urgent,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [tasks]);

  // Get stats for a specific zone
  const getZoneStats = useCallback((zoneId: string) => {
    const zoneTasks = getTasksByZone(zoneId);
    const total = zoneTasks.length;
    const completed = zoneTasks.filter((t) => t.completed).length;
    const pending = total - completed;

    return {
      total,
      completed,
      pending,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }, [getTasksByZone]);

  return {
    tasks: allTasks,
    getTasksByZone,
    getRootTasks,
    getChildTasks,
    getAllDescendants,
    hasChildren,
    incompleteTasks,
    completedTasks,
    addTask,
    toggleTask,
    deleteTask,
    updateTask,
    toggleExpanded,
    toggleSubtasksCollapsed,
    setTaskPriority,
    setTaskUrgency,
    moveTaskToZone,
    reorderTasks,
    clearCompleted,
    stats,
    getZoneStats,
    getTaskPath,
  };
}
