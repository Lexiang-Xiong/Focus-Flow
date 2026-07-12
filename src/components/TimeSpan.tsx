import { useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
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
  const wholeHalf = Math.round(clamped * 2) / 2;
  if (Math.abs(clamped - wholeHalf) < SNAP_THRESHOLD_HOUR) {
    return Math.max(0, Math.min(24, wholeHalf));
  }
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

  const [preview, setPreview] = useState<{ startHour: number; endHour: number } | null>(null);
  const previewRef = useRef<{ startHour: number; endHour: number } | null>(null);
  const justDraggedRef = useRef(false);
  const resizeStateRef = useRef<{
    edge: 'top' | 'bottom';
    startY: number;
    startSpan: DailyPlanSpan;
    scrollTop: number;
  } | null>(null);
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: `span-${span.id}` });

  const displaySpan = preview ?? span;

  const handleEdgeMouseDown = (edge: 'top' | 'bottom', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef?.current;
    if (!container) return;

    justDraggedRef.current = false;
    resizeStateRef.current = {
      edge,
      startY: e.clientY,
      startSpan: { ...span },
      scrollTop: container.scrollTop,
    };
    onHighlightHoursChange?.(getHighlightHours(span.startHour, span.endHour));

    const handleMouseMove = (ev: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;

      const moveDelta = Math.abs(ev.clientY - state.startY);
      if (moveDelta > 2) {
        justDraggedRef.current = true;
      }

      const rect = container.getBoundingClientRect();
      const y = ev.clientY - rect.top + state.scrollTop;
      const hour = snapHour(y / hourHeight);

      let nextStart = state.startSpan.startHour;
      let nextEnd = state.startSpan.endHour;
      if (state.edge === 'top') {
        nextStart = Math.min(hour, state.startSpan.endHour - MIN_DURATION_HOUR);
        nextStart = Math.max(0, nextStart);
      } else {
        nextEnd = Math.max(hour, state.startSpan.startHour + MIN_DURATION_HOUR);
        nextEnd = Math.min(24, nextEnd);
      }

      const overlap = findOverlappingSpan(spans, span.date, nextStart, nextEnd, span.id);
      if (!overlap) {
        const nextPreview = { startHour: nextStart, endHour: nextEnd };
        setPreview(nextPreview);
        previewRef.current = nextPreview;
        onHighlightHoursChange?.(getHighlightHours(nextStart, nextEnd));
      }
    };

    const handleMouseUp = () => {
      const finalPreview = previewRef.current;
      resizeStateRef.current = null;
      previewRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onHighlightHoursChange?.([]);

      if (finalPreview) {
        const ok = onUpdateSpan(span.id, { startHour: finalPreview.startHour, endHour: finalPreview.endHour });
        if (!ok) {
          setPreview(null);
        }
      } else {
        setPreview(null);
      }
      setTimeout(() => {
        setPreview(null);
        justDraggedRef.current = false;
      }, 0);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleClick = () => {
    if (justDraggedRef.current) return;
    onEnterFocus(span.id);
  };

  const displayDuration = displaySpan.endHour - displaySpan.startHour;

  return (
    <div
      ref={setDroppableRef}
      className={`absolute inset-x-0 rounded-md flex flex-col overflow-hidden group ${isOver ? 'ring-2 ring-white/30' : ''}`}
      style={{
        top: `${displaySpan.startHour * hourHeight}px`,
        height: `${Math.max(displayDuration * hourHeight, 24)}px`,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        border: `1px solid ${hexToRgba(color, 0.5)}`,
        borderLeftWidth: '3px',
        borderLeftColor: color,
        boxShadow: highlightedHours && highlightedHours.length > 0 ? `0 0 0 1px ${hexToRgba(color, 0.3)}` : undefined,
      }}
      onClick={handleClick}
    >
      {/* 上边缘拖拽手柄 */}
      <div
        className="absolute left-0 right-0 top-0 h-2 cursor-row-resize z-20 flex items-start justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={(e) => handleEdgeMouseDown('top', e)}
      >
        <div className="w-10 h-1 rounded-full mt-0.5" style={{ backgroundColor: hexToRgba(color, 0.8) }} />
      </div>

      {/* 内容 */}
      <div className="flex-1 flex flex-col px-2 py-1 min-h-0 cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-medium truncate" style={{ color }}>
            {formatHour(displaySpan.startHour)} - {formatHour(displaySpan.endHour)}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {taskCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-medium bg-red-500 text-white"
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
          <div className="text-[10px] text-white/50 truncate mt-0.5" title={span.description}>
            {span.description}
          </div>
        )}
      </div>

      {/* 下边缘拖拽手柄 */}
      <div
        className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize z-20 flex items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={(e) => handleEdgeMouseDown('bottom', e)}
      >
        <div className="w-10 h-1 rounded-full mb-0.5" style={{ backgroundColor: hexToRgba(color, 0.8) }} />
      </div>
    </div>
  );
}
