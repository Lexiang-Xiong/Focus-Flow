import React, { useState, useRef, useMemo, useEffect } from 'react';
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
import { Plus, CheckCircle2, Circle, Trash2, ChevronDown, Zap, ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TaskItem } from './TaskItem';
import type { Task, TaskPriority, TaskUrgency, Zone } from '@/types';

interface TaskListProps {
  zone: Zone | null;
  zones: Zone[];
  tasks: Task[];
  activeTaskId: string | null;
  isTimerRunning: boolean;
  onAddTask: (zoneId: string, title: string, description: string, priority?: TaskPriority, urgency?: TaskUrgency, parentId?: string | null) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => void;
  onToggleExpanded: (id: string) => void;
  onToggleSubtasksCollapsed?: (id: string) => void;
  onReorderTasks: (zoneId: string, tasks: Task[]) => void;
  onSelectTask: (id: string) => void;
  onClearCompleted: () => void;
}

export function TaskList({
  zone,
  zones,
  tasks,
  activeTaskId,
  isTimerRunning,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onUpdateTask,
  onToggleExpanded,
  onToggleSubtasksCollapsed,
  onReorderTasks,
  onSelectTask,
  onClearCompleted,
}: TaskListProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority>('medium');
  const [selectedUrgency, setSelectedUrgency] = useState<TaskUrgency>('low');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  // Reset focusedTaskId when zone changes
  useEffect(() => {
    setFocusedTaskId(null);
  }, [zone?.id]);

  // For adding subtask
  const [addingSubtaskParentId, setAddingSubtaskParentId] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskPriority, setSubtaskPriority] = useState<TaskPriority>('medium');
  const [subtaskUrgency, setSubtaskUrgency] = useState<TaskUrgency>('low');
  const inputRef = useRef<HTMLInputElement>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get root tasks (no parent or undefined parent - for backward compatibility)
  // Supports focused mode: when focusedTaskId is set, show only that task's children
  const rootTasks = useMemo(() => {
    if (focusedTaskId) {
      // Focused mode: show focused task's direct children as root
      return tasks
        .filter((t) => t.parentId === focusedTaskId)
        .sort((a, b) => a.order - b.order);
    }
    // Normal mode: show zone's root tasks
    return tasks
      .filter((t) => t.zoneId === zone?.id && (t.parentId === null || t.parentId === undefined))
      .sort((a, b) => a.order - b.order);
  }, [tasks, zone, focusedTaskId]);

  // Calculate breadcrumbs for focused mode
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

  const incompleteTasks = tasks.filter((t) => !t.completed && t.zoneId === zone?.id);
  const completedTasks = tasks.filter((t) => t.completed && t.zoneId === zone?.id);

  // Build task tree structure
  const getChildTasks = (parentId: string): Task[] => {
    return tasks
      .filter((t) => t.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  };

  const hasChildren = (taskId: string): boolean => {
    return tasks.some((t) => t.parentId === taskId);
  };

  const handleAddTask = () => {
    if (newTaskTitle.trim() && zone) {
      // In focused mode, add as child of focused task; otherwise add as root task
      const parentId = focusedTaskId;
      onAddTask(zone.id, newTaskTitle.trim(), newTaskDescription.trim(), selectedPriority, selectedUrgency, parentId);
      setNewTaskTitle('');
      setNewTaskDescription('');
      inputRef.current?.focus();
    }
  };

  const handleAddSubtask = (parentId: string) => {
    if (subtaskTitle.trim() && zone) {
      onAddTask(zone.id, subtaskTitle.trim(), '', subtaskPriority, subtaskUrgency, parentId);
      setSubtaskTitle('');
      setSubtaskPriority('medium');
      setSubtaskUrgency('low');
      setAddingSubtaskParentId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTask();
    }
  };

  const handleSubtaskKeyDown = (e: React.KeyboardEvent, parentId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddSubtask(parentId);
    } else if (e.key === 'Escape') {
      setAddingSubtaskParentId(null);
      setSubtaskTitle('');
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = rootTasks.findIndex((t) => t.id === active.id);
      const newIndex = rootTasks.findIndex((t) => t.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(rootTasks, oldIndex, newIndex);
        onReorderTasks(zone?.id || '', reordered);
      }
    }
  };

  const getZoneColor = (zoneId: string) => {
    const z = zones.find((z) => z.id === zoneId);
    return z?.color || '#6b7280';
  };

  // Recursively render task with its children
  const renderTaskWithChildren = (task: Task, depth: number): React.ReactNode => {
    const taskChildren = getChildTasks(task.id);
    const hasKids = taskChildren.length > 0;
    const showChildren = !task.isCollapsed;

    return (
      <div
        key={task.id}
        className="task-tree-item relative"
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
          onAddSubtask={(parentId) => setAddingSubtaskParentId(parentId)}
          onZoomIn={(id) => setFocusedTaskId(id)}
          onSelect={onSelectTask}
          hasChildren={hasKids}
          depth={0}
          isDraggable={depth === 0}
        />

        {/* Subtask add form - outside showChildren to allow adding even when collapsed */}
        {addingSubtaskParentId === task.id && (
          <div className="subtask-add-form" style={{ paddingLeft: `${(depth + 1) * 20}px` }}>
            <div className="subtask-add-inputs">
              <Input
                ref={subtaskInputRef}
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                onKeyDown={(e) => handleSubtaskKeyDown(e, task.id)}
                placeholder="子任务标题..."
                className="subtask-input"
                autoFocus
              />
              <div className="subtask-priority-select">
                {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => (
                  <button
                    key={p}
                    className={`priority-btn ${subtaskPriority === p ? 'active' : ''} priority-${p}`}
                    onClick={() => setSubtaskPriority(p)}
                  >
                    <div className={`priority-dot ${p}`} />
                  </button>
                ))}
              </div>
              <div className="subtask-urgency-select">
                {(['urgent', 'high', 'medium', 'low'] as TaskUrgency[]).map((u) => (
                  <button
                    key={u}
                    className={`urgency-btn ${subtaskUrgency === u ? 'active' : ''} urgency-${u}`}
                    onClick={() => setSubtaskUrgency(u)}
                  >
                    <Zap size={8} />
                  </button>
                ))}
              </div>
              <Button
                size="icon"
                className="subtask-add-btn"
                onClick={() => handleAddSubtask(task.id)}
                disabled={!subtaskTitle.trim()}
              >
                <Plus size={14} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="subtask-cancel-btn"
                onClick={() => {
                  setAddingSubtaskParentId(null);
                  setSubtaskTitle('');
                }}
              >
                <ChevronDown size={14} />
              </Button>
            </div>
          </div>
        )}

        {/* Children area with VS Code style guide lines */}
        {showChildren && (
          <div className="relative" style={{ paddingLeft: '24px' }}>
            {/* Vertical guide line */}
            <div className="absolute top-0 bottom-0 left-3 w-px bg-white/10" />

            {/* Render children */}
            {taskChildren.map((child) => renderTaskWithChildren(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Recursively render completed task with its children
  const renderCompletedTaskWithChildren = (task: Task, depth: number): React.ReactNode => {
    const taskChildren = getChildTasks(task.id);
    const hasKids = taskChildren.length > 0;

    return (
      <div
        key={task.id}
        className="task-tree-item"
        style={{ paddingLeft: depth > 0 ? `${depth * 24}px` : undefined }}
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
          hasChildren={hasKids}
          depth={0}
          isDraggable={false}
        />
        {taskChildren.map((child) => renderCompletedTaskWithChildren(child, depth + 1))}
      </div>
    );
  };

  const stats = {
    total: tasks.filter((t) => t.zoneId === zone?.id).length,
    completed: completedTasks.length,
    pending: incompleteTasks.length,
    completionRate: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
  };

  if (!zone) {
    return (
      <div className="task-list-empty">
        <p>请选择一个工作分区</p>
      </div>
    );
  }

  return (
    <div className="task-list-container">
      {/* Header */}
      <div className="task-list-header">
        <div className="task-list-title">
          <div
            className="zone-color-badge"
            style={{ backgroundColor: zone.color }}
          />
          <span>{zone.name}</span>
          <span className="task-count">
            ({stats.completed}/{stats.total})
          </span>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      {focusedTaskId && (
        <div className="flex items-center gap-1.5 px-1 py-2 mb-2 text-xs text-white/50 overflow-x-auto whitespace-nowrap border-b border-white/5">
          <button
            onClick={() => setFocusedTaskId(null)}
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            <Home size={12} /> Root
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

      {/* Add Task */}
      {isAddingTask ? (
        <div className="add-task-container">
          <div className="priority-urgency-row">
            <div className="priority-selector">
              {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  className={`priority-btn ${selectedPriority === p ? 'active' : ''} priority-${p}`}
                  onClick={() => setSelectedPriority(p)}
                >
                  <div className={`priority-dot ${p}`} />
                </button>
              ))}
            </div>
            <div className="urgency-selector">
              {(['urgent', 'high', 'medium', 'low'] as TaskUrgency[]).map((u) => (
                <button
                  key={u}
                  className={`urgency-btn ${selectedUrgency === u ? 'active' : ''} urgency-${u}`}
                  onClick={() => setSelectedUrgency(u)}
                >
                  <Zap size={10} />
                </button>
              ))}
            </div>
          </div>
          <div className="add-task-inputs">
            <Input
              ref={inputRef}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="任务标题..."
              className="add-task-title-input"
            />
            <Input
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述（可选，Shift+Enter 换行）..."
              className="add-task-desc-input"
            />
          </div>
          <div className="add-task-actions">
            <Button
              size="icon"
              className="add-task-btn"
              onClick={() => {
                handleAddTask();
                setIsAddingTask(false);
              }}
              disabled={!newTaskTitle.trim()}
            >
              <Plus size={18} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="cancel-task-btn"
              onClick={() => {
                setIsAddingTask(false);
                setNewTaskTitle('');
                setNewTaskDescription('');
              }}
            >
              <ChevronDown size={18} />
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="add-task-collapsed"
          onClick={() => setIsAddingTask(true)}
        >
          <Plus size={16} />
          <span>添加任务</span>
        </button>
      )}

      {/* Task List */}
      <ScrollArea className="task-scroll-area">
        <div className="tasks-container">
          {rootTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="empty-state">
              <Circle size={48} className="empty-icon" />
              <p>暂无任务，添加一个开始专注吧！</p>
              <p className="empty-hint">双击任务可展开/收缩描述</p>
            </div>
          ) : (
            <>
              {/* Draggable Root Tasks with Children */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={rootTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {rootTasks.map((task) => renderTaskWithChildren(task, 0))}
                </SortableContext>
              </DndContext>

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
                        .map((task) => renderCompletedTaskWithChildren(task, 0))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="clear-completed-btn"
                        onClick={onClearCompleted}
                      >
                        <Trash2 size={14} className="mr-1" />
                        清除已完成
                      </Button>
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
