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
import { Plus, CheckCircle2, Circle, Trash2, ChevronDown, ChevronRight, Home, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { TaskItem } from './TaskItem';
import type { Task, TaskPriority, TaskUrgency, DeadlineType, Zone } from '@/types';
import { convertDeadlineType } from '@/lib/urgency-utils';
import { useAppStore } from '@/store';
import { getFlattenedTasks, calculateNewPosition, type FlattenedTask } from '@/lib/tree-utils';

interface TaskListProps {
  zone: Zone | null;
  zones: Zone[];
  tasks: Task[];
  activeTaskId: string | null;
  isTimerRunning: boolean;
  focusedTaskId?: string | null; // 从全局视图导航过来时聚焦的任务ID
  onSetFocusedTaskId?: (id: string | null) => void;
  onAddTask: (zoneId: string, title: string, description: string, priority?: TaskPriority, urgency?: TaskUrgency, deadline?: number | null, deadlineType?: DeadlineType, parentId?: string | null) => void;
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
  focusedTaskId: propFocusedTaskId,
  onSetFocusedTaskId,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onUpdateTask,
  onToggleExpanded,
  onToggleSubtasksCollapsed,
  onSelectTask,
  onClearCompleted,
}: TaskListProps) {
  const { moveTaskNode, expandTask, getTotalWorkTime, getEstimatedTime } = useAppStore();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority>('medium');
  const [selectedUrgency] = useState<TaskUrgency>('low');  // Urgency is now auto-calculated from deadline
  const [selectedDeadline, setSelectedDeadline] = useState<number | null>(null);
  const [selectedDeadlineType, setSelectedDeadlineType] = useState<DeadlineType>('none');
  const [selectedDeadlineHour, setSelectedDeadlineHour] = useState<number>(23);
  const [selectedDeadlineMinute, setSelectedDeadlineMinute] = useState<number>(59);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // 直接使用全局传递进来的聚焦状态，并通过回调更新 Store
  const focusedTaskId = propFocusedTaskId;
  const setFocusedTaskId = (id: string | null) => {
    if (onSetFocusedTaskId) {
      onSetFocusedTaskId(id);
    }
  };
  const [addingSubtaskParentId, setAddingSubtaskParentId] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDescription, setNewSubtaskDescription] = useState('');
  const [subtaskPriority, setSubtaskPriority] = useState<TaskPriority>('medium');
  const [subtaskUrgency, setSubtaskUrgency] = useState<TaskUrgency>('low');
  const [subtaskDeadline, setSubtaskDeadline] = useState<number | null>(null);
  const [subtaskDeadlineType, setSubtaskDeadlineType] = useState<DeadlineType>('none');
  const [subtaskDeadlineHour, setSubtaskDeadlineHour] = useState<number>(23);
  const [subtaskDeadlineMinute, setSubtaskDeadlineMinute] = useState<number>(59);
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
        delta.x,
        focusedTaskId || null
      );
      if (result) {
        moveTaskNode(active.id as string, result.newParentId, result.anchorId, zone.id);
      }
    }
  };

  const handleAddTask = () => {
    if (newTaskTitle.trim() && zone) {
      onAddTask(zone.id, newTaskTitle.trim(), newTaskDescription.trim(), selectedPriority, selectedUrgency, selectedDeadline, selectedDeadlineType, focusedTaskId || null);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setSelectedDeadline(null);
      setSelectedDeadlineType('none');
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
      onAddTask(zone.id, newSubtaskTitle.trim(), newSubtaskDescription.trim(), subtaskPriority, subtaskUrgency, subtaskDeadline, subtaskDeadlineType, addingSubtaskParentId);
      setNewSubtaskTitle('');
      setNewSubtaskDescription('');
      setSubtaskDeadline(null);
      setSubtaskDeadlineType('none');
      // 保持输入框焦点，方便连续添加
      setTimeout(() => subtaskInputRef.current?.focus(), 0);
    }
  };

  // 处理取消添加子任务
  const handleCancelAddSubtask = () => {
    setAddingSubtaskParentId(null);
    setNewSubtaskTitle('');
    setNewSubtaskDescription('');
    setSubtaskDeadline(null);
    setSubtaskDeadlineType('none');
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
    // 直接使用完整扁平化数组，flattenedTasks 已经包含了所有应该显示的后代任务
    return flattenedTasks;
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
            {/* Deadline Selector */}
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-7 text-xs border-dashed ${selectedDeadlineType !== 'none' ? 'border-blue-500 text-blue-400' : ''}`}
                  >
                    <Calendar size={12} className="mr-1" />
                    {selectedDeadlineType === 'none' ? '截止日期' :
                      selectedDeadlineType === 'today' ? '今天' :
                      selectedDeadlineType === 'tomorrow' ? '明天' :
                      selectedDeadlineType === 'week' ? '本周' :
                      selectedDeadline ? new Date(selectedDeadline).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '截止日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2 bg-black border border-white/20 max-h-[90vh] overflow-y-auto z-[9999]" align="start" side="bottom" sideOffset={4} collisionPadding={20} onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 mb-2 border-b border-white/10 pb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={selectedDeadlineType === 'today' ? 'bg-white text-black hover:bg-white/90' : 'text-white hover:bg-white hover:text-black'}
                      onClick={() => {
                        const result = convertDeadlineType('today');
                        setSelectedDeadline(result.deadline);
                        setSelectedDeadlineType(result.deadlineType);
                      }}
                    >
                      今天
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={selectedDeadlineType === 'tomorrow' ? 'bg-white text-black hover:bg-white/90' : 'text-white hover:bg-white hover:text-black'}
                      onClick={() => {
                        const result = convertDeadlineType('tomorrow');
                        setSelectedDeadline(result.deadline);
                        setSelectedDeadlineType(result.deadlineType);
                      }}
                    >
                      明天
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={selectedDeadlineType === 'week' ? 'bg-white text-black hover:bg-white/90' : 'text-white hover:bg-white hover:text-black'}
                      onClick={() => {
                        const result = convertDeadlineType('week');
                        setSelectedDeadline(result.deadline);
                        setSelectedDeadlineType(result.deadlineType);
                      }}
                    >
                      本周
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={selectedDeadlineType === 'none' ? 'bg-white text-black hover:bg-white/90' : 'text-white hover:bg-white hover:text-black'}
                      onClick={() => {
                        setSelectedDeadline(null);
                        setSelectedDeadlineType('none');
                      }}
                    >
                      无
                    </Button>
                  </div>
                  <CalendarComponent
                    mode="single"
                    selected={selectedDeadline ? new Date(selectedDeadline) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        date.setHours(selectedDeadlineHour, selectedDeadlineMinute, 0, 0);
                        setSelectedDeadline(date.getTime());
                        setSelectedDeadlineType('exact');
                      }
                    }}
                    className="rounded-md my-2"
                    classNames={{
                      root: "calendar-dark",
                      months: "flex flex-col gap-1 relative",
                      month: "flex flex-col",
                      caption: "flex justify-center items-center py-1 relative",
                      caption_label: "text-sm font-medium text-white",
                      nav: "absolute inset-x-0 top-1 flex items-center justify-between w-full z-10 px-1",
                      nav_button: "h-6 w-6 bg-black p-0 text-white hover:bg-white hover:text-black rounded flex items-center justify-center transition-colors text-xs border border-white/20",
                      nav_button_previous: "",
                      nav_button_next: "",
                      table: "w-full border-collapse space-y-1",
                      head_row: "flex",
                      head_cell: "text-white/50 rounded-md w-9 font-normal text-[0.8rem]",
                      row: "flex w-full mt-1",
                      cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                      day: "h-9 w-9 p-0 font-normal text-white bg-black hover:bg-white hover:text-black rounded-md transition-colors",
                      day_selected: "bg-white text-black hover:bg-white hover:text-black",
                      day_today: "border border-green-500 text-green-400",
                      day_outside: "text-white/30 opacity-50",
                      day_disabled: "text-white/30 opacity-50",
                      day_hidden: "invisible",
                    }}
                  />
                  {/* 时间选择器 */}
                  <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-white/80">时间:</span>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={selectedDeadlineHour}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
                          setSelectedDeadlineHour(val);
                          if (selectedDeadline) {
                            const date = new Date(selectedDeadline);
                            date.setHours(val, selectedDeadlineMinute, 0, 0);
                            setSelectedDeadline(date.getTime());
                          }
                        }}
                        className="w-10 h-6 text-xs bg-black/60 border border-green-500/50 rounded px-1 text-center text-green-400 focus:border-green-400 focus:outline-none"
                      />
                      <span className="text-white/80">:</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={selectedDeadlineMinute}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                          setSelectedDeadlineMinute(val);
                          if (selectedDeadline) {
                            const date = new Date(selectedDeadline);
                            date.setHours(selectedDeadlineHour, val, 0, 0);
                            setSelectedDeadline(date.getTime());
                          }
                        }}
                        className="w-10 h-6 text-xs bg-black/60 border border-green-500/50 rounded px-1 text-center text-green-400 focus:border-green-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
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
            <Textarea
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述（可选，Shift+Enter 换行）..."
              className="add-task-desc-input min-h-[36px] py-2 resize-none"
              rows={1}
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
                setSelectedDeadline(null);
                setSelectedDeadlineType('none');
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
                        getTotalWorkTime={getTotalWorkTime}
                        getEstimatedTime={getEstimatedTime}
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
                            <Textarea
                              value={newSubtaskDescription}
                              onChange={(e) => setNewSubtaskDescription(e.target.value)}
                              onKeyDown={handleSubtaskKeyDown}
                              placeholder="描述（可选，Shift+Enter 换行）..."
                              className="min-h-[28px] text-sm text-white bg-transparent border-none focus-visible:ring-0 px-0 placeholder:text-white/30 resize-none py-1"
                              rows={1}
                            />
                            {/* 子任务支持优先级和截止日期设置 */}
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
                                {/* 子任务截止日期选择器 */}
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={`h-6 text-xs border-dashed ${subtaskDeadlineType !== 'none' ? 'border-blue-500 text-blue-400' : ''}`}
                                    >
                                      <Calendar size={10} className="mr-1" />
                                      {subtaskDeadlineType === 'none' ? 'DDL' :
                                        subtaskDeadlineType === 'today' ? '今天' :
                                        subtaskDeadlineType === 'tomorrow' ? '明天' :
                                        subtaskDeadlineType === 'week' ? '本周' :
                                        subtaskDeadline ? new Date(subtaskDeadline).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : 'DDL'}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-2 bg-black border border-white/20 max-h-[90vh] overflow-y-auto z-[9999]" align="start" side="bottom" sideOffset={4} collisionPadding={20} onClick={(e) => e.stopPropagation()}>
                                    <div className="flex gap-1 mb-2 border-b border-white/10 pb-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={subtaskDeadlineType === 'today' ? 'bg-white text-black hover:bg-white/90' : 'text-white hover:bg-white hover:text-black'}
                                        onClick={() => {
                                          const result = convertDeadlineType('today');
                                          setSubtaskDeadline(result.deadline);
                                          setSubtaskDeadlineType(result.deadlineType);
                                        }}
                                      >
                                        今天
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={subtaskDeadlineType === 'tomorrow' ? 'bg-white text-black hover:bg-white/90' : 'text-white hover:bg-white hover:text-black'}
                                        onClick={() => {
                                          const result = convertDeadlineType('tomorrow');
                                          setSubtaskDeadline(result.deadline);
                                          setSubtaskDeadlineType(result.deadlineType);
                                        }}
                                      >
                                        明天
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={subtaskDeadlineType === 'week' ? 'bg-white text-black hover:bg-white/90' : 'text-white hover:bg-white hover:text-black'}
                                        onClick={() => {
                                          const result = convertDeadlineType('week');
                                          setSubtaskDeadline(result.deadline);
                                          setSubtaskDeadlineType(result.deadlineType);
                                        }}
                                      >
                                        本周
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={subtaskDeadlineType === 'none' ? 'bg-white text-black hover:bg-white/90' : 'text-white hover:bg-white hover:text-black'}
                                        onClick={() => {
                                          setSubtaskDeadline(null);
                                          setSubtaskDeadlineType('none');
                                        }}
                                      >
                                        无
                                      </Button>
                                    </div>
                                    <CalendarComponent
                                      mode="single"
                                      selected={subtaskDeadline ? new Date(subtaskDeadline) : undefined}
                                      onSelect={(date) => {
                                        if (date) {
                                          date.setHours(subtaskDeadlineHour, subtaskDeadlineMinute, 0, 0);
                                          setSubtaskDeadline(date.getTime());
                                          setSubtaskDeadlineType('exact');
                                        }
                                      }}
                                      className="rounded-md my-2"
                                      classNames={{
                                        root: "calendar-dark",
                                        months: "flex flex-col gap-1 relative",
                                        month: "flex flex-col",
                                        caption: "flex justify-center items-center py-1 relative",
                                        caption_label: "text-sm font-medium text-white",
                                        nav: "absolute inset-x-0 top-1 flex items-center justify-between w-full z-10 px-1",
                                        nav_button: "h-6 w-6 bg-black p-0 text-white hover:bg-white hover:text-black rounded flex items-center justify-center transition-colors text-xs border border-white/20",
                                        nav_button_previous: "",
                                        nav_button_next: "",
                                        table: "w-full border-collapse space-y-1",
                                        head_row: "flex",
                                        head_cell: "text-white/50 rounded-md w-9 font-normal text-[0.8rem]",
                                        row: "flex w-full mt-1",
                                        cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                                        day: "h-9 w-9 p-0 font-normal text-white bg-black hover:bg-white hover:text-black rounded-md transition-colors",
                                        day_selected: "bg-white text-black hover:bg-white hover:text-black",
                                        day_today: "border border-green-500 text-green-400",
                                        day_outside: "text-white/30 opacity-50",
                                        day_disabled: "text-white/30 opacity-50",
                                        day_hidden: "invisible",
                                      }}
                                    />
                                    {/* 时间选择器 */}
                                    <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-white/80">时间:</span>
                                        <input
                                          type="number"
                                          min="0"
                                          max="23"
                                          value={subtaskDeadlineHour}
                                          onChange={(e) => {
                                            const val = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
                                            setSubtaskDeadlineHour(val);
                                            if (subtaskDeadline) {
                                              const date = new Date(subtaskDeadline);
                                              date.setHours(val, subtaskDeadlineMinute, 0, 0);
                                              setSubtaskDeadline(date.getTime());
                                            }
                                          }}
                                          className="w-10 h-6 text-xs bg-black/60 border border-green-500/50 rounded px-1 text-center text-green-400 focus:border-green-400 focus:outline-none"
                                        />
                                        <span className="text-white/80">:</span>
                                        <input
                                          type="number"
                                          min="0"
                                          max="59"
                                          value={subtaskDeadlineMinute}
                                          onChange={(e) => {
                                            const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                                            setSubtaskDeadlineMinute(val);
                                            if (subtaskDeadline) {
                                              const date = new Date(subtaskDeadline);
                                              date.setHours(subtaskDeadlineHour, val, 0, 0);
                                              setSubtaskDeadline(date.getTime());
                                            }
                                          }}
                                          className="w-10 h-6 text-xs bg-black/60 border border-green-500/50 rounded px-1 text-center text-green-400 focus:border-green-400 focus:outline-none"
                                        />
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
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
                      getTotalWorkTime={getTotalWorkTime}
                      getEstimatedTime={getEstimatedTime}
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
                          getTotalWorkTime={getTotalWorkTime}
                          getEstimatedTime={getEstimatedTime}
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
