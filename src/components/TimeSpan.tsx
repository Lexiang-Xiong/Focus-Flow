import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTaskItem } from './SortableTaskItem';
import type { DailyPlanSpan, Task, Zone } from '@/types';

interface TimeSpanProps {
  span: DailyPlanSpan;
  tasks: Task[];
  zones: Zone[];
  hourHeight?: number;
  onToggleTask: (taskId: string) => void;
  onNavigateToZone: (zoneId: string, taskId?: string) => void;
  onRemoveTaskFromDailyPlan: (taskId: string, date: string) => void;
  onDeleteSpan: (spanId: string) => void;
}

function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getSpanColor(startHour: number): string {
  const hue = Math.round(startHour * 11.67); // 0 -> 0, 24 -> 280
  return `hsl(${hue}, 70%, 55%)`;
}

function getZoneById(zones: Zone[], zoneId: string): Zone | undefined {
  return zones.find(z => z.id === zoneId);
}

export function TimeSpan({
  span,
  tasks,
  zones,
  hourHeight = 48,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromDailyPlan,
  onDeleteSpan,
}: TimeSpanProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `span-${span.id}` });

  const duration = span.endHour - span.startHour;
  const color = useMemo(() => getSpanColor(span.startHour), [span.startHour]);

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => (a.dailyPlanSpanOrder?.[span.id] ?? Infinity) - (b.dailyPlanSpanOrder?.[span.id] ?? Infinity)),
    [tasks, span.id]
  );

  return (
    <div
      ref={setNodeRef}
      className="absolute inset-x-0 rounded-md border px-2 py-1.5 flex flex-col gap-1 overflow-hidden"
      style={{
        top: `${span.startHour * hourHeight}px`,
        height: `${Math.max(duration * hourHeight - 4, 32)}px`,
        backgroundColor: `${color}20`,
        borderColor: `${color}80`,
        boxShadow: isOver ? `0 0 0 2px ${color}` : undefined,
      }}
    >
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-medium truncate" style={{ color }}>
          {formatHour(span.startHour)} - {formatHour(span.endHour)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 text-white/40 hover:text-white/80 hover:bg-white/10 shrink-0"
          onClick={() => onDeleteSpan(span.id)}
          title={t('view.deleteSpan')}
        >
          <X size={10} />
        </Button>
      </div>

      <SortableContext
        items={sortedTasks.map(t => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 flex flex-col gap-0.5 min-h-0 overflow-y-auto">
          {sortedTasks.map(task => {
            const zone = getZoneById(zones, task.zoneId);
            return (
              <SortableTaskItem
                key={task.id}
                task={task}
                zone={zone}
                selectedDate={span.date}
                dragHandleTitle={t('task.dragToSort')}
                onToggleTask={onToggleTask}
                onNavigateToZone={onNavigateToZone}
                onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
              />
            );
          })}
        </div>
      </SortableContext>
    </div>
  );
}
