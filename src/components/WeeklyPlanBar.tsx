import { useMemo, useRef, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Task } from '@/types';

interface WeeklyPlanBarProps {
  tasks: Task[];
  selectedDate?: string;
  onDayClick: (date: string) => void;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const VISIBLE_DAYS = 7;
const TOTAL_DAYS = 21;

export function WeeklyPlanBar({ tasks, selectedDate, onDayClick }: WeeklyPlanBarProps) {
  const today = useMemo(() => new Date(), []);
  const startDate = useMemo(() => addDays(today, -Math.floor(TOTAL_DAYS / 2)), [today]);

  const days = useMemo(() => {
    return Array.from({ length: TOTAL_DAYS }, (_, i) => {
      const date = addDays(startDate, i);
      const dateStr = toDateString(date);
      const count = tasks.filter((t) => t.plannedDates?.includes(dateStr)).length;
      return {
        date: dateStr,
        label: new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date),
        dayNum: date.getDate(),
        isToday: isSameDay(date, today),
        isSelected: dateStr === selectedDate,
        count,
      };
    });
  }, [startDate, tasks, today, selectedDate]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      observer.disconnect();
    };
  }, []);

  // 初始滚动到“今天”所在位置，使其大致居中
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayIndex = days.findIndex((d) => d.isToday);
    if (todayIndex < 0) return;
    const dayWidth = el.scrollWidth / TOTAL_DAYS;
    const target = todayIndex * dayWidth - el.clientWidth / 2 + dayWidth / 2;
    el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, target));
    checkScroll();
  }, [days]);

  const scrollByDays = (daysDelta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const dayWidth = el.clientWidth / VISIBLE_DAYS;
    el.scrollBy({ left: dayWidth * daysDelta, behavior: 'smooth' });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY === 0 && e.deltaX === 0) return;
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: (e.deltaY || e.deltaX) * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="relative shrink-0 h-9 bg-black/10 border-y border-white/5">
      {canScrollLeft && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-7 w-5 rounded-none rounded-r bg-[#13131a]/90 hover:bg-[#1a1a24] text-white/60 hover:text-white"
          onClick={() => scrollByDays(-1)}
        >
          <ChevronLeft size={14} />
        </Button>
      )}
      {canScrollRight && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-7 w-5 rounded-none rounded-l bg-[#13131a]/90 hover:bg-[#1a1a24] text-white/60 hover:text-white"
          onClick={() => scrollByDays(1)}
        >
          <ChevronRight size={14} />
        </Button>
      )}

      <div
        ref={scrollRef}
        className="flex h-full overflow-x-auto scroll-smooth"
        onWheel={handleWheel}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onDayClick(d.date)}
            className={`shrink-0 w-[calc(100%/7)] flex flex-col items-center justify-center gap-px text-[10px] transition-colors hover:bg-white/5 ${
              d.isSelected
                ? 'bg-white/15 text-white'
                : d.isToday
                ? 'bg-white/10 text-white'
                : 'text-white/50'
            }`}
          >
            <span>{d.label}</span>
            <span className="flex items-center justify-center gap-1">
              <span className="text-[11px] font-medium leading-none">{d.dayNum}</span>
              {d.count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[13px] h-[13px] px-0.5 rounded-full bg-red-500 text-white text-[8px] font-medium leading-none">
                  {d.count > 99 ? '99+' : d.count}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
