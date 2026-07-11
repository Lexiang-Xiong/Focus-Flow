import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronDown, ChevronUp, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { TimeRuler } from './TimeRuler';
import { TimeSpan } from './TimeSpan';
import type { DailyPlanSpan, Task, Zone } from '@/types';

interface DailyPlanScheduleProps {
  date: string;
  spans: DailyPlanSpan[];
  tasks: Task[];
  zones: Zone[];
  expanded: boolean;
  style?: React.CSSProperties;
  onToggleExpanded: () => void;
  hourHeight?: number;
  onHourHeightChange?: (value: number) => void;
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
  expanded,
  style,
  onToggleExpanded,
  hourHeight = 48,
  onHourHeightChange,
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

  const handleZoomOut = () => {
    onHourHeightChange?.(Math.max(24, hourHeight - 8));
  };

  const handleZoomIn = () => {
    onHourHeightChange?.(Math.min(96, hourHeight + 8));
  };

  return (
    <div className="shrink-0 flex flex-col" style={style}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white/80">{t('view.schedule')}</span>
          {expanded && (
            <div className="flex items-center gap-1 ml-2">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white/50 hover:text-white/80 hover:bg-white/10"
                onClick={handleZoomOut}
                title={t('common.zoomOut')}
              >
                <ZoomOut size={14} />
              </Button>
              <Slider
                value={[hourHeight]}
                min={24}
                max={96}
                step={8}
                onValueChange={([v]) => onHourHeightChange?.(v)}
                className="w-24"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white/50 hover:text-white/80 hover:bg-white/10"
                onClick={handleZoomIn}
                title={t('common.zoomIn')}
              >
                <ZoomIn size={14} />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => onOpenSpanDialog()}>
            <Plus size={14} className="mr-1" />
            {t('view.createSpan')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-white/50 hover:text-white/80 hover:bg-white/10"
            onClick={onToggleExpanded}
            title={expanded ? t('common.collapse') : t('common.expand')}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto relative select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <TimeRuler hourHeight={hourHeight} className="absolute left-0 right-0 top-0" />

          <div className="absolute left-12 right-2 top-0" style={{ height: `${24 * hourHeight}px` }}>
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
              className="absolute left-12 right-2 bg-white/10 border border-white/30 rounded-md pointer-events-none"
              style={{
                top: `${Math.min(dragStartY, dragCurrentY)}px`,
                height: `${Math.abs(dragCurrentY - dragStartY)}px`,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
