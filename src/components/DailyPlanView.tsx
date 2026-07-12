import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePickerPopover } from './DatePickerPopover';
import { SpanFormDialog } from './SpanFormDialog';
import { DailyPlanBacklog } from './DailyPlanBacklog';
import { DailyPlanSchedule } from './DailyPlanSchedule';
import { DailyPlanSpanFocus } from './DailyPlanSpanFocus';
import type { PlanGroup, Task, Zone, DailyPlanSpan } from '@/types';
import { isDateInPlanGroupRange } from '@/store/slices/executionPlanSlice';
import { useAppStore } from '@/store';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';

import { GripVertical } from 'lucide-react';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

interface DailyPlanViewProps {
  planGroups: PlanGroup[];
  tasks: Task[];
  zones: Zone[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  onToggleTask: (taskId: string) => void;
  onNavigateToZone: (zoneId: string, taskId?: string) => void;
  onRemoveTaskFromDailyPlan: (taskId: string, date: string) => void;
  onAddTasksToDailyPlan: (taskIds: string[], date: string) => void;
  onSetDailyPlanOrder: (taskId: string, date: string, order: number) => void;
  onMoveTaskToSpan: (taskId: string, date: string, spanId: string, order?: number) => void;
  onMoveTaskOutOfSpan: (taskId: string, date: string, spanId: string) => void;
  onSetDailyPlanSpanOrder: (taskId: string, date: string, spanId: string, order: number) => void;
  onCreateSpan: (date: string, startHour: number, endHour: number, description?: string) => string | null;
  onUpdateSpan: (spanId: string, updates: Partial<Omit<DailyPlanSpan, 'id'>>) => boolean;
  onDeleteSpan: (spanId: string) => void;
  spans: DailyPlanSpan[];
  layout?: 'vertical' | 'horizontal';
}

function getZoneById(zones: Zone[], zoneId: string): Zone | undefined {
  return zones.find(z => z.id === zoneId);
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface AddFromPlanGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planGroups: PlanGroup[];
  tasks: Task[];
  zones: Zone[];
  selectedDate: string;
  onAdd: (taskIds: string[]) => void;
}

function AddFromPlanGroupDialog({
  open,
  onOpenChange,
  planGroups,
  tasks,
  zones,
  selectedDate,
  onAdd,
}: AddFromPlanGroupDialogProps) {
  const { t } = useTranslation();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const availableGroups = useMemo(
    () => planGroups.filter(g => isDateInPlanGroupRange(g, selectedDate)).sort((a, b) => a.order - b.order),
    [planGroups, selectedDate]
  );

  const groupTasks = useMemo(() => {
    if (!selectedGroupId) return [];
    return tasks.filter(t => t.planGroupIds?.includes(selectedGroupId));
  }, [selectedGroupId, tasks]);

  const toggleTask = (id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    onAdd(Array.from(selectedTaskIds));
    setSelectedGroupId(null);
    setSelectedTaskIds(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        setSelectedGroupId(null);
        setSelectedTaskIds(new Set());
      }
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-md p-4 bg-[#1a1a24] border-white/10 text-white text-[11px]">
        <DialogHeader>
          <DialogTitle className="text-[12px]">{t('view.addFromPlanGroup')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          {availableGroups.length === 0 ? (
            <div className="text-[10px] text-white/50 text-center py-4">{t('view.noPlanGroups')}</div>
          ) : (
            availableGroups.map(group => (
              <button
                key={group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setSelectedTaskIds(new Set());
                }}
                className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                  selectedGroupId === group.id
                    ? 'bg-white/15 border-white/30'
                    : 'bg-black/20 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="font-medium text-[11px]">{group.name}</div>
                <div className="text-[10px] text-white/50">
                  {group.startDate || group.endDate
                    ? `${group.startDate ?? ''} ~ ${group.endDate ?? ''}`
                    : t('view.noDate')}
                  {' · '}
                  {t('view.tasksCount', { count: tasks.filter(t => t.planGroupIds?.includes(group.id)).length })}
                </div>
              </button>
            ))
          )}

          {selectedGroupId && groupTasks.length > 0 && (
            <div className="border-t border-white/10 pt-3 space-y-2">
              {groupTasks.map(task => {
                const zone = getZoneById(zones, task.zoneId);
                return (
                  <label
                    key={task.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedTaskIds.has(task.id)}
                      onCheckedChange={() => toggleTask(task.id)}
                      className="border-white/30"
                    />
                    <span className={`flex-1 text-[11px] truncate ${task.completed ? 'line-through text-white/40' : 'text-white/90'}`}>
                      {task.title}
                    </span>
                    {zone && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: zone.color }}
                        title={zone.name}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" className="h-7 text-[11px]" disabled={selectedTaskIds.size === 0} onClick={handleAdd}>
            {t('common.add')} ({selectedTaskIds.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DailyPlanView({
  planGroups,
  tasks,
  zones,
  selectedDate,
  onDateChange,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromDailyPlan,
  onAddTasksToDailyPlan,
  onSetDailyPlanOrder,
  onMoveTaskToSpan,
  onMoveTaskOutOfSpan,
  onSetDailyPlanSpanOrder,
  onCreateSpan,
  onUpdateSpan,
  onDeleteSpan,
  spans,
  layout = 'vertical',
}: DailyPlanViewProps) {
  const { t } = useTranslation();
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);
  const viewState = settings.dailyPlanViewState;

  const setViewState = useCallback((patch: Partial<typeof viewState>) => {
    updateSettings({ dailyPlanViewState: { ...viewState, ...patch } });
  }, [updateSettings, viewState]);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSpanDialog, setShowSpanDialog] = useState(false);
  const [spanDialogInitial, setSpanDialogInitial] = useState<{ startHour?: number; endHour?: number }>({});
  const [focusedSpanId, setFocusedSpanId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalContainerRef = useRef<HTMLDivElement>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [lastLeftWidth, setLastLeftWidth] = useState(() => (viewState.executionSplitRatio ?? 0.4) * 100);
  const pendingRatioRef = useRef(viewState.executionSplitRatio ?? 0.4);

  const [containerHeight, setContainerHeight] = useState(0);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);
  const [liveSplitRatio, setLiveSplitRatio] = useState<number | null>(null);
  const scrollDebounceRef = useRef<number | null>(null);
  const splitterRatioRef = useRef(viewState.splitRatio ?? 0.5);

  const backlogExpanded = viewState.backlogExpanded ?? true;
  const scheduleExpanded = viewState.scheduleExpanded ?? false;
  const hourHeight = viewState.hourHeight ?? 48;
  const splitRatio = liveSplitRatio ?? (viewState.splitRatio ?? 0.5);
  const scheduleScrollTop = viewState.scrollTop ?? 0;

  const leftWidth = useMemo(() => {
    if (leftCollapsed) return 5;
    if (rightCollapsed) return 95;
    return Math.max(20, Math.min(80, lastLeftWidth));
  }, [leftCollapsed, rightCollapsed, lastLeftWidth]);

  const handleHourHeightChange = (value: number) => {
    setViewState({ hourHeight: value });
  };

  const handleScheduleScroll = (scrollTop: number) => {
    if (scrollDebounceRef.current) {
      window.clearTimeout(scrollDebounceRef.current);
    }
    scrollDebounceRef.current = window.setTimeout(() => {
      setViewState({ scrollTop });
    }, 200);
  };

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    if (leftCollapsed || rightCollapsed) return;
    e.preventDefault();
    const container = horizontalContainerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    if (containerWidth <= 0) return;

    const startX = e.clientX;
    const startWidth = lastLeftWidth;
    pendingRatioRef.current = startWidth / 100;

    const handleMouseMove = (ev: MouseEvent) => {
      const deltaPercent = ((ev.clientX - startX) / containerWidth) * 100;
      const next = Math.max(20, Math.min(80, startWidth + deltaPercent));
      pendingRatioRef.current = next / 100;
      setLastLeftWidth(next);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setViewState({ executionSplitRatio: pendingRatioRef.current });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    setContainerHeight(el.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);



  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (layout === 'horizontal') {
      setLeftCollapsed(false);
      setRightCollapsed(false);
      if (!backlogExpanded || !scheduleExpanded) {
        setViewState({ backlogExpanded: true, scheduleExpanded: true });
      }
    }
  }, [layout, backlogExpanded, scheduleExpanded, setViewState]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    return () => {
      if (scrollDebounceRef.current) {
        window.clearTimeout(scrollDebounceRef.current);
      }
    };
  }, []);

  const TITLE_HEIGHT = 40;
  const SPLITTER_HEIGHT = 4;
  const MIN_CONTENT_HEIGHT = 60;

  const panelHeights = useMemo(() => {
    const h = containerHeight;
    if (h <= 0) return { backlog: undefined, schedule: undefined };

    if (!backlogExpanded && !scheduleExpanded) {
      const half = Math.max(TITLE_HEIGHT, (h - SPLITTER_HEIGHT) / 2);
      return { backlog: half, schedule: half };
    }
    if (backlogExpanded && !scheduleExpanded) {
      return {
        backlog: Math.max(TITLE_HEIGHT + MIN_CONTENT_HEIGHT, h - SPLITTER_HEIGHT - TITLE_HEIGHT),
        schedule: TITLE_HEIGHT,
      };
    }
    if (!backlogExpanded && scheduleExpanded) {
      return {
        backlog: TITLE_HEIGHT,
        schedule: Math.max(TITLE_HEIGHT + MIN_CONTENT_HEIGHT, h - SPLITTER_HEIGHT - TITLE_HEIGHT),
      };
    }

    const available = h - 2 * TITLE_HEIGHT - SPLITTER_HEIGHT;
    if (available < 2 * MIN_CONTENT_HEIGHT) {
      const half = Math.max(MIN_CONTENT_HEIGHT, available / 2);
      return {
        backlog: TITLE_HEIGHT + half,
        schedule: TITLE_HEIGHT + half,
      };
    }
    const backlogContent = Math.max(
      MIN_CONTENT_HEIGHT,
      Math.min(available - MIN_CONTENT_HEIGHT, available * splitRatio)
    );
    return {
      backlog: TITLE_HEIGHT + backlogContent,
      schedule: h - TITLE_HEIGHT - backlogContent - SPLITTER_HEIGHT,
    };
  }, [containerHeight, backlogExpanded, scheduleExpanded, splitRatio]);

  const handleToggleBacklog = () => {
    if (layout === 'horizontal') {
      if (leftCollapsed) {
        setLeftCollapsed(false);
      } else {
        setRightCollapsed(false);
        setLeftCollapsed(true);
        setLastLeftWidth(leftWidth);
      }
      return;
    }

    if (backlogExpanded) {
      if (scheduleExpanded) {
        setViewState({ backlogExpanded: false });
      } else {
        setViewState({ backlogExpanded: false, scheduleExpanded: true });
      }
    } else {
      setViewState({ backlogExpanded: true });
    }
  };

  const handleToggleSchedule = () => {
    if (layout === 'horizontal') {
      if (rightCollapsed) {
        setRightCollapsed(false);
      } else {
        setLeftCollapsed(false);
        setRightCollapsed(true);
        setLastLeftWidth(leftWidth);
      }
      return;
    }

    if (scheduleExpanded) {
      if (backlogExpanded) {
        setViewState({ scheduleExpanded: false });
      } else {
        setViewState({ scheduleExpanded: false, backlogExpanded: true });
      }
    } else {
      setViewState({ scheduleExpanded: true });
    }
  };

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!backlogExpanded || !scheduleExpanded) return;
    setIsDraggingSplitter(true);
    const container = containerRef.current;
    if (!container) return;
    const startY = e.clientY;
    const startRatio = viewState.splitRatio ?? 0.5;
    setLiveSplitRatio(startRatio);
    splitterRatioRef.current = startRatio;

    const handleMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const available = rect.height - 2 * TITLE_HEIGHT - SPLITTER_HEIGHT;
      const deltaY = ev.clientY - startY;
      const nextRatio = Math.max(0.15, Math.min(0.85, startRatio + deltaY / available));
      splitterRatioRef.current = nextRatio;
      setLiveSplitRatio(nextRatio);
    };

    const handleMouseUp = () => {
      setIsDraggingSplitter(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setLiveSplitRatio(null);
      setViewState({ splitRatio: splitterRatioRef.current });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const dailyTasks = useMemo(
    () => tasks.filter(t => t.plannedDates?.includes(selectedDate)),
    [tasks, selectedDate]
  );

  const backlogTasks = useMemo(
    () => dailyTasks
      .sort((a, b) => (a.dailyPlanOrder?.[selectedDate] ?? Infinity) - (b.dailyPlanOrder?.[selectedDate] ?? Infinity)),
    [dailyTasks, selectedDate]
  );

  const dateSpans = useMemo(
    () => spans
      .filter(s => s.date === selectedDate)
      .sort((a, b) => a.startHour - b.startHour),
    [spans, selectedDate]
  );

  const getTaskLocation = (taskId: string): { type: 'backlog' | 'span'; spanIds: string[] } => {
    const task = dailyTasks.find(t => t.id === taskId);
    if (!task) return { type: 'backlog', spanIds: [] };
    const spanIds = task.dailyPlanSpanIds?.[selectedDate] || [];
    return spanIds.length > 0 ? { type: 'span', spanIds } : { type: 'backlog', spanIds: [] };
  };

  const getTaskListForReorder = (spanId?: string): Task[] => {
    if (!spanId) return backlogTasks;
    return dailyTasks
      .filter(t => t.dailyPlanSpanIds?.[selectedDate]?.includes(spanId))
      .sort((a, b) => (a.dailyPlanSpanOrder?.[selectedDate]?.[spanId] ?? Infinity) - (b.dailyPlanSpanOrder?.[selectedDate]?.[spanId] ?? Infinity));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeLocation = getTaskLocation(activeId);
    const overLocation = getTaskLocation(overId);

    // 1. 拖到单日任务栏 drop target：从所有 span 中移除（保留在单日计划中）
    if (overId === 'daily-plan-backlog') {
      activeLocation.spanIds.forEach(spanId => {
        onMoveTaskOutOfSpan(activeId, selectedDate, spanId);
      });
      return;
    }

    // 2. 拖到 span drop target（日程中的 TimeSpan）
    if (overId.startsWith('span-') && !overId.startsWith('span-focus-')) {
      const spanId = overId.replace('span-', '');
      if (!activeLocation.spanIds.includes(spanId)) {
        onMoveTaskToSpan(activeId, selectedDate, spanId);
      }
      return;
    }

    // 3. 拖到 Focus 子页面的 span drop target
    if (overId.startsWith('span-focus-')) {
      const spanId = overId.replace('span-focus-', '');
      if (!activeLocation.spanIds.includes(spanId)) {
        onMoveTaskToSpan(activeId, selectedDate, spanId);
      }
      return;
    }

    // 4. over 是某个任务

    // 4a. 都在单日任务栏：排序
    if (activeLocation.spanIds.length === 0 && overLocation.spanIds.length === 0) {
      const oldIndex = backlogTasks.findIndex(t => t.id === activeId);
      const newIndex = backlogTasks.findIndex(t => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(backlogTasks, oldIndex, newIndex);
      reordered.forEach((task, index) => {
        const order = index + 1;
        if (task.dailyPlanOrder?.[selectedDate] !== order) {
          onSetDailyPlanOrder(task.id, selectedDate, order);
        }
      });
      return;
    }

    // 4b. active 在 span，over 在单日任务栏：从 active 所在 span 中移除
    if (activeLocation.spanIds.length > 0 && overLocation.spanIds.length === 0) {
      // 当任务同时在多个 span 时，简单起见只移除其第一个 span
      onMoveTaskOutOfSpan(activeId, selectedDate, activeLocation.spanIds[0]);
      return;
    }

    // 4c. active 在单日任务栏，over 在 span：移入该 span
    if (activeLocation.spanIds.length === 0 && overLocation.spanIds.length > 0) {
      const targetSpanId = overLocation.spanIds[0];
      const spanTasks = getTaskListForReorder(targetSpanId);
      const newIndex = spanTasks.findIndex(t => t.id === overId);
      const order = newIndex >= 0 ? newIndex + 1 : spanTasks.length + 1;
      onMoveTaskToSpan(activeId, selectedDate, targetSpanId, order);
      return;
    }

    // 4d. 都在同一个 span：内部排序
    const sharedSpanId = activeLocation.spanIds.find(id => overLocation.spanIds.includes(id));
    if (sharedSpanId) {
      const spanTasks = getTaskListForReorder(sharedSpanId);
      const oldIndex = spanTasks.findIndex(t => t.id === activeId);
      const newIndex = spanTasks.findIndex(t => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(spanTasks, oldIndex, newIndex);
      reordered.forEach((task, index) => {
        const order = index + 1;
        if (task.dailyPlanSpanOrder?.[selectedDate]?.[sharedSpanId] !== order) {
          onSetDailyPlanSpanOrder(task.id, selectedDate, sharedSpanId, order);
        }
      });
      return;
    }

    // 4e. active 在 span A，over 在 span B：移入 B 并排序
    if (activeLocation.spanIds.length > 0 && overLocation.spanIds.length > 0) {
      const targetSpanId = overLocation.spanIds[0];
      const spanTasks = getTaskListForReorder(targetSpanId);
      const newIndex = spanTasks.findIndex(t => t.id === overId);
      const order = newIndex >= 0 ? newIndex + 1 : spanTasks.length + 1;
      onMoveTaskToSpan(activeId, selectedDate, targetSpanId, order);
    }
  };

  const handleOpenSpanDialog = (startHour?: number, endHour?: number) => {
    setSpanDialogInitial({ startHour, endHour });
    setShowSpanDialog(true);
  };

  const handleCreateSpan = (startHour: number, endHour: number, description?: string) => {
    onCreateSpan(selectedDate, startHour, endHour, description);
  };

  const focusedSpan = useMemo(
    () => dateSpans.find(s => s.id === focusedSpanId) || null,
    [dateSpans, focusedSpanId]
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div className="flex flex-col h-full">
      {/* Date navigator */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-white/10 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-white/70 hover:text-white hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                onDateChange(addDays(selectedDate, -1));
              }}
            >
              <ChevronLeft size={14} />
            </Button>
            <DatePickerPopover
              selected={selectedDate}
              onSelect={(date) => date && onDateChange(date)}
              placeholder={t('view.startDate')}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-white/70 hover:text-white hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                onDateChange(addDays(selectedDate, 1));
              }}
            >
              <ChevronRight size={14} />
            </Button>
          </div>

          {selectedDate === today && (
            <span className="text-[10px] px-1.5 py-0 rounded bg-green-500/20 text-green-400 border border-green-500/30 shrink-0">
              {t('task.deadlineToday')}
            </span>
          )}
        </div>

        <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)} className="h-7 text-[11px] shrink-0">
          <Plus size={14} className="mr-1" />
          {t('view.addFromPlanGroup')}
        </Button>
      </div>

      {/* Backlog + Schedule */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {layout === 'horizontal' ? (
          <div ref={horizontalContainerRef} className="flex-1 min-h-0 min-w-0 flex overflow-hidden">
            <div className="h-full overflow-hidden" style={{ width: `${leftWidth}%` }}>
              <DailyPlanBacklog
                date={selectedDate}
                tasks={backlogTasks}
                zones={zones}
                expanded={!leftCollapsed}
                collapsed={leftCollapsed}
                layout={layout}
                style={{ height: '100%' }}
                onToggleExpanded={handleToggleBacklog}
                onToggleTask={onToggleTask}
                onNavigateToZone={onNavigateToZone}
                onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
              />
            </div>

            <div
              className="relative z-10 h-full w-2 cursor-col-resize bg-white/10 hover:bg-white/20 active:bg-white/30 flex items-center justify-center transition-colors select-none"
              onMouseDown={handleDividerMouseDown}
            >
              <div className="flex h-4 w-3 items-center justify-center rounded border bg-border">
                <GripVertical size={10} className="text-white/40" />
              </div>
            </div>

            <div className="h-full flex-1 min-w-0 overflow-hidden">
              {focusedSpan ? (
                <DailyPlanSpanFocus
                  span={focusedSpan}
                  tasks={dailyTasks}
                  zones={zones}
                  onBack={() => setFocusedSpanId(null)}
                  onToggleTask={onToggleTask}
                  onNavigateToZone={onNavigateToZone}
                  onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
                  onMoveTaskOutOfSpan={onMoveTaskOutOfSpan}
                  onUpdateSpan={onUpdateSpan}
                  onDeleteSpan={(spanId) => {
                    onDeleteSpan(spanId);
                    setFocusedSpanId(null);
                  }}
                />
              ) : (
                <DailyPlanSchedule
                  date={selectedDate}
                  spans={dateSpans}
                  tasks={dailyTasks}
                  expanded={!rightCollapsed}
                  collapsed={rightCollapsed}
                  layout={layout}
                  style={{ height: '100%' }}
                  onToggleExpanded={handleToggleSchedule}
                  hourHeight={hourHeight}
                  onHourHeightChange={handleHourHeightChange}
                  onDeleteSpan={onDeleteSpan}
                  onUpdateSpan={onUpdateSpan}
                  onEnterFocus={setFocusedSpanId}
                  onOpenSpanDialog={handleOpenSpanDialog}
                  scrollTop={scheduleScrollTop}
                  onScroll={handleScheduleScroll}
                />
              )}
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
            <DailyPlanBacklog
              date={selectedDate}
              tasks={backlogTasks}
              zones={zones}
              expanded={backlogExpanded}
              style={{ height: panelHeights.backlog }}
              onToggleExpanded={handleToggleBacklog}
              onToggleTask={onToggleTask}
              onNavigateToZone={onNavigateToZone}
              onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
            />

            {backlogExpanded && scheduleExpanded && (
              <div
                role="separator"
                aria-orientation="horizontal"
                onMouseDown={handleSplitterMouseDown}
                className={`shrink-0 w-full bg-white/10 hover:bg-white/30 transition-colors ${
                  isDraggingSplitter ? 'bg-white/40' : ''
                }`}
                style={{ height: SPLITTER_HEIGHT, cursor: 'row-resize' }}
              />
            )}

            {focusedSpan ? (
              <DailyPlanSpanFocus
                span={focusedSpan}
                tasks={dailyTasks}
                zones={zones}
                onBack={() => setFocusedSpanId(null)}
                onToggleTask={onToggleTask}
                onNavigateToZone={onNavigateToZone}
                onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
                onMoveTaskOutOfSpan={onMoveTaskOutOfSpan}
                onUpdateSpan={onUpdateSpan}
                onDeleteSpan={(spanId) => {
                  onDeleteSpan(spanId);
                  setFocusedSpanId(null);
                }}
              />
            ) : (
              <DailyPlanSchedule
                date={selectedDate}
                spans={dateSpans}
                tasks={dailyTasks}
                expanded={scheduleExpanded}
                style={{ height: panelHeights.schedule }}
                onToggleExpanded={handleToggleSchedule}
                hourHeight={hourHeight}
                onHourHeightChange={handleHourHeightChange}
                onDeleteSpan={onDeleteSpan}
                onUpdateSpan={onUpdateSpan}
                onEnterFocus={setFocusedSpanId}
                onOpenSpanDialog={handleOpenSpanDialog}
                scrollTop={scheduleScrollTop}
                onScroll={handleScheduleScroll}
              />
            )}
          </div>
        )}
      </DndContext>

      <AddFromPlanGroupDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        planGroups={planGroups}
        tasks={tasks}
        zones={zones}
        selectedDate={selectedDate}
        onAdd={(taskIds) => onAddTasksToDailyPlan(taskIds, selectedDate)}
      />

      <SpanFormDialog
        open={showSpanDialog}
        onOpenChange={setShowSpanDialog}
        initialStartHour={spanDialogInitial.startHour}
        initialEndHour={spanDialogInitial.endHour}
        onSubmit={handleCreateSpan}
      />
    </div>
  );
}
