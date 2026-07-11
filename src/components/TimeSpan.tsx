import { useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DailyPlanSpan, Task } from '@/types';
import { findOverlappingSpan } from '@/store/slices/executionPlanSlice';

interface TimeSpanProps {
  span: DailyPlanSpan;
  spans: DailyPlanSpan[];
  tasks: Task[];
  hourHeight?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  highlightedHours?: number[];
  onHighlightHoursChange?: (hours: number[]) => void;
  onDeleteSpan: (spanId: string) => void;
  onUpdateSpan: (spanId: string, updates: Partial<Omit<DailyPlanSpan, 'id'>>) => boolean;
  onEnterFocus: (spanId: string) => void;
}

const MIN_DURATION_HOUR = 5 / 60; // 5 分钟
const SNAP_THRESHOLD_HOUR = 0.08; // 约 5px @ hourHeight=60

function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getSpanColor(startHour: number): string {
  if (startHour < 6) return '#64748b';
  if (startHour < 9) return '#f59e0b';
  if (startHour < 12) return '#38bdf8';
  if (startHour < 14) return '#34d399';
  if (startHour < 18) return '#a78bfa';
  if (startHour < 22) return '#fb7185';
  return '#64748b';
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function snapHour(hour: number): number {
  const clamped = Math.max(0, Math.min(24, hour));
  // 优先吸附到整点/半点
  const wholeHalf = Math.round(clamped * 2) / 2;
  if (Math.abs(clamped - wholeHalf) < SNAP_THRESHOLD_HOUR) {
    return Math.max(0, Math.min(24, wholeHalf));
  }
  // 否则按 5 分钟粒度吸附
  const grid = MIN_DURATION_HOUR;
  return Math.max(0, Math.min(24, Math.round(clamped / grid) * grid));
}

function getHighlightHours(startHour: number, endHour: number): number[] {
  const hours: number[] = [];
  let h = Math.ceil(startHour);
  while (h < endHour) {
    hours.push(h);
    h += 1;
  }
  return hours;
}

export function TimeSpan({
  span,
  spans,
  tasks,
  hourHeight = 48,
  containerRef,
  highlightedHours,
  onHighlightHoursChange,
  onDeleteSpan,
  onUpdateSpan,
  onEnterFocus,
}: TimeSpanProps) {
  const { t } = useTranslation();
  const color = useMemo(() => getSpanColor(span.startHour), [span.startHour]);
  const taskCount = tasks.length;

  const [resizeState, setResizeState] = useState<{
    edge: 'top' | 'bottom';
    startY: number;
    startSpan: DailyPlanSpan;
    scrollTop: number;
  } | null>(null);
  const [preview, setPreview] = useState<{ startHour: number; endHour: number } | null>(null);
  const isResizingRef = useRef(false);

  const displaySpan = preview ?? span;

  const handleEdgeMouseDown = (edge: 'top' | 'bottom', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef?.current;
    if (!container) return;
    isResizingRef.current = true;
    setResizeState({
      edge,
      startY: e.clientY,
      startSpan: { ...span },
      scrollTop: container.scrollTop,
    });
    onHighlightHoursChange?.(getHighlightHours(span.startHour, span.endHour));

    const handleMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const y = ev.clientY - rect.top + resizeState!.scrollTop;
      let hour = snapHour(y / hourHeight);

      let nextStart = span.startHour;
      let nextEnd = span.endHour;
      if (edge === 'top') {
        nextStart = Math.min(hour, span.endHour - MIN_DURATION_HOUR);
        nextStart = Math.max(0, nextStart);
      } else {
        nextEnd = Math.max(hour, span.startHour + MIN_DURATION_HOUR);
        nextEnd = Math.min(24, nextEnd);
      }

      // 检测重叠：仅当不重叠时才更新预览
      const overlap = findOverlappingSpan(
        spans,
        span.date,
        nextStart,
        nextEnd,
        span.id
      );
      if (!overlap) {
        setPreview({ startHour: nextStart, endHour: nextEnd });
        onHighlightHoursChange?.(getHighlightHours(nextStart, nextEnd));
      }
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onHighlightHoursChange?.([]);
      if (preview) {
        const ok = onUpdateSpan(span.id, { startHour: preview.startHour, endHour: preview.endHour });
        if (!ok) {
          setPreview(null);
        }
      }
      setResizeState(null);
      setPreview(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const displayDuration = displaySpan.endHour - displaySpan.startHour;

  return (
    <div
      className="absolute inset-x-0 rounded-md flex flex-col overflow-hidden group"
      style={{
        top: `${displaySpan.startHour * hourHeight}px`,
        height: `${Math.max(displayDuration * hourHeight, 24)}px`,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        border: `1px solid ${hexToRgba(color, 0.5)}`,
        borderLeftWidth: '3px',
        borderLeftColor: color,
        boxShadow: highlightedHours && highlightedHours.length > 0 ? `0 0 0 1px ${hexToRgba(color, 0.3)}` : undefined,
      }}
      onClick={() => !isResizingRef.current && onEnterFocus(span.id)}
    >
      {/* 上边缘拖拽手柄 */}
      <div
        className="absolute left-0 right-0 top-0 h-1.5 cursor-row-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
        style={{ backgroundColor: hexToRgba(color, 0.6) }}
        onMouseDown={(e) => handleEdgeMouseDown('top', e)}
      />

      {/* 内容 */}
      <div className="flex-1 flex flex-col px-2 py-1 min-h-0 cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium truncate" style={{ color }}>
            {formatHour(displaySpan.startHour)} - {formatHour(displaySpan.endHour)}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {taskCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-medium bg-red-500 text-white"
                title={t('view.spanTaskCount', { count: taskCount })}
              >
                {taskCount}
              </span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 text-white/40 hover:text-white/80 hover:bg-white/10 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSpan(span.id);
              }}
              title={t('view.deleteSpan')}
            >
              <X size={10} />
            </Button>
          </div>
        </div>

        {span.description && (
          <div className="text-xs text-white/50 truncate mt-0.5" title={span.description}>
            {span.description}
          </div>
        )}
      </div>

      {/* 下边缘拖拽手柄 */}
      <div
        className="absolute left-0 right-0 bottom-0 h-1.5 cursor-row-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
        style={{ backgroundColor: hexToRgba(color, 0.6) }}
        onMouseDown={(e) => handleEdgeMouseDown('bottom', e)}
      />
    </div>
  );
}
