import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePickerPopover } from './DatePickerPopover';
import { SpanFormDialog } from './SpanFormDialog';
import { DailyPlanBacklog } from './DailyPlanBacklog';
import { DailyPlanSchedule } from './DailyPlanSchedule';
import type { PlanGroup, Task, Zone } from '@/types';
import { isDateInPlanGroupRange } from '@/store/slices/executionPlanSlice';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
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
  onMoveTaskOutOfSpan: (taskId: string, date: string) => void;
  onSetDailyPlanSpanOrder: (taskId: string, spanId: string, order: number) => void;
  onCreateSpan: (date: string, startHour: number, endHour: number) => string | null;
  onDeleteSpan: (spanId: string) => void;
  spans: { id: string; date: string; startHour: number; endHour: number; createdAt: number }[];
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
      <DialogContent className="sm:max-w-md bg-[#1a1a24] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>{t('view.addFromPlanGroup')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          {availableGroups.length === 0 ? (
            <div className="text-sm text-white/50 text-center py-4">{t('view.noPlanGroups')}</div>
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
                <div className="font-medium text-sm">{group.name}</div>
                <div className="text-xs text-white/50">
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
                    <span className={`flex-1 text-sm truncate ${task.completed ? 'line-through text-white/40' : 'text-white/90'}`}>
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={selectedTaskIds.size === 0} onClick={handleAdd}>
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
  onDeleteSpan,
  spans,
}: DailyPlanViewProps) {
  const { t } = useTranslation();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSpanDialog, setShowSpanDialog] = useState(false);
  const [spanDialogInitial, setSpanDialogInitial] = useState<{ startHour?: number; endHour?: number }>({});

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
      .filter(t => !t.dailyPlanSpanIds?.[selectedDate])
      .sort((a, b) => (a.dailyPlanOrder?.[selectedDate] ?? Infinity) - (b.dailyPlanOrder?.[selectedDate] ?? Infinity)),
    [dailyTasks, selectedDate]
  );

  const dateSpans = useMemo(
    () => spans
      .filter(s => s.date === selectedDate)
      .sort((a, b) => a.startHour - b.startHour),
    [spans, selectedDate]
  );

  const getTaskLocation = (taskId: string): { type: 'backlog' | 'span'; spanId?: string } => {
    const task = dailyTasks.find(t => t.id === taskId);
    if (!task) return { type: 'backlog' };
    const spanId = task.dailyPlanSpanIds?.[selectedDate];
    return spanId ? { type: 'span', spanId } : { type: 'backlog' };
  };

  const getTaskListForReorder = (spanId?: string): Task[] => {
    if (!spanId) return backlogTasks;
    return dailyTasks
      .filter(t => t.dailyPlanSpanIds?.[selectedDate] === spanId)
      .sort((a, b) => (a.dailyPlanSpanOrder?.[spanId] ?? Infinity) - (b.dailyPlanSpanOrder?.[spanId] ?? Infinity));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeLocation = getTaskLocation(activeId);

    // 1. 拖到缓存区 drop target
    if (overId === 'daily-plan-backlog') {
      if (activeLocation.type === 'span' && activeLocation.spanId) {
        onMoveTaskOutOfSpan(activeId, selectedDate);
      }
      return;
    }

    // 2. 拖到 span drop target
    if (overId.startsWith('span-')) {
      const spanId = overId.replace('span-', '');
      if (activeLocation.type === 'backlog') {
        onMoveTaskToSpan(activeId, selectedDate, spanId);
      } else if (activeLocation.type === 'span' && activeLocation.spanId !== spanId) {
        onMoveTaskToSpan(activeId, selectedDate, spanId);
      }
      return;
    }

    // 3. over 是某个任务
    const overLocation = getTaskLocation(overId);

    // 3a. 都在缓存区：排序
    if (activeLocation.type === 'backlog' && overLocation.type === 'backlog') {
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

    // 3b. active 在 span，over 在缓存区：移出
    if (activeLocation.type === 'span' && overLocation.type === 'backlog') {
      onMoveTaskOutOfSpan(activeId, selectedDate);
      return;
    }

    // 3c. active 在缓存区，over 在 span：移入
    if (activeLocation.type === 'backlog' && overLocation.type === 'span' && overLocation.spanId) {
      const targetSpanId = overLocation.spanId;
      const spanTasks = getTaskListForReorder(targetSpanId);
      const newIndex = spanTasks.findIndex(t => t.id === overId);
      const order = newIndex >= 0 ? newIndex + 1 : spanTasks.length + 1;
      onMoveTaskToSpan(activeId, selectedDate, targetSpanId, order);
      return;
    }

    // 3d. 都在同一个 span：内部排序
    if (
      activeLocation.type === 'span' &&
      overLocation.type === 'span' &&
      activeLocation.spanId === overLocation.spanId
    ) {
      const spanId = activeLocation.spanId!;
      const spanTasks = getTaskListForReorder(spanId);
      const oldIndex = spanTasks.findIndex(t => t.id === activeId);
      const newIndex = spanTasks.findIndex(t => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(spanTasks, oldIndex, newIndex);
      reordered.forEach((task, index) => {
        const order = index + 1;
        if (task.dailyPlanSpanOrder?.[spanId] !== order) {
          onSetDailyPlanSpanOrder(task.id, spanId, order);
        }
      });
      return;
    }

    // 3e. active 在 span A，over 在 span B：移入 B 并排序
    if (
      activeLocation.type === 'span' &&
      overLocation.type === 'span' &&
      activeLocation.spanId !== overLocation.spanId
    ) {
      const targetSpanId = overLocation.spanId!;
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

  const handleCreateSpan = (startHour: number, endHour: number) => {
    onCreateSpan(selectedDate, startHour, endHour);
  };

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div className="flex flex-col h-full">
      {/* Date navigator */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 gap-2">
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
              <ChevronLeft size={16} />
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
              <ChevronRight size={16} />
            </Button>
          </div>

          {selectedDate === today && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30 shrink-0">
              {t('task.deadlineToday')}
            </span>
          )}
        </div>

        <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)} className="shrink-0">
          <Plus size={14} className="mr-1" />
          {t('view.addFromPlanGroup')}
        </Button>
      </div>

      {/* Backlog + Schedule */}
      {dailyTasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-white/40 gap-2">
          <CalendarDays size={32} opacity={0.5} />
          <span className="text-sm">{t('view.noTasksForDate')}</span>
          <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
            {t('view.addFromPlanGroup')}
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col flex-1 min-h-0">
            <DailyPlanBacklog
              date={selectedDate}
              tasks={backlogTasks}
              zones={zones}
              onToggleTask={onToggleTask}
              onNavigateToZone={onNavigateToZone}
              onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
            />

            <DailyPlanSchedule
              date={selectedDate}
              spans={dateSpans}
              tasks={dailyTasks}
              zones={zones}
              onToggleTask={onToggleTask}
              onNavigateToZone={onNavigateToZone}
              onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
              onDeleteSpan={onDeleteSpan}
              onOpenSpanDialog={handleOpenSpanDialog}
            />
          </div>
        </DndContext>
      )}

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
