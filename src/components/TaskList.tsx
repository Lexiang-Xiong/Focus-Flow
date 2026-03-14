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
import { Plus, CheckCircle2, Circle, Trash2, ChevronDown, ChevronRight, Home, Calendar, Network, ArrowUpDown, Flag, Zap, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { TaskItem } from './TaskItem';
import type { Task, TaskPriority, TaskUrgency, DeadlineType, Zone } from '@/types';
import { convertDeadlineType, getInheritedDeadline, calculateRankScores } from '@/lib/urgency-utils';
import { useAppStore } from '@/store';
import { getFlattenedTasks, calculateNewPosition, type FlattenedTask } from '@/lib/tree-utils';
import { useTranslation } from 'react-i18next';

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
  const { moveTaskNode, expandTask, getTotalWorkTime, getEstimatedTime, settings, updateSettings } = useAppStore();
  const { t, i18n } = useTranslation();

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

  // 从 settings 中获取视图模式状态
  const isLeafMode = settings.zoneViewLeafMode || false;
  const sortMode = settings.zoneViewSort?.mode || 'manual';

  const setIsLeafMode = (value: boolean) => {
    updateSettings({ zoneViewLeafMode: value });
  };

  const setSortMode = (val: 'manual' | 'priority' | 'urgency' | 'weighted' | 'workTime' | 'estimatedTime') => {
    updateSettings({
      zoneViewSort: { ...(settings.zoneViewSort || { priorityWeight: 0.6, deadlineWeight: 0.4 }), mode: val }
    });
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

  // --- Core logic: calculate display task list ---
  const processedDisplayTasks = useMemo(() => {
    // 1. Get base task set (if no focus, get all zone tasks; if focus, get all descendants)
    let baseTasks = tasks.filter(t => t.zoneId === zone?.id && !t.completed);

    if (focusedTaskId) {
      const getAllDescendants = (parentId: string): Task[] => {
        const children = tasks.filter(t => t.parentId === parentId && !t.completed);
        return [...children, ...children.flatMap(c => getAllDescendants(c.id))];
      };
      baseTasks = getAllDescendants(focusedTaskId);
    }

    // 2. Scenario A: Default tree manual sort mode
    if (sortMode === 'manual' && !isLeafMode) {
      return getFlattenedTasks(tasks, zone?.id || null, focusedTaskId).filter(t => !t.completed);
    }

    // Common sort function
    const applySort = (tasksToSort: Task[]) => {
      const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

      tasksToSort.sort((a, b) => {
        switch (sortMode) {
          case 'priority':
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          case 'urgency':
            const aDdl = getInheritedDeadline(a, tasks);
            const bDdl = getInheritedDeadline(b, tasks);
            if (!aDdl && !bDdl) return 0;
            if (!aDdl) return 1;
            if (!bDdl) return -1;
            return aDdl - bDdl;
          case 'workTime':
            return (b.totalWorkTime || 0) - (a.totalWorkTime || 0);
          case 'estimatedTime':
            return (b.estimatedTime || 0) - (a.estimatedTime || 0);
          case 'weighted': {
            // 获取最新的全局设置权重（适配本地模式，没有单设局部权重时使用全局）
            const state = useAppStore.getState();
            const pWeight = state.settings.zoneViewSort?.priorityWeight ?? state.settings.globalViewSort?.priorityWeight ?? 0.6;
            const dWeight = state.settings.zoneViewSort?.deadlineWeight ?? state.settings.globalViewSort?.deadlineWeight ?? 0.4;

            // 使用归一化的优先级分数：高=1, 中=0.5, 低=0
            const normPriorityA = (2 - priorityOrder[a.priority]) / 2;
            const normPriorityB = (2 - priorityOrder[b.priority]) / 2;

            const aEffective = getInheritedDeadline(a, tasks);
            const bEffective = getInheritedDeadline(b, tasks);

            // 使用 calculateRankScores 计算排名分数
            const rankScores = calculateRankScores(tasks);
            const aScoreDdl = aEffective ? (rankScores[a.id] || 0) : 0;
            const bScoreDdl = bEffective ? (rankScores[b.id] || 0) : 0;

            const aScore = normPriorityA * pWeight + aScoreDdl * dWeight;
            const bScore = normPriorityB * pWeight + bScoreDdl * dWeight;

            // 分数高的排在前面
            if (bScore !== aScore) return bScore - aScore;
            // 分数相同时，按实际 DDL（继承或自设）兜底
            return (aEffective || Infinity) - (bEffective || Infinity);
          }
          default:
            return 0;
        }
      });
    };

    // 3. Scenario B: Pure leaf node mode (flatten all levels, only keep nodes without children)
    if (isLeafMode) {
      const parentIds = new Set(tasks.filter(t => !t.completed && t.parentId).map(t => t.parentId));
      // Filter from ALL baseTasks, not just topLevel, so deep nested leaves can be found
      const leafTasks = baseTasks.filter(t => !parentIds.has(t.id));

      applySort(leafTasks);
      return leafTasks.map(t => ({ ...t, depth: 0 } as FlattenedTask));
    }

    // 4. Scenario C: Tree structure + specified sort (only sort top level, recursively attach children)
    const topLevelTasks = baseTasks.filter(t => focusedTaskId ? t.parentId === focusedTaskId : !t.parentId);
    applySort(topLevelTasks);

    const result: FlattenedTask[] = [];
    const appendChildren = (parentId: string, currentDepth: number) => {
      // Children keep original order sort, don't participate in advanced sorting
      const children = tasks.filter(t => t.parentId === parentId && !t.completed).sort((a, b) => a.order - b.order);
      for (const child of children) {
        result.push({ ...child, depth: currentDepth } as FlattenedTask);
        if (!child.isCollapsed) {
          appendChildren(child.id, currentDepth + 1);
        }
      }
    };

    for (const topTask of topLevelTasks) {
      result.push({ ...topTask, depth: 0 } as FlattenedTask);
      if (!topTask.isCollapsed) {
        appendChildren(topTask.id, 1);
      }
    }

    return result;
  }, [tasks, zone?.id, focusedTaskId, isLeafMode, sortMode]);

  // Derived state: whether in non-draggable special view
  const isSpecialView = isLeafMode || sortMode !== 'manual';

  // 检查任务是否有子任务
  const checkHasChildren = (taskId: string): boolean => {
    return tasks.some(t => t.parentId === taskId && !t.completed);
  };

  // 获取任务的面包屑路径（所有祖先任务）
  const getTaskBreadcrumbs = (taskId: string): Task[] => {
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
    return path;
  };

  if (!zone) {
    return (
      <div className="task-list-empty">
        <p>{t('zone.noZones')}</p>
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
      <div className="task-list-header flex items-center justify-between gap-2 pb-2 border-b border-white/5">
        <div className="task-list-title flex-1 min-w-0 flex items-center gap-2">
          <div className="zone-color-badge shrink-0" style={{ backgroundColor: zone.color }} />
          <span className="truncate" title={zone.name}>{zone.name}</span>
          <span className="task-count shrink-0 text-xs text-white/50">
            ({stats.completed}/{stats.total})
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2 ${isLeafMode ? 'bg-blue-500/10 text-blue-400' : 'text-white/40 hover:text-white'}`}
            onClick={() => {
              if (!isLeafMode) {
                // 从树状切换到叶子模式：如果当前是手动排序，自动切换到加权排序
                if (sortMode === 'manual') {
                  setSortMode('weighted');
                }
              }
              setIsLeafMode(!isLeafMode);
            }}
          >
            <Network size={14} className={isLeafMode ? "" : "opacity-70"} />
          </Button>
          <Select value={sortMode} onValueChange={(val: any) => {
            // 如果切换到手动排序，自动退出叶子节点模式
            if (val === 'manual' && isLeafMode) {
              setIsLeafMode(false);
            }
            setSortMode(val);
          }}>
            <SelectTrigger className="h-7 px-2 min-w-[32px] border border-white/10 bg-black/40 text-white/60 hover:text-white">
              {sortMode === 'manual' ? <ArrowUpDown size={14} /> :
               sortMode === 'priority' ? <Flag size={14} className="text-red-400"/> :
               sortMode === 'urgency' ? <Zap size={14} className="text-orange-400" /> :
               sortMode === 'weighted' ? <><Flag size={14} className="text-red-400"/><Zap size={14} className="text-orange-400"/></> :
               <Clock size={14} className="text-blue-400" />}
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="manual">
                <div className="sort-option flex items-center gap-2">
                  <ArrowUpDown size={14} />
                  <span>{t('view.sortManual')}</span>
                </div>
              </SelectItem>
              <SelectItem value="priority">
                <div className="sort-option flex items-center gap-2">
                  <Flag size={14} className="text-red-400" />
                  <span>{t('view.sortByPriority')}</span>
                </div>
              </SelectItem>
              <SelectItem value="urgency">
                <div className="sort-option flex items-center gap-2">
                  <Zap size={14} className="text-orange-400" />
                  <span>{t('view.sortByUrgency')}</span>
                </div>
              </SelectItem>
              <SelectItem value="weighted">
                <div className="sort-option flex items-center gap-2">
                  <Flag size={14} className="text-red-400" />
                  <Zap size={14} className="text-orange-400" />
                  <span>{t('settings.weightedSort')}</span>
                </div>
              </SelectItem>
              <SelectItem value="workTime">
                <div className="sort-option flex items-center gap-2">
                  <Clock size={14} className="text-blue-400" />
                  <span>{t('view.sortByWorkTime')}</span>
                </div>
              </SelectItem>
              <SelectItem value="estimatedTime">
                <div className="sort-option flex items-center gap-2">
                  <Clock size={14} className="text-purple-400" />
                  <span>{t('view.sortByEstimatedTime')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
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
                    {selectedDeadlineType === 'none' ? t('task.deadline') :
                      selectedDeadlineType === 'today' ? t('task.deadlineToday') :
                      selectedDeadlineType === 'tomorrow' ? t('task.deadlineTomorrow') :
                      selectedDeadlineType === 'week' ? t('task.deadlineWeek') :
                      selectedDeadline ? new Date(selectedDeadline).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' }) : t('task.deadline')}
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
                      {t('task.deadlineToday')}
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
                      {t('task.deadlineTomorrow')}
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
                      {t('task.deadlineWeek')}
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
                      {t('task.deadlineNone')}
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
                      <span className="text-xs text-white/80">{t('task.time')}:</span>
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
              placeholder={t('task.taskTitle') + '...'}
              className="add-task-title-input"
            />
            <Textarea
              value={newTaskDescription}
              onChange={(e) => setNewTaskDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('task.descriptionOptional')}
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
          <span>{t('task.addTask')}</span>
        </button>
      )}

      {/* Task List */}
      <ScrollArea className="task-scroll-area">
        <div className="tasks-container">
          {incompleteTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="empty-state">
              <Circle size={48} className="empty-icon" />
              <p>{t('task.noTasks')}</p>
              <p className="empty-hint">{t('task.doubleClickHint')}</p>
            </div>
          ) : (
            <>
              {/* 特殊视图：禁用拖拽，添加面包屑上下文 */}
              {isSpecialView ? (
                <div className="flex flex-col gap-1">
                  {processedDisplayTasks.map((task) => {
                    const breadcrumbs = getTaskBreadcrumbs(task.id);
                    return (
                    <div key={task.id} className="relative">
                      {/* 完整面包屑路径：父任务1 > 父任务2 > ... */}
                      {isLeafMode && breadcrumbs.length > 0 && (
                        <div className="flex items-center gap-1 pl-2 text-[10px] text-white/30 mb-0.5 leading-none">
                          {breadcrumbs.map((crumb, i) => (
                            <span key={crumb.id} className="flex items-center gap-1">
                              <span className="truncate max-w-[100px]" title={crumb.title}>
                                {crumb.title}
                              </span>
                              {i < breadcrumbs.length - 1 && <ChevronRight size={10} />}
                            </span>
                          ))}
                        </div>
                      )}
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
                        onSelect={onSelectTask}
                        onZoomIn={(id) => setFocusedTaskId(id)}
                        hasChildren={!isLeafMode && tasks.some(t => t.parentId === task.id && !t.completed)}
                        depth={task.depth}
                        isDraggable={false}
                        getTotalWorkTime={getTotalWorkTime}
                        getEstimatedTime={getEstimatedTime}
                      />
                    </div>
                  );
                  })}
                </div>
              ) : (
                /* 默认视图：保留拖拽功能 */
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={processedDisplayTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {processedDisplayTasks.map((task) => (
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
                                  placeholder={t('task.subtaskTitle')}
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
                              placeholder={t('task.descriptionOptional')}
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
                                      {subtaskDeadlineType === 'none' ? t('recurring.ddl') :
                                        subtaskDeadlineType === 'today' ? t('task.deadlineToday') :
                                        subtaskDeadlineType === 'tomorrow' ? t('task.deadlineTomorrow') :
                                        subtaskDeadlineType === 'week' ? t('task.deadlineWeek') :
                                        subtaskDeadline ? new Date(subtaskDeadline).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric' }) : t('recurring.ddl')}
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
                                        {t('task.deadlineToday')}
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
                                        {t('task.deadlineTomorrow')}
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
                                        {t('task.deadlineWeek')}
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
                                        {t('task.deadlineNone')}
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
                                        <span className="text-xs text-white/80">{t('task.time')}:</span>
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
                                {t('common.cancel')}
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
              )}

              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <div className="completed-section">
                  <button
                    className="completed-toggle"
                    onClick={() => setShowCompleted(!showCompleted)}
                  >
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span>{t('task.completed')} ({completedTasks.length})</span>
                    <span className={`toggle-arrow ${showCompleted ? 'open' : ''}`}>
                      ▼
                    </span>
                  </button>

                  {showCompleted && (
                    <div className="completed-tasks">
                      {completedTasks.map((task) => (
                        <div key={task.id} className="task-tree-item relative mb-1">
                          {/* 添加父级任务标题提示，防止打平后不知道是哪个任务的子项 */}
                          {task.parentId && (
                            <div className="flex items-center gap-1 pl-7 pr-2 text-[10px] text-white/40 mb-0.5 leading-none">
                              <span className="truncate max-w-[150px]">{tasks.find(t => t.id === task.parentId)?.title || '...'}</span>
                            </div>
                          )}
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
                            hasChildren={false}
                            depth={0}
                            isDraggable={false}
                            getTotalWorkTime={getTotalWorkTime}
                            getEstimatedTime={getEstimatedTime}
                          />
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="clear-completed-btn"
                        onClick={onClearCompleted}
                      >
                        <Trash2 size={14} className="mr-1" />
                        {t('task.clearCompleted')}
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
          <span className="stat-label">{t('task.completionRate')}</span>
          <span className="stat-value">{stats.completionRate}%</span>
        </div>
        <div className="footer-stat">
          <span className="stat-label">{t('task.pending')}</span>
          <span className="stat-value">{stats.pending}</span>
        </div>
      </div>
    </div>
  );
}
