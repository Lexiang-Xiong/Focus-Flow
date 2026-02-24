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
import { ArrowLeft, CheckCircle2, Globe, ArrowUpDown, Zap, Flag, ChevronDown, ChevronRight, ArrowUp, Layers, Home } from 'lucide-react';
import { getFlattenedTasks } from '@/lib/tree-utils';
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
import type { Task, Zone, GlobalViewSortMode, SortConfig, TaskPriority, TaskUrgency } from '@/types';

interface GlobalViewProps {
  zones: Zone[];
  tasks: Task[];
  activeTaskId: string | null;
  isTimerRunning: boolean;
  sortConfig: SortConfig;
  onBack: () => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => void;
  onToggleExpanded: (id: string) => void;
  onToggleSubtasksCollapsed?: (id: string) => void;
  onAddSubtask?: (parentId: string, title: string, priority: TaskPriority, urgency: TaskUrgency) => void;
  onReorderTasks: (zoneId: string, _tasks: Task[]) => void;
  onSelectTask: (id: string) => void;
  onSortConfigChange: (config: SortConfig) => void;
}

export function GlobalView({
  zones,
  tasks,
  activeTaskId,
  isTimerRunning,
  sortConfig,
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
}: GlobalViewProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewDepth, setViewDepth] = useState(2); // For sorting modes: how many levels to expand (默认展开2层)
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Helper functions for sorting
  const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  const urgencyOrder: Record<TaskUrgency, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const calculateWeightedScore = (task: Task): number => {
    const pWeight = sortConfig.priorityWeight ?? 0.4;
    const uWeight = sortConfig.urgencyWeight ?? 0.6;
    const normalizedPriority = (2 - priorityOrder[task.priority]) / 2; // 0-1, high=1
    const normalizedUrgency = (3 - urgencyOrder[task.urgency]) / 3; // 0-1, urgent=1
    return normalizedPriority * pWeight + normalizedUrgency * uWeight;
  };

  // Get root tasks (no parent or undefined parent - for backward compatibility)
  const rootTasks = useMemo(() => {
    return tasks.filter((t) => (t.parentId === null || t.parentId === undefined) && !t.completed);
  }, [tasks]);

  // Get child tasks for a parent
  const getChildTasks = (parentId: string): Task[] => {
    return tasks.filter((t) => t.parentId === parentId).sort((a, b) => a.order - b.order);
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
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        case 'weighted':
          return calculateWeightedScore(b) - calculateWeightedScore(a);
        default:
          return 0;
      }
    });
  }, [rootTasks, sortConfig, zoneModeTasks]);

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
      const urgencyGroups: Record<TaskUrgency, Task[]> = { urgent: [], high: [], medium: [], low: [] };
      sortedRootTasks.forEach((t) => urgencyGroups[t.urgency].push(t));

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
          onZoomIn={(id) => setFocusedTaskId(id)}
          hasChildren={hasKids}
          depth={depth}
        />
        {showChildren && taskChildren.map((child) => renderTaskWithChildren(child, depth + 1, maxExpandDepth))}
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
          onZoomIn={(id) => setFocusedTaskId(id)}
          hasChildren={hasKids}
          depth={currentDepth}
          isDraggable={sortConfig.mode === 'zone' && currentDepth === 0}
        />
        {showChildren && taskChildren.map((child) => renderTaskWithDepth(child, currentDepth + 1))}
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
        <div className="sort-mode-selector">
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
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Depth Controls for sorting modes */}
      {sortConfig.mode !== 'zone' && maxTreeDepth > 0 && !focusedTaskId && (
        <div className="depth-controls">
          <span className="depth-label">展开层级:</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewDepth(1)}
            className={viewDepth === 1 ? 'active' : ''}
            title="返回顶层"
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewDepth(Math.max(1, viewDepth - 1))}
            disabled={viewDepth <= 1}
            title="收起一级"
          >
            <ChevronRight size={14} />
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
              {focusedRootTasks.map((task) => (
                <TaskItem
                  key={task.id}
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
                  onZoomIn={(id) => setFocusedTaskId(id)}
                  hasChildren={tasks.some(t => t.parentId === task.id)}
                  depth={0}
                  isDraggable={false}
                />
              ))}
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
                        {group.tasks.map((task) => renderTaskWithDepth(task, 0))}
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
                      {group.tasks.map((task) => renderTaskWithDepth(task, 0))}
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
