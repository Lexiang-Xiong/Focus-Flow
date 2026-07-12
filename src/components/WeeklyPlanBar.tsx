import { useMemo, useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';

interface WeeklyPlanBarProps {
  tasks: Task[];
  selectedDate?: string;
  onDayClick: (date: string) => void;
  className?: string;
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

function diffDays(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

const VISIBLE_DAYS = 7;
const INITIAL_BUFFER_DAYS = 15;
const LOAD_MORE_DAYS = 15;
const MAX_TOTAL_DAYS = 75;
const SCROLL_THRESHOLD_DAYS = 5;

export function WeeklyPlanBar({ tasks, selectedDate, onDayClick, className }: WeeklyPlanBarProps) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);

  const [startDate, setStartDate] = useState(() =>
    addDays(today, -INITIAL_BUFFER_DAYS)
  );
  const [endDate, setEndDate] = useState(() =>
    addDays(today, INITIAL_BUFFER_DAYS)
  );

  const weekdayFormatter = useMemo(() => {
    const locale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
    return new Intl.DateTimeFormat(locale, { weekday: 'short' });
  }, [i18n.language]);

  const days = useMemo(() => {
    const total = diffDays(startDate, endDate) + 1;
    return Array.from({ length: total }, (_, i) => {
      const date = addDays(startDate, i);
      const dateStr = toDateString(date);
      const count = tasks.filter((t) => t.plannedDates?.includes(dateStr)).length;
      return {
        date: dateStr,
        label: weekdayFormatter.format(date),
        dayNum: date.getDate(),
        isToday: isSameDay(date, today),
        isSelected: dateStr === selectedDate,
        count,
      };
    });
  }, [startDate, endDate, tasks, today, selectedDate, weekdayFormatter]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isLoadingRef = useRef(false);
  const pendingScrollAdjustRef = useRef(0);
  const hasInitialScrolledRef = useRef(false);

  const totalDays = days.length;

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  const loadMore = useCallback(
    (direction: 'left' | 'right') => {
      const el = scrollRef.current;
      const totalBefore = diffDays(startDate, endDate) + 1;
      const dayWidth = el && totalBefore > 0 ? el.scrollWidth / totalBefore : 40;

      if (direction === 'left') {
        const newStart = addDays(startDate, -LOAD_MORE_DAYS);
        let newEnd = endDate;
        if (totalBefore + LOAD_MORE_DAYS > MAX_TOTAL_DAYS) {
          newEnd = addDays(endDate, -LOAD_MORE_DAYS);
        }
        setStartDate(newStart);
        setEndDate(newEnd);
        // 在左侧插入新日期后，需要把滚动位置右移，保持可视区域不变
        pendingScrollAdjustRef.current = dayWidth * LOAD_MORE_DAYS;
      } else {
        const newEnd = addDays(endDate, LOAD_MORE_DAYS);
        let newStart = startDate;
        let adjust = 0;
        if (totalBefore + LOAD_MORE_DAYS > MAX_TOTAL_DAYS) {
          newStart = addDays(startDate, LOAD_MORE_DAYS);
          adjust = -dayWidth * LOAD_MORE_DAYS;
        }
        setStartDate(newStart);
        setEndDate(newEnd);
        pendingScrollAdjustRef.current = adjust;
      }
    },
    [startDate, endDate]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      checkScroll();
      if (isLoadingRef.current || totalDays === 0) return;
      const dayWidth = el.scrollWidth / totalDays;
      const threshold = dayWidth * SCROLL_THRESHOLD_DAYS;
      if (el.scrollLeft < threshold) {
        isLoadingRef.current = true;
        loadMore('left');
      } else if (el.scrollLeft + el.clientWidth > el.scrollWidth - threshold) {
        isLoadingRef.current = true;
        loadMore('right');
      }
    };

    checkScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [totalDays, loadMore]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (pendingScrollAdjustRef.current !== 0) {
      const prevBehavior = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      el.scrollLeft += pendingScrollAdjustRef.current;
      el.style.scrollBehavior = prevBehavior;
      pendingScrollAdjustRef.current = 0;
    }

    if (!hasInitialScrolledRef.current) {
      const todayIndex = days.findIndex((d) => d.isToday);
      if (todayIndex >= 0) {
        const dayWidth = el.scrollWidth / totalDays;
        const target =
          todayIndex * dayWidth - el.clientWidth / 2 + dayWidth / 2;
        const prevBehavior = el.style.scrollBehavior;
        el.style.scrollBehavior = 'auto';
        el.scrollLeft = Math.max(
          0,
          Math.min(el.scrollWidth - el.clientWidth, target)
        );
        el.style.scrollBehavior = prevBehavior;
        hasInitialScrolledRef.current = true;
      }
    }

    isLoadingRef.current = false;
    checkScroll();
  }, [days, totalDays]);

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
    <div className={cn('weekly-plan-bar relative shrink-0 h-10 bg-black/10 border-y border-white/5', className)}>
      {canScrollLeft && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-7 w-5 rounded-none rounded-r bg-[#13131a]/90 hover:bg-[#1a1a24] text-white/60 hover:text-white"
          title={t('common.previous')}
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
          title={t('common.next')}
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
            className={`shrink-0 w-12 flex flex-col items-center justify-center gap-1 text-[11px] transition-colors hover:bg-white/5 ${
              d.isSelected
                ? 'bg-white/15 text-white'
                : d.isToday
                ? 'bg-white/10 text-white'
                : 'text-white/50'
            }`}
          >
            <span>{d.label}</span>
            <span className="flex items-center justify-center gap-1">
              <span className="text-[13px] font-medium leading-none">{d.dayNum}</span>
              {d.count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-medium leading-none">
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
