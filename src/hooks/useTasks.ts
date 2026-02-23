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
    urgency: TaskUrgency = 'low'
  ) => {
    const zoneTasks = getTasksByZone(zoneId);
    const maxOrder = zoneTasks.length > 0 ? Math.max(...zoneTasks.map((t) => t.order)) : -1;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      zoneId,
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
  }, [tasks, getTasksByZone, onUpdateTasks]);

  // Toggle task completion
  const toggleTask = useCallback((id: string) => {
    onUpdateTasks(
      tasks.map((task) =>
        task.id === id
          ? { ...task, completed: !task.completed, completedAt: !task.completed ? Date.now() : undefined }
          : task
      )
    );
  }, [tasks, onUpdateTasks]);

  // Delete a task
  const deleteTask = useCallback((id: string) => {
    onUpdateTasks(tasks.filter((task) => task.id !== id));
  }, [tasks, onUpdateTasks]);

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

  // Reorder tasks within a zone
  const reorderTasks = useCallback((zoneId: string, newOrder: Task[]) => {
    const otherTasks = tasks.filter((t) => t.zoneId !== zoneId);
    const reorderedTasks = newOrder.map((task, index) => ({
      ...task,
      order: index,
    }));
    onUpdateTasks([...otherTasks, ...reorderedTasks]);
  }, [tasks, onUpdateTasks]);

  // Clear completed tasks
  const clearCompleted = useCallback(() => {
    onUpdateTasks(tasks.filter((task) => !task.completed));
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
    incompleteTasks,
    completedTasks,
    addTask,
    toggleTask,
    deleteTask,
    updateTask,
    toggleExpanded,
    setTaskPriority,
    setTaskUrgency,
    moveTaskToZone,
    reorderTasks,
    clearCompleted,
    stats,
    getZoneStats,
  };
}
