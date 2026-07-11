import { useMemo } from 'react';

interface TimeRulerProps {
  hourHeight?: number;
  className?: string;
}

export function TimeRuler({ hourHeight = 48, className = '' }: TimeRulerProps) {
  const hours = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);

  return (
    <div className={`select-none ${className}`} style={{ height: `${24 * hourHeight}px` }}>
      {hours.map(hour => (
        <div
          key={hour}
          className="absolute left-0 right-0 flex items-center text-xs text-white/40"
          style={{ top: `${hour * hourHeight}px`, height: `${hourHeight}px` }}
        >
          <span className="w-10 text-right pr-2 shrink-0">{String(hour).padStart(2, '0')}:00</span>
          <div className="flex-1 border-t border-white/10" />
        </div>
      ))}
    </div>
  );
}
