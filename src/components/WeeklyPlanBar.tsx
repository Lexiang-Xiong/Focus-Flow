import { useMemo } from 'react';
import type { Task } from '@/types';

interface WeeklyPlanBarProps {
  tasks: Task[];
  onDayClick: (date: string) => void;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function WeeklyPlanBar({ tasks, onDayClick }: WeeklyPlanBarProps) {
  const today = useMemo(() => new Date(), []);
  const monday = useMemo(() => getMonday(today), [today]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      const dateStr = toDateString(date);
      const count = tasks.filter(t => t.plannedDates?.includes(dateStr)).length;
      return {
        date: dateStr,
        label: new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date),
        dayNum: date.getDate(),
        isToday: isSameDay(date, today),
        count,
      };
    });
  }, [monday, tasks, today]);

  return (
    <div className="flex items-stretch h-11 border-y border-white/5 bg-black/10 shrink-0">
      {days.map((d) => (
        <button
          key={d.date}
          type="button"
          onClick={() => onDayClick(d.date)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors hover:bg-white/5 ${
            d.isToday ? 'bg-white/10 text-white' : 'text-white/50'
          }`}
        >
          <span>{d.label}</span>
          <span className="flex items-center justify-center gap-1">
            <span className="text-xs font-medium">{d.dayNum}</span>
            {d.count > 0 && (
              <span className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-medium">
                {d.count}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
