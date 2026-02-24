import React, { useState, useRef, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, CheckCircle2, Circle, Trash2, ChevronDown, Zap, ChevronRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TaskItem } from './TaskItem';
import type { Task, TaskPriority, TaskUrgency, Zone } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { getFlattenedTasks, calculateNewPosition, type FlattenedTask } from '@/lib/tree-utils';

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
  onSelectTask,
  onClearCompleted,
}: TaskListProps) {
  const { moveTaskNode, expandTask } = useAppStore();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority>('medium');
  const [selectedUrgency, setSelectedUrgency] = useState<TaskUrgency>('low');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [addingSubtaskParentId, setAddingSubtaskParentId] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDescription, setNewSubtaskDescription] = useState('');
  const [subtaskPriority, setSubtaskPriority] = useState<TaskPriority>('medium');
  const [subtaskUrgency, setSubtaskUrgency] = useState<TaskUrgency>('low');
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // 使用扁平化任务列表（支持聚焦模式）
  const flattenedTasks = useMemo(() =>
    getFlattenedTasks(tasks, zone?.id || null, focusedTaskId),
    [tasks, zone?.id, focusedTaskId]
  );

  // 分离未完成和已完成任务
  const incompleteTasks = useMemo(() =>
    flattenedTasks.filter(t => !t.completed),
    [flattenedTasks]
  );

  const completedTasks = useMemo(() =>
    flattenedTasks.filter(t => t.completed),
    [flattenedTasks]
  );

  const activeItem = activeId ? flattenedTasks.find(t => t.id === activeId) : null;

  const getZoneColor = (zoneId: string) => {
    const z = zones.find((z) => z.id === zoneId);
    return z?.color || '#6b7280';
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: { over: { id: string | number } | null }) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    setOverId(null);

    if (over && active.id !== over.id && zone) {
      // 计算新位置
      const result = calculateNewPosition(
        flattenedTasks,
        active.id as string,
        over.id as string,
        delta.x
      );
      if (result) {
        moveTaskNode(active.id as string, result.newParentId, result.anchorId, zone.id);
      }
    }
  };

  const handleAddTask = () => {
    if (newTaskTitle.trim() && zone) {
      onAddTask(zone.id, newTaskTitle.trim(), newTaskDescription.trim(), selectedPriority, selectedUrgency, null);
      setNewTaskTitle('');
      setNewTaskDescription('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTask();
    }
  };

  // 处理点击添加子任务按钮 - 展开父任务并显示输入框
  const handleAddSubtaskClick = (parentId: string) => {
    expandTask(parentId); // 展开父任务
    setAddingSubtaskParentId(parentId); // 显示添加子任务输入框
    setNewSubtaskTitle('');
    setNewSubtaskDescription('');
    setSubtaskPriority('medium'); // 重置优先级
    setSubtaskUrgency('low');     // 重置紧急度
    setTimeout(() => subtaskInputRef.current?.focus(), 0);
  };

  // 处理添加子任务
  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim() && addingSubtaskParentId && zone) {
      onAddTask(zone.id, newSubtaskTitle.trim(), newSubtaskDescription.trim(), subtaskPriority, subtaskUrgency, addingSubtaskParentId);
      setNewSubtaskTitle('');
      setNewSubtaskDescription('');
      // 保持输入框焦点，方便连续添加
      setTimeout(() => subtaskInputRef.current?.focus(), 0);
    }
  };

  // 处理取消添加子任务
  const handleCancelAddSubtask = () => {
    setAddingSubtaskParentId(null);
    setNewSubtaskTitle('');
    setNewSubtaskDescription('');
  };

  // 处理子任务输入框按键事件
  const handleSubtaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddSubtask();
    } else if (e.key === 'Escape') {
      handleCancelAddSubtask();
    }
  };

  const stats = {
    total: tasks.filter((t) => t.zoneId === zone?.id).length,
    completed: completedTasks.length,
    pending: incompleteTasks.length,
    completionRate: 0,
  };
  stats.completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

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
    if (!focusedTaskId) return incompleteTasks;
    return flattenedTasks.filter(t => t.parentId === focusedTaskId);
  }, [flattenedTasks, focusedTaskId, incompleteTasks]);

  // 显示的任务列表
  const displayTasks = focusedTaskId ? focusedRootTasks : incompleteTasks;

  // 检查任务是否有子任务
  const checkHasChildren = (taskId: string): boolean => {
    return tasks.some(t => t.parentId === taskId);
  };

  if (!zone) {
    return (
      <div className="task-list-empty">
        <p>请选择一个工作分区</p>
      </div>
    );
  }

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  };

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
          {incompleteTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="empty-state">
              <Circle size={48} className="empty-icon" />
              <p>暂无任务，添加一个开始专注吧！</p>
              <p className="empty-hint">双击任务可展开/收缩描述</p>
            </div>
          ) : (
            <>
              {/* Incomplete Tasks with DnD */}
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={displayTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {displayTasks.map((task) => (
                    <React.Fragment key={task.id}>
                      <TaskItem
                        task={task}
                        zoneColor={getZoneColor(task.zoneId)}
                        isActive={task.id === activeTaskId}
                        isTimerRunning={isTimerRunning && task.id === activeTaskId}
                        isDragOver={task.id === overId}
                        onToggle={onToggleTask}
                        onDelete={onDeleteTask}
                        onUpdate={onUpdateTask}
                        onToggleExpanded={onToggleExpanded}
                        onToggleSubtasksCollapsed={onToggleSubtasksCollapsed}
                        onAddSubtask={() => handleAddSubtaskClick(task.id)}
                        onZoomIn={(id) => setFocusedTaskId(id)}
                        onSelect={onSelectTask}
                        hasChildren={checkHasChildren(task.id)}
                        depth={(task as FlattenedTask).depth}
                        isDraggable={true}
                      />
                      {/* 添加子任务输入框 - 完整表单 */}
                      {addingSubtaskParentId === task.id && (
                        <div
                          className="relative mt-1 mb-2 pr-2"
                          style={{ paddingLeft: `${((task as FlattenedTask).depth + 1) * 24 + 8}px` }}
                        >
                          <div className="flex flex-col gap-2 p-3 rounded-lg border border-white/10 bg-white/5 shadow-inner">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <Input
                                  ref={subtaskInputRef}
                                  value={newSubtaskTitle}
                                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                  onKeyDown={handleSubtaskKeyDown}
                                  placeholder="子任务标题..."
                                  className="h-8 text-sm text-white bg-transparent border-none focus-visible:ring-0 px-0 placeholder:text-white/30"
                                  autoFocus
                                />
                              </div>
                              <Button
                                size="icon"
                                className="h-7 w-7 bg-blue-600 hover:bg-blue-500 text-white rounded-md shrink-0"
                                onClick={handleAddSubtask}
                                disabled={!newSubtaskTitle.trim()}
                              >
                                <Plus size={14} />
                              </Button>
                            </div>
                            {/* 描述输入框 */}
                            <Input
                              value={newSubtaskDescription}
                              onChange={(e) => setNewSubtaskDescription(e.target.value)}
                              onKeyDown={handleSubtaskKeyDown}
                              placeholder="描述（可选，Shift+Enter 换行）..."
                              className="h-7 text-sm text-white bg-transparent border-none focus-visible:ring-0 px-0 placeholder:text-white/30"
                            />
                            {/* 子任务也支持优先级设置 */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="priority-selector">
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
                                <div className="urgency-selector">
                                  {(['urgent', 'high', 'medium', 'low'] as TaskUrgency[]).map((u) => (
                                    <button
                                      key={u}
                                      className={`urgency-btn ${subtaskUrgency === u ? 'active' : ''} urgency-${u}`}
                                      onClick={() => setSubtaskUrgency(u)}
                                    >
                                      <Zap size={10} />
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs text-white/40 hover:text-white/80 px-2"
                                onClick={handleCancelAddSubtask}
                              >
                                取消
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </SortableContext>

                <DragOverlay dropAnimation={dropAnimation}>
                  {activeItem ? (
                    <TaskItem
                      task={activeItem}
                      zoneColor={getZoneColor(activeItem.zoneId)}
                      isActive={false}
                      isTimerRunning={false}
                      isDragOver={false}
                      onToggle={() => {}}
                      onDelete={() => {}}
                      onUpdate={() => {}}
                      onToggleExpanded={() => {}}
                      onSelect={() => {}}
                      hasChildren={false}
                      depth={(activeItem as FlattenedTask).depth}
                      isDraggable={true}
                    />
                  ) : null}
                </DragOverlay>
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
                      {completedTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          zoneColor={getZoneColor(task.zoneId)}
                          isActive={false}
                          isTimerRunning={false}
                          onToggle={onToggleTask}
                          onDelete={onDeleteTask}
                          onUpdate={onUpdateTask}
                          onToggleExpanded={onToggleExpanded}
                          onSelect={onSelectTask}
                          hasChildren={false}
                          depth={(task as FlattenedTask).depth}
                          isDraggable={false}
                        />
                      ))}
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
