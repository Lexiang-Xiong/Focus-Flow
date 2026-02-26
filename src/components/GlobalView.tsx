import { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import React from 'react';
import { ArrowLeft, CheckCircle2, Globe, ArrowUpDown, Zap, Flag, ChevronDown, ChevronRight, ChevronUp, ArrowUp, Layers, Home, Clock, CircleX, Network } from 'lucide-react';
import { getFlattenedTasks } from '@/lib/tree-utils';
import { calculateRankScores, mapRankToUrgency } from '@/lib/urgency-utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TaskItem } from './TaskItem';
import type { Task, Zone, GlobalViewSortMode, SortConfig, TaskPriority, TaskUrgency, DeadlineType } from '@/types';
import type { TaskComputedTime } from '@/store/slices/taskSlice';

interface GlobalViewProps {
  zones: Zone[];
  tasks: Task[];
  activeTaskId: string | null;
  isTimerRunning: boolean;
  sortConfig: SortConfig;
  isLeafMode?: boolean; // 叶子节点模式状态（可选，用于外部控制）
  onLeafModeChange?: (isLeaf: boolean) => void; // 叶子节点模式变化回调
  onBack: () => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => void;
  onToggleExpanded: (id: string) => void;
  onToggleSubtasksCollapsed?: (id: string) => void;
  onAddSubtask?: (parentId: string, title: string, priority: TaskPriority, urgency: TaskUrgency, deadline?: number | null, deadlineType?: DeadlineType) => void;
  onReorderTasks: (zoneId: string, _tasks: Task[]) => void;
  onSelectTask: (id: string) => void;
  onSortConfigChange: (config: SortConfig) => void;
  onNavigateToZone?: (zoneId: string, taskId: string) => void;
  getTotalWorkTime?: (taskId: string) => number;
  getEstimatedTime?: (taskId: string) => number;
  taskComputedTimes?: Record<string, TaskComputedTime>;
}

export function GlobalView({
  zones,
  tasks,
  activeTaskId,
  isTimerRunning,
  sortConfig,
  isLeafMode: externalLeafMode,
  onLeafModeChange,
  onBack,
  onToggleTask,
  onDeleteTask,
  onUpdateTask,
  onToggleExpanded,
  onToggleSubtasksCollapsed,
  onAddSubtask: _onAddSubtask,
  onReorderTasks,
  onSelectTask,
  onSortConfigChange,
  onNavigateToZone,
  getTotalWorkTime,
  getEstimatedTime,
  taskComputedTimes,
}: GlobalViewProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewDepth, setViewDepth] = useState(2); // For sorting modes: how many levels to expand (默认展开2层)
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  // 叶子节点模式：如果外部提供了状态则使用外部状态，否则使用本地状态
  const [internalLeafMode, setInternalLeafMode] = useState(false);
  const isLeafMode = externalLeafMode !== undefined ? externalLeafMode : internalLeafMode;
  const setIsLeafMode = (value: boolean) => {
    if (onLeafModeChange) {
      onLeafModeChange(value);
    } else {
      setInternalLeafMode(value);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Helper functions for sorting
  const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

  // 计算所有任务的排名分数
  const rankScores = useMemo(() => calculateRankScores(tasks), [tasks]);

  const calculateWeightedScore = (task: Task): number => {
    const pWeight = sortConfig.priorityWeight ?? 0.6;
    const dWeight = sortConfig.deadlineWeight ?? 0.4;
    const normalizedPriority = (2 - priorityOrder[task.priority]) / 2; // 0-1, high=1
    // 使用叶子节点专用的排名分数，如果没有 deadline 则为 0
    const deadlineScore = task.deadline ? (leafModeRankScores[task.id] || 0) : 0;
    return normalizedPriority * pWeight + deadlineScore * dWeight;
  };

  // Get base tasks for sorting (either pure leaf nodes or root nodes)
  const baseTasksForSorting = useMemo(() => {
    const incompleteTasks = tasks.filter(t => !t.completed);

    if (isLeafMode) {
      // 叶子节点模式：寻找没有任何子任务的节点
      return incompleteTasks.filter(t => !tasks.some(child => child.parentId === t.id));
    }

    // 树状模式：寻找根节点（没有父节点的任务）
    return incompleteTasks.filter(t => t.parentId === null || t.parentId === undefined);
  }, [tasks, isLeafMode]);

  // 将结果赋值给 rootTasks，使后续逻辑自动生效
  const rootTasks = baseTasksForSorting;

  // 叶子节点模式专用排名分数（只基于叶子节点计算）
  const leafModeRankScores = useMemo(() => {
    if (!isLeafMode) return rankScores;
    // 只对叶子节点计算排名
    const leafTasks = rootTasks.filter(t => t.deadline && t.deadline > 0);
    // 按 deadline 排序（越早越紧急）
    leafTasks.sort((a, b) => a.deadline! - b.deadline!);
    // 分配排名分数
    const scores: Record<string, number> = {};
    leafTasks.forEach((task, index) => {
      scores[task.id] = 1 - (index / Math.max(leafTasks.length - 1, 1));
    });
    return scores;
  }, [rootTasks, isLeafMode, rankScores]);

  // Get child tasks for a parent
  const getChildTasks = (parentId: string): Task[] => {
    return tasks.filter((t) => t.parentId === parentId).sort((a, b) => a.order - b.order);
  };

  // 计算任务的动态预期时间（优先使用预计算值，否则递归计算）
  const calculateEstimatedTime = (taskId: string): number => {
    // 优先使用预计算值
    if (taskComputedTimes && taskComputedTimes[taskId]) {
      return taskComputedTimes[taskId].estimatedTime;
    }
    // Fallback: 递归计算
    const task = tasks.find(t => t.id === taskId);
    if (!task) return 0;

    if (task.estimatedTime !== undefined && task.estimatedTime > 0) {
      return task.estimatedTime;
    }

    const childTasks = getChildTasks(taskId);
    return childTasks.reduce((sum, child) => sum + calculateEstimatedTime(child.id), 0);
  };

  // 计算任务的动态总工作时间（优先使用预计算值，否则递归计算）
  const calculateTotalWorkTime = (taskId: string): number => {
    // 优先使用预计算值
    if (taskComputedTimes && taskComputedTimes[taskId]) {
      return taskComputedTimes[taskId].totalWorkTime;
    }
    // Fallback: 递归计算
    const task = tasks.find(t => t.id === taskId);
    if (!task) return 0;

    const childTasks = getChildTasks(taskId);
    const childrenTotalTime = childTasks.reduce((sum, child) => sum + calculateTotalWorkTime(child.id), 0);

    return (task.ownTime || 0) + childrenTotalTime;
  };

  // Get max depth of task tree
  const getMaxDepth = (taskId: string): number => {
    const children = getChildTasks(taskId);
    if (children.length === 0) return 0;
    let maxChildDepth = 0;
    children.forEach((child) => {
      maxChildDepth = Math.max(maxChildDepth, getMaxDepth(child.id));
    });
    return 1 + maxChildDepth;
  };

  const maxTreeDepth = useMemo(() => {
    let max = 0;
    rootTasks.forEach((task) => {
      max = Math.max(max, getMaxDepth(task.id));
    });
    return max;
  }, [rootTasks, tasks]);

  // For zone mode: show tree structure
  const zoneModeTasks = useMemo(() => {
    return rootTasks.sort((a, b) => {
      const zoneA = zones.find((z) => z.id === a.zoneId);
      const zoneB = zones.find((z) => z.id === b.zoneId);
      if (zoneA?.order !== zoneB?.order) {
        return (zoneA?.order || 0) - (zoneB?.order || 0);
      }
      return a.order - b.order;
    });
  }, [rootTasks, zones]);

  // For sorting modes: only root tasks participate in sorting
  const sortedRootTasks = useMemo(() => {
    if (sortConfig.mode === 'zone') return zoneModeTasks;

    return [...rootTasks].sort((a, b) => {
      switch (sortConfig.mode) {
        case 'priority':
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        case 'urgency':
          // 使用叶子节点专用的排名分数
          const aUrgencyScore = a.deadline ? (leafModeRankScores[a.id] || 0) : 0;
          const bUrgencyScore = b.deadline ? (leafModeRankScores[b.id] || 0) : 0;
          return bUrgencyScore - aUrgencyScore;
        case 'weighted':
          return calculateWeightedScore(b) - calculateWeightedScore(a);
        case 'workTime':
          // 按执行时间降序，未工作排最后，使用动态计算的值
          return calculateTotalWorkTime(b.id) - calculateTotalWorkTime(a.id);
        case 'estimatedTime':
          // 按预期时间降序，未定义排最后，使用动态计算的值
          const aEst = calculateEstimatedTime(a.id);
          const bEst = calculateEstimatedTime(b.id);
          if (aEst === 0 && bEst === 0) return 0;
          if (aEst === 0) return 1; // 未定义排最后
          if (bEst === 0) return -1;
          return bEst - aEst;
        case 'timeDiff':
          // 按时间差降序（实际时间 - 预期时间），差值越大越靠前
          const aDiffTotal = calculateTotalWorkTime(a.id) / 60 - calculateEstimatedTime(a.id);
          const bDiffTotal = calculateTotalWorkTime(b.id) / 60 - calculateEstimatedTime(b.id);
          // 如果都没有预期时间，按工作时间排序
          const aHasEst = calculateEstimatedTime(a.id) > 0;
          const bHasEst = calculateEstimatedTime(b.id) > 0;
          if (!aHasEst && !bHasEst) {
            return calculateTotalWorkTime(b.id) - calculateTotalWorkTime(a.id);
          }
          if (!aHasEst) return 1;
          if (!bHasEst) return -1;
          return bDiffTotal - aDiffTotal;
        default:
          return 0;
      }
    });
  }, [rootTasks, sortConfig, zoneModeTasks, leafModeRankScores]);

  // Group tasks for all sorting modes
  const taskGroups = useMemo(() => {
    const groups: { title: string; color: string; tasks: Task[]; zoneId?: string }[] = [];

    // Zone mode: create groups by zone
    if (sortConfig.mode === 'zone') {
      zones.forEach((zone) => {
        const zoneTasks = sortedRootTasks.filter((t) => t.zoneId === zone.id);
        if (zoneTasks.length > 0) {
          groups.push({
            title: zone.name,
            color: zone.color,
            tasks: zoneTasks,
            zoneId: zone.id,
          });
        }
      });
      return groups;
    }

    if (sortConfig.mode === 'priority') {
      const priorityGroups: Record<TaskPriority, Task[]> = { high: [], medium: [], low: [] };
      sortedRootTasks.forEach((t) => priorityGroups[t.priority].push(t));

      const priorityLabels: Record<TaskPriority, { title: string; color: string }> = {
        high: { title: '高优先级', color: '#ef4444' },
        medium: { title: '中优先级', color: '#eab308' },
        low: { title: '低优先级', color: '#22c55e' },
      };

      (['high', 'medium', 'low'] as TaskPriority[]).forEach((p) => {
        if (priorityGroups[p].length > 0) {
          groups.push({
            title: priorityLabels[p].title,
            color: priorityLabels[p].color,
            tasks: priorityGroups[p],
          });
        }
      });
    } else if (sortConfig.mode === 'urgency') {
      // 使用 deadline 排名自动计算 urgency
      const urgencyGroups: Record<TaskUrgency, Task[]> = { urgent: [], high: [], medium: [], low: [] };
      const noDeadlineTasks: Task[] = [];

      sortedRootTasks.forEach((t) => {
        if (!t.deadline || t.deadline <= 0) {
          noDeadlineTasks.push(t);
        } else {
          const score = leafModeRankScores[t.id] || 0;
          const urgency = mapRankToUrgency(score, true);
          urgencyGroups[urgency].push(t);
        }
      });

      const urgencyLabels: Record<TaskUrgency, { title: string; color: string }> = {
        urgent: { title: '紧急', color: '#dc2626' },
        high: { title: '高紧急度', color: '#f97316' },
        medium: { title: '中紧急度', color: '#eab308' },
        low: { title: '低紧急度', color: '#22c55e' },
      };

      (['urgent', 'high', 'medium', 'low'] as TaskUrgency[]).forEach((u) => {
        if (urgencyGroups[u].length > 0) {
          groups.push({
            title: urgencyLabels[u].title,
            color: urgencyLabels[u].color,
            tasks: urgencyGroups[u],
          });
        }
      });

      // 添加"未设截止日期"分组
      if (noDeadlineTasks.length > 0) {
        groups.push({
          title: '未设截止日期',
          color: '#6b7280',
          tasks: noDeadlineTasks,
        });
      }
    } else if (sortConfig.mode === 'weighted') {
      const scoreGroups: { title: string; color: string; minScore: number; tasks: Task[] }[] = [
        { title: '重要且紧急', color: '#dc2626', minScore: 0.75, tasks: [] },
        { title: '重要或紧急', color: '#f97316', minScore: 0.5, tasks: [] },
        { title: '一般', color: '#eab308', minScore: 0.25, tasks: [] },
        { title: '低优先级', color: '#22c55e', minScore: 0, tasks: [] },
      ];

      sortedRootTasks.forEach((t) => {
        const score = calculateWeightedScore(t);
        if (score >= 0.75) scoreGroups[0].tasks.push(t);
        else if (score >= 0.5) scoreGroups[1].tasks.push(t);
        else if (score >= 0.25) scoreGroups[2].tasks.push(t);
        else scoreGroups[3].tasks.push(t);
      });

      scoreGroups.forEach((g) => {
        if (g.tasks.length > 0) {
          groups.push({
            title: g.title,
            color: g.color,
            tasks: g.tasks,
          });
        }
      });
    } else if (sortConfig.mode === 'workTime' || sortConfig.mode === 'estimatedTime' || sortConfig.mode === 'timeDiff') {
      // 这三种模式按时间排序，不需要分组，直接显示所有任务
      if (sortedRootTasks.length > 0) {
        let title = '';
        let color = '#6b7280';
        switch (sortConfig.mode) {
          case 'workTime':
            title = '按执行时间';
            color = '#3b82f6';
            break;
          case 'estimatedTime':
            title = '按预期时间';
            color = '#8b5cf6';
            break;
          case 'timeDiff':
            title = '按时间差';
            color = '#f59e0b';
            break;
        }
        groups.push({
          title,
          color,
          tasks: sortedRootTasks,
        });
      }
    }

    return groups;
  }, [sortedRootTasks, sortConfig.mode, zones]);

  const completedTasks = tasks.filter((t) => t.completed);

  // 使用 getFlattenedTasks 支持聚焦模式
  const flattenedTasks = useMemo(() => {
    return getFlattenedTasks(tasks, null, focusedTaskId);
  }, [tasks, focusedTaskId]);

  // 计算 breadcrumbs
  const breadcrumbs = useMemo(() => {
    if (!focusedTaskId) return [];
    const path: Task[] = [];
    let current = tasks.find((t) => t.id === focusedTaskId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? tasks.find((t) => t.id === current!.parentId) : undefined;
    }
    return path;
  }, [tasks, focusedTaskId]);

  // 计算当前焦点的根任务
  const focusedRootTasks = useMemo(() => {
    if (!focusedTaskId) return null;
    return flattenedTasks.filter(t => t.parentId === focusedTaskId);
  }, [flattenedTasks, focusedTaskId]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Find active and over tasks
      const activeTask = rootTasks.find((t) => t.id === active.id);
      const overTask = rootTasks.find((t) => t.id === over.id);

      if (!activeTask || !overTask) return;

      // Case 1: Cross-zone drag - update zoneId
      if (activeTask.zoneId !== overTask.zoneId && sortConfig.mode === 'zone') {
        onUpdateTask(activeTask.id, { zoneId: overTask.zoneId });
        return;
      }

      // Case 2: Same zone - reorder
      const oldIndex = sortedRootTasks.findIndex((t) => t.id === active.id);
      const newIndex = sortedRootTasks.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(sortedRootTasks, oldIndex, newIndex);
        // Group by zone and reorder within each zone
        const zoneGroups = new Map<string, Task[]>();
        reordered.forEach((task) => {
          if (!zoneGroups.has(task.zoneId)) {
            zoneGroups.set(task.zoneId, []);
          }
          zoneGroups.get(task.zoneId)!.push(task);
        });

        // Update order for each zone
        zoneGroups.forEach((zoneTasks, zoneId) => {
          onReorderTasks(zoneId, zoneTasks);
        });
      }
    }
  };

  const getZoneColor = (zoneId: string) => {
    const zone = zones.find((z) => z.id === zoneId);
    return zone?.color || '#6b7280';
  };

  const stats = {
    total: tasks.length,
    completed: completedTasks.length,
    pending: rootTasks.length,
    completionRate: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
  };

  // Recursively render task with children for zone mode
  const renderTaskWithChildren = (task: Task, depth: number, maxExpandDepth: number): React.ReactNode => {
    const taskChildren = getChildTasks(task.id);
    const hasKids = taskChildren.length > 0;
    const showChildren = !task.isCollapsed && depth < maxExpandDepth;

    return (
      <div
        key={task.id}
        className="task-tree-item"
        style={{ paddingLeft: depth > 0 ? `${depth * 24}px` : undefined }}
      >
        <TaskItem
          task={task}
          zoneColor={getZoneColor(task.zoneId)}
          isActive={task.id === activeTaskId}
          isTimerRunning={isTimerRunning && task.id === activeTaskId}
          onToggle={onToggleTask}
          onDelete={onDeleteTask}
          onUpdate={onUpdateTask}
          onToggleExpanded={onToggleExpanded}
          onToggleSubtasksCollapsed={onToggleSubtasksCollapsed}
          onSelect={onSelectTask}
          onZoomIn={onNavigateToZone ? (id) => {
            const t = tasks.find(task => task.id === id);
            if (t) onNavigateToZone(t.zoneId, id);
          } : undefined}
          hasChildren={hasKids}
          depth={depth}
          getTotalWorkTime={getTotalWorkTime}
          getEstimatedTime={getEstimatedTime}
          rankScores={rankScores}
          allTasks={tasks}
        />
        {showChildren && taskChildren.map((child) => renderTaskWithChildren(child, depth + 1, maxExpandDepth))}
      </div>
    );
  };

  // Recursively render task with children for focused mode (always expand)
  const renderFocusedTaskWithChildren = (task: Task, depth: number): React.ReactNode => {
    const taskChildren = getChildTasks(task.id);
    const hasKids = taskChildren.length > 0;
    const showChildren = !task.isCollapsed;

    return (
      <div
        key={task.id}
        className="task-tree-item"
        style={{ paddingLeft: depth > 0 ? `${depth * 24}px` : undefined }}
      >
        <TaskItem
          task={task}
          zoneColor={getZoneColor(task.zoneId)}
          isActive={task.id === activeTaskId}
          isTimerRunning={isTimerRunning && task.id === activeTaskId}
          onToggle={onToggleTask}
          onDelete={onDeleteTask}
          onUpdate={onUpdateTask}
          onToggleExpanded={onToggleExpanded}
          onToggleSubtasksCollapsed={onToggleSubtasksCollapsed}
          onSelect={onSelectTask}
          onZoomIn={onNavigateToZone ? (id) => {
            const t = tasks.find(task => task.id === id);
            if (t) onNavigateToZone(t.zoneId, id);
          } : undefined}
          hasChildren={hasKids}
          depth={depth}
          isDraggable={false}
        />
        {showChildren && taskChildren.map((child) => renderFocusedTaskWithChildren(child, depth + 1))}
      </div>
    );
  };

  // Recursively render task with children for sorting modes (respecting viewDepth)
  const renderTaskWithDepth = (task: Task, currentDepth: number): React.ReactNode => {
    const taskChildren = getChildTasks(task.id);
    const hasKids = taskChildren.length > 0;
    const showChildren = !task.isCollapsed && currentDepth < viewDepth;

    return (
      <div
        key={task.id}
        className="task-tree-item"
        style={{ paddingLeft: currentDepth > 0 ? `${currentDepth * 24}px` : undefined }}
      >
        <TaskItem
          task={task}
          zoneColor={getZoneColor(task.zoneId)}
          isActive={task.id === activeTaskId}
          isTimerRunning={isTimerRunning && task.id === activeTaskId}
          onToggle={onToggleTask}
          onDelete={onDeleteTask}
          onUpdate={onUpdateTask}
          onToggleExpanded={onToggleExpanded}
          onToggleSubtasksCollapsed={onToggleSubtasksCollapsed}
          onSelect={onSelectTask}
          onZoomIn={onNavigateToZone ? (id) => {
            const t = tasks.find(task => task.id === id);
            if (t) onNavigateToZone(t.zoneId, id);
          } : undefined}
          hasChildren={hasKids}
          depth={currentDepth}
          isDraggable={sortConfig.mode === 'zone' && currentDepth === 0}
          getTotalWorkTime={getTotalWorkTime}
          getEstimatedTime={getEstimatedTime}
        />
        {showChildren && taskChildren.map((child) => renderTaskWithDepth(child, currentDepth + 1))}
      </div>
    );
  };

  // 缓存面包屑路径，避免重复计算
  const breadcrumbsCache = useMemo(() => new Map<string, Task[]>(), [tasks]);

  // 获取任务的父级路径用于叶子节点模式的上下文展示
  const getTaskBreadcrumbs = (taskId: string): Task[] => {
    // 检查缓存
    if (breadcrumbsCache.has(taskId)) {
      return breadcrumbsCache.get(taskId)!;
    }

    const path: Task[] = [];
    let current = tasks.find(t => t.id === taskId);
    const visited = new Set<string>(); // 防止循环引用

    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = tasks.find(t => t.id === current!.parentId);
      if (parent) {
        path.unshift(parent);
        current = parent;
      } else break;
    }

    // 存入缓存
    breadcrumbsCache.set(taskId, path);
    return path;
  };

  // 专属的叶子节点渲染函数
  const renderLeafTask = (task: Task): React.ReactNode => {
    const path = getTaskBreadcrumbs(task.id);
    return (
      <div key={task.id} className="task-tree-item mb-1 relative">
        {/* 上下文面包屑 */}
        {path.length > 0 && (
          <div className="flex items-center gap-1 pl-7 pr-2 text-[10px] text-white/40 mb-0.5 leading-none">
            {path.map((p, i) => (
              <span key={p.id} className="truncate max-w-[80px]">
                {p.title} {i < path.length - 1 ? '>' : ''}
              </span>
            ))}
          </div>
        )}
        <TaskItem
          task={task}
          zoneColor={getZoneColor(task.zoneId)}
          isActive={task.id === activeTaskId}
          isTimerRunning={isTimerRunning && task.id === activeTaskId}
          onToggle={onToggleTask}
          onDelete={onDeleteTask}
          onUpdate={onUpdateTask}
          onToggleExpanded={onToggleExpanded}
          onSelect={onSelectTask}
          onZoomIn={onNavigateToZone ? (id) => {
            const t = tasks.find(task => task.id === id);
            if (t) onNavigateToZone(t.zoneId, id);
          } : undefined}
          hasChildren={false}
          depth={0}
          isDraggable={false} // 安全限制：叶子模式下强制禁用拖拽
          getTotalWorkTime={getTotalWorkTime}
          getEstimatedTime={getEstimatedTime}
          rankScores={rankScores}
          allTasks={tasks}
        />
      </div>
    );
  };

  return (
    <div className="global-view-container">
      {/* Header */}
      <div className="global-view-header">
        <Button
          size="icon"
          variant="ghost"
          className="back-btn"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="global-view-title">
          <Globe size={18} className="text-blue-400" />
          <span>全局视图</span>
          <span className="task-count">({stats.completed}/{stats.total})</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {/* 叶子节点模式切换开关 */}
          <Button
            variant="outline"
            size="sm"
            className={`h-8 px-2 border ${isLeafMode ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-gray-800 text-gray-200 border-gray-600'}`}
            onClick={() => setIsLeafMode(!isLeafMode)}
            title={isLeafMode ? "当前为：只看可执行子任务" : "当前为：树状结构"}
          >
            <Network size={14} className="mr-1" />
            {isLeafMode ? '叶子节点' : '树状视图'}
          </Button>

          <div className="sort-mode-selector m-0">
          <Select
            value={sortConfig.mode}
            onValueChange={(value: GlobalViewSortMode) => {
              onSortConfigChange({ ...sortConfig, mode: value });
              // 保留用户之前的展开层级习惯
            }}
          >
            <SelectTrigger className="sort-select-trigger">
              <ArrowUpDown size={14} />
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zone">
                <div className="sort-option">
                  <Globe size={14} />
                  <span>按工作区</span>
                </div>
              </SelectItem>
              <SelectItem value="priority">
                <div className="sort-option">
                  <Flag size={14} />
                  <span>按优先级</span>
                </div>
              </SelectItem>
              <SelectItem value="urgency">
                <div className="sort-option">
                  <Zap size={14} />
                  <span>按紧急度</span>
                </div>
              </SelectItem>
              <SelectItem value="weighted">
                <div className="sort-option">
                  <Flag size={14} />
                  <Zap size={14} />
                  <span>加权排序</span>
                </div>
              </SelectItem>
              <SelectItem value="workTime">
                <div className="sort-option">
                  <Clock size={14} />
                  <span>执行时间</span>
                </div>
              </SelectItem>
              <SelectItem value="estimatedTime">
                <div className="sort-option">
                  <Clock size={14} />
                  <span>预期时间</span>
                </div>
              </SelectItem>
              <SelectItem value="timeDiff">
                <div className="sort-option">
                  <Clock size={14} />
                  <span>时间差</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        </div>
      </div>

      {/* Depth Controls for sorting modes */}
      {!isLeafMode && sortConfig.mode !== 'zone' && maxTreeDepth > 0 && !focusedTaskId && (
        <div className="depth-controls">
          <span className="depth-label">展开层级:</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewDepth(0)}
            className={viewDepth === 0 ? 'active' : ''}
            title="全部收起"
          >
            <CircleX size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewDepth(1)}
            className={viewDepth === 1 ? 'active' : ''}
            title="仅显示顶层"
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewDepth(Math.max(0, viewDepth - 1))}
            disabled={viewDepth <= 0}
            title="收起一级"
          >
            <ChevronUp size={14} />
          </Button>
          <span className="depth-value">{viewDepth}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewDepth(Math.min(maxTreeDepth, viewDepth + 1))}
            disabled={viewDepth >= maxTreeDepth}
            title="展开一级"
          >
            <ChevronDown size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewDepth(maxTreeDepth)}
            className={viewDepth >= maxTreeDepth ? 'active' : ''}
            title="展开所有"
          >
            <Layers size={14} />
          </Button>
        </div>
      )}

      {/* Breadcrumb Navigation for focused task */}
      {focusedTaskId && (
        <div className="flex items-center gap-1.5 px-1 py-2 mb-2 text-xs text-white/50 overflow-x-auto whitespace-nowrap border-b border-white/5">
          <button
            onClick={() => setFocusedTaskId(null)}
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            <Home size={12} /> 全局
          </button>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight size={12} className="opacity-50" />
              <button
                onClick={() => setFocusedTaskId(crumb.id)}
                className={`hover:text-white transition-colors ${crumb.id === focusedTaskId ? 'text-blue-400 font-medium' : ''}`}
              >
                {crumb.title}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Task List */}
      <ScrollArea className="task-scroll-area">
        <div className="tasks-container">
          {/* Focused task view - show only children of focused task */}
          {focusedTaskId && focusedRootTasks && focusedRootTasks.length > 0 ? (
            <div className="focused-task-view">
              {focusedRootTasks.map((task) => renderFocusedTaskWithChildren(task, 0))}
            </div>
          ) : focusedTaskId && focusedRootTasks && focusedRootTasks.length === 0 ? (
            <div className="empty-state">
              <p>该任务下暂无子任务</p>
              <p className="empty-hint">点击标题可进入子任务视图</p>
            </div>
          ) : rootTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="empty-state">
              <Globe size={48} className="empty-icon" />
              <p>暂无任务</p>
              <p className="empty-hint">在分区中添加任务，这里会显示所有任务</p>
            </div>
          ) : (
            <>
              {/* All sorting modes use taskGroups with DndContext at root level */}
              {sortConfig.mode === 'zone' && taskGroups && taskGroups.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  {taskGroups.map((group) => (
                    <div key={group.title} className="task-group">
                      <div
                        className="group-label"
                        style={{
                          backgroundColor: `${group.color}15`,
                          borderLeftColor: group.color,
                        }}
                      >
                        <span style={{ color: group.color }}>{group.title}</span>
                        <span className="group-count">({group.tasks.length})</span>
                      </div>
                      <SortableContext
                        items={group.tasks.map((t) => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {group.tasks.map((task) =>
                          isLeafMode ? renderLeafTask(task) : renderTaskWithDepth(task, 0)
                        )}
                      </SortableContext>
                    </div>
                  ))}
                </DndContext>
              ) : sortConfig.mode !== 'zone' ? (
                /* Non-zone sorting modes */
                taskGroups?.map((group) => (
                  <div key={group.title} className="task-group">
                    <div
                      className="group-label"
                      style={{
                        backgroundColor: `${group.color}15`,
                        borderLeftColor: group.color,
                      }}
                    >
                      <span style={{ color: group.color }}>{group.title}</span>
                      <span className="group-count">({group.tasks.length})</span>
                    </div>
                    <SortableContext
                      items={group.tasks.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {group.tasks.map((task) =>
                        isLeafMode ? renderLeafTask(task) : renderTaskWithDepth(task, 0)
                      )}
                    </SortableContext>
                  </div>
                ))
              ) : null}

              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <div className="completed-section">
                  <button
                    className="completed-toggle"
                    onClick={() => setShowCompleted(!showCompleted)}
                  >
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span>已完成 ({completedTasks.length})</span>
                    <span className={`toggle-arrow ${showCompleted ? 'open' : ''}`}>
                      ▼
                    </span>
                  </button>

                  {showCompleted && (
                    <div className="completed-tasks">
                      {/* Only render root completed tasks recursively */}
                      {completedTasks
                        .filter((t) => t.parentId === null || t.parentId === undefined)
                        .map((task) => {
                          const taskChildren = getChildTasks(task.id);
                          return (
                            <div
                              key={task.id}
                              className="task-tree-item"
                            >
                              <TaskItem
                                task={task}
                                zoneColor={getZoneColor(task.zoneId)}
                                isActive={false}
                                isTimerRunning={false}
                                onToggle={onToggleTask}
                                onDelete={onDeleteTask}
                                onUpdate={onUpdateTask}
                                onToggleExpanded={onToggleExpanded}
                                onSelect={onSelectTask}
                                hasChildren={taskChildren.length > 0}
                                depth={0}
                                getTotalWorkTime={getTotalWorkTime}
                                getEstimatedTime={getEstimatedTime}
                              />
                              {taskChildren.map((child) => {
                                const renderChild = (c: Task, d: number): React.ReactNode => {
                                  const grandchildren = getChildTasks(c.id);
                                  return (
                                    <div
                                      key={c.id}
                                      className="task-tree-item"
                                      style={{ paddingLeft: d > 0 ? `${d * 24}px` : undefined }}
                                    >
                                      <TaskItem
                                        task={c}
                                        zoneColor={getZoneColor(c.zoneId)}
                                        isActive={false}
                                        isTimerRunning={false}
                                        onToggle={onToggleTask}
                                        onDelete={onDeleteTask}
                                        onUpdate={onUpdateTask}
                                        onToggleExpanded={onToggleExpanded}
                                        onSelect={onSelectTask}
                                        hasChildren={grandchildren.length > 0}
                                        depth={0}
                                        getTotalWorkTime={getTotalWorkTime}
                                        getEstimatedTime={getEstimatedTime}
                                      />
                                      {grandchildren.map((gc) => renderChild(gc, d + 1))}
                                    </div>
                                  );
                                };
                                return renderChild(child, 1);
                              })}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer Stats */}
      <div className="task-list-footer">
        <div className="footer-stat">
          <span className="stat-label">完成率</span>
          <span className="stat-value">{stats.completionRate}%</span>
        </div>
        <div className="footer-stat">
          <span className="stat-label">待办</span>
          <span className="stat-value">{stats.pending}</span>
        </div>
      </div>
    </div>
  );
}
