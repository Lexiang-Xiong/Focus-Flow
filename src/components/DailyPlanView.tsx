import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, CalendarDays, Plus, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DatePickerPopover } from './DatePickerPopover';
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
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
}

function getZoneById(zones: Zone[], zoneId: string): Zone | undefined {
  return zones.find(z => z.id === zoneId);
}

interface SortableTaskItemProps {
  task: Task;
  zone?: Zone;
  selectedDate: string;
  onToggleTask: (taskId: string) => void;
  onNavigateToZone: (zoneId: string, taskId?: string) => void;
  onRemoveTaskFromDailyPlan: (taskId: string, date: string) => void;
}

function SortableTaskItem({
  task,
  zone,
  selectedDate,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromDailyPlan,
}: SortableTaskItemProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 rounded bg-black/20 hover:bg-white/5 border border-white/5"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-white/30 hover:text-white/60 cursor-grab active:cursor-grabbing shrink-0"
        title={t('task.dragToSort')}
      >
        <GripVertical size={14} />
      </button>
      <Checkbox
        checked={task.completed}
        onCheckedChange={() => onToggleTask(task.id)}
        className="border-white/30"
      />
      <button
        onClick={() => onNavigateToZone(task.zoneId, task.id)}
        className="flex-1 text-left min-w-0"
      >
        <div className={`text-sm truncate hover:underline ${
          task.completed ? 'line-through text-white/40' : 'text-white/90'
        }`}>
          {task.title}
        </div>
        {task.description && (
          <div className="text-xs text-white/50 truncate mt-0.5">
            {task.description}
          </div>
        )}
      </button>
      {zone && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: zone.color }}
          title={zone.name}
        />
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 text-white/40 hover:text-white/80 hover:bg-white/10 shrink-0"
        onClick={() => onRemoveTaskFromDailyPlan(task.id, selectedDate)}
        title={t('task.removeFromPlan')}
      >
        <X size={12} />
      </Button>
    </div>
  );
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
}: DailyPlanViewProps) {
  const { t } = useTranslation();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const dailyTasks = useMemo(
    () => tasks
      .filter(t => t.plannedDates?.includes(selectedDate))
      .sort((a, b) => (a.dailyPlanOrder?.[selectedDate] ?? Infinity) - (b.dailyPlanOrder?.[selectedDate] ?? Infinity)),
    [tasks, selectedDate]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = dailyTasks.findIndex(t => t.id === active.id);
    const newIndex = dailyTasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(dailyTasks, oldIndex, newIndex);
    reordered.forEach((task, index) => {
      const order = index + 1;
      if (task.dailyPlanOrder?.[selectedDate] !== order) {
        onSetDailyPlanOrder(task.id, selectedDate, order);
      }
    });
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

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3">
        {dailyTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/40 gap-2">
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
            <SortableContext
              key={selectedDate}
              items={dailyTasks.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {dailyTasks.map(task => {
                  const zone = getZoneById(zones, task.zoneId);
                  return (
                    <SortableTaskItem
                      key={task.id}
                      task={task}
                      zone={zone}
                      selectedDate={selectedDate}
                      onToggleTask={onToggleTask}
                      onNavigateToZone={onNavigateToZone}
                      onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <AddFromPlanGroupDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        planGroups={planGroups}
        tasks={tasks}
        zones={zones}
        selectedDate={selectedDate}
        onAdd={(taskIds) => onAddTasksToDailyPlan(taskIds, selectedDate)}
      />
    </div>
  );
}
