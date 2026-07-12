import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, X, Clock, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { SortableTaskItem } from './SortableTaskItem';
import type { DailyPlanSpan, Task, Zone } from '@/types';

interface DailyPlanSpanFocusProps {
  span: DailyPlanSpan;
  tasks: Task[];
  zones: Zone[];
  onBack: () => void;
  onToggleTask: (taskId: string) => void;
  onNavigateToZone: (zoneId: string, taskId?: string) => void;
  onRemoveTaskFromDailyPlan: (taskId: string, date: string) => void;
  onMoveTaskOutOfSpan: (taskId: string, date: string, spanId: string) => void;
  onUpdateSpan: (spanId: string, updates: Partial<Omit<DailyPlanSpan, 'id'>>) => boolean;
  onDeleteSpan: (spanId: string) => void;
}

function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hourToValue(hour: number): string {
  return String(Math.round(hour * 60));
}

function getZoneById(zones: Zone[], zoneId: string): Zone | undefined {
  return zones.find(z => z.id === zoneId);
}

export function DailyPlanSpanFocus({
  span,
  tasks,
  zones,
  onBack,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromDailyPlan,
  onMoveTaskOutOfSpan,
  onUpdateSpan,
  onDeleteSpan,
}: DailyPlanSpanFocusProps) {
  const { t } = useTranslation();
  const [description, setDescription] = useState(span.description || '');
  const [timeError, setTimeError] = useState<string | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: `span-focus-${span.id}` });

  const spanTasks = useMemo(() => {
    return tasks
      .filter(t => t.dailyPlanSpanIds?.[span.date]?.includes(span.id))
      .sort((a, b) => (a.dailyPlanSpanOrder?.[span.date]?.[span.id] ?? Infinity) - (b.dailyPlanSpanOrder?.[span.date]?.[span.id] ?? Infinity));
  }, [tasks, span.id, span.date]);

  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let minutes = 0; minutes <= 24 * 60; minutes += 5) {
      options.push({ value: String(minutes), label: formatHour(minutes / 60) });
    }
    return options;
  }, []);

  const handleDescriptionBlur = () => {
    if (description !== (span.description || '')) {
      onUpdateSpan(span.id, { description: description.trim() || undefined });
    }
  };

  const applyTimeChange = (key: 'start' | 'end', value: string) => {
    const start = (key === 'start' ? Number(value) : Number(hourToValue(span.startHour))) / 60;
    const end = (key === 'end' ? Number(value) : Number(hourToValue(span.endHour))) / 60;
    if (Number.isNaN(start) || Number.isNaN(end)) {
      setTimeError(t('view.spanInvalidTime'));
      return;
    }
    if (end - start < 5 / 60) {
      setTimeError(t('view.spanDurationTooShort'));
      return;
    }
    const ok = onUpdateSpan(span.id, { startHour: start, endHour: end });
    if (ok) {
      setTimeError(null);
    } else {
      setTimeError(t('view.spanTimeOverlap'));
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#13131a] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onBack}>
            <ArrowLeft size={16} />
          </Button>
          <div className="flex items-center gap-2 text-sm text-white/80 min-w-0">
            <Clock size={14} className="shrink-0" />
            <span className="font-medium truncate">
              {formatHour(span.startHour)} - {formatHour(span.endHour)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onDeleteSpan(span.id);
              onBack();
            }}
          >
            <X size={14} className="mr-1" />
            {t('view.deleteSpan')}
          </Button>
        </div>
      </div>

      {/* Time range editor */}
      <div className="px-3 py-3 border-b border-white/10 space-y-2">
        <div className="flex items-center gap-2 text-xs text-white/50 mb-1.5">
          <Clock size={12} />
          <span>{t('view.spanTimeRange')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-white/40 mb-1 block">{t('view.spanStartTime')}</label>
            <Select value={hourToValue(span.startHour)} onValueChange={(v) => applyTimeChange('start', v)}>
              <SelectTrigger className="h-8 bg-black/20 border-white/10 text-white/90">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {timeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-white/40 text-sm mt-5">-</span>
          <div className="flex-1">
            <label className="text-[10px] text-white/40 mb-1 block">{t('view.spanEndTime')}</label>
            <Select value={hourToValue(span.endHour)} onValueChange={(v) => applyTimeChange('end', v)}>
              <SelectTrigger className="h-8 bg-black/20 border-white/10 text-white/90">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {timeOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {timeError && <div className="text-xs text-red-400">{timeError}</div>}
      </div>

      {/* Description */}
      <div className="px-3 py-3 border-b border-white/10">
        <div className="flex items-center gap-2 text-xs text-white/50 mb-1.5">
          <FileText size={12} />
          <span>{t('view.spanDescription')}</span>
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
          placeholder={t('view.spanDescriptionPlaceholder')}
          className="min-h-[72px] bg-black/20 border-white/10 text-white/90 placeholder:text-white/30 resize-none"
        />
      </div>

      {/* Task list */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <span className="text-sm font-medium text-white/80">
            {t('view.spanTasks')} ({spanTasks.length})
          </span>
        </div>
        <div className="p-3">
          <SortableContext
            items={spanTasks.map(t => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {spanTasks.map(task => {
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
                    onRemoveFromSpan={(taskId) => onMoveTaskOutOfSpan(taskId, span.date, span.id)}
                  />
                );
              })}
            </div>
          </SortableContext>

          {/* Drop area for tasks from backlog */}
          <div
            ref={setNodeRef}
            className={`mt-3 px-3 py-4 rounded border border-dashed text-center text-sm transition-colors ${
              isOver
                ? 'bg-white/10 border-white/30 text-white/80'
                : 'border-white/10 text-white/40 hover:bg-white/5 hover:text-white/60'
            }`}
          >
            {t('view.dragTasksHere')}
          </div>
        </div>
      </div>
    </div>
  );
}
