import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeRuler } from './TimeRuler';
import { TimeSpan } from './TimeSpan';
import type { DailyPlanSpan, Task, Zone } from '@/types';

interface DailyPlanScheduleProps {
  date: string;
  spans: DailyPlanSpan[];
  tasks: Task[];
  zones: Zone[];
  hourHeight?: number;
  onToggleTask: (taskId: string) => void;
  onNavigateToZone: (zoneId: string, taskId?: string) => void;
  onRemoveTaskFromDailyPlan: (taskId: string, date: string) => void;
  onDeleteSpan: (spanId: string) => void;
  onOpenSpanDialog: (startHour?: number, endHour?: number) => void;
}

export function DailyPlanSchedule({
  date,
  spans,
  tasks,
  zones,
  hourHeight = 48,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromDailyPlan,
  onDeleteSpan,
  onOpenSpanDialog,
}: DailyPlanScheduleProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingTime, setIsDraggingTime] = useState(false);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragCurrentY, setDragCurrentY] = useState<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-span-area]')) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop ?? 0);
    setIsDraggingTime(true);
    setDragStartY(y);
    setDragCurrentY(y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingTime || dragStartY === null) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top + (containerRef.current?.scrollTop ?? 0);
    setDragCurrentY(y);
  };

  const handleMouseUp = () => {
    if (!isDraggingTime || dragStartY === null || dragCurrentY === null) {
      setIsDraggingTime(false);
      setDragStartY(null);
      setDragCurrentY(null);
      return;
    }
    const startHour = Math.max(0, Math.min(24, dragStartY / hourHeight));
    const endHour = Math.max(0, Math.min(24, dragCurrentY / hourHeight));
    const minHour = Math.min(startHour, endHour);
    const maxHour = Math.max(startHour, endHour);
    const roundedMin = Math.round(minHour * 2) / 2;
    const roundedMax = Math.round(maxHour * 2) / 2;
    if (roundedMax - roundedMin >= 0.5) {
      onOpenSpanDialog(roundedMin, roundedMax);
    }
    setIsDraggingTime(false);
    setDragStartY(null);
    setDragCurrentY(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-sm font-medium text-white/80">{t('view.schedule')}</span>
        <Button size="sm" variant="outline" onClick={() => onOpenSpanDialog()}>
          <Plus size={14} className="mr-1" />
          {t('view.createSpan')}
        </Button>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto relative select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <TimeRuler hourHeight={hourHeight} className="absolute inset-0" />

        <div className="absolute left-14 right-2" style={{ height: `${24 * hourHeight}px` }}>
          {spans.map(span => (
            <div key={span.id} data-span-area>
              <TimeSpan
                span={span}
                tasks={tasks.filter(t => t.dailyPlanSpanIds?.[date] === span.id)}
                zones={zones}
                hourHeight={hourHeight}
                onToggleTask={onToggleTask}
                onNavigateToZone={onNavigateToZone}
                onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
                onDeleteSpan={onDeleteSpan}
              />
            </div>
          ))}
        </div>

        {isDraggingTime && dragStartY !== null && dragCurrentY !== null && (
          <div
            className="absolute left-14 right-2 bg-white/10 border border-white/30 rounded-md pointer-events-none"
            style={{
              top: `${Math.min(dragStartY, dragCurrentY)}px`,
              height: `${Math.abs(dragCurrentY - dragStartY)}px`,
            }}
          />
        )}
      </div>
    </div>
  );
}
