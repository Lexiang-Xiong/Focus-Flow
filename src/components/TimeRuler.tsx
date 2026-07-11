import { useMemo } from 'react';

interface TimeRulerProps {
  hourHeight?: number;
  highlightedHours?: number[];
  className?: string;
}

export function TimeRuler({ hourHeight = 48, highlightedHours = [], className = '' }: TimeRulerProps) {
  const hours = useMemo(() => Array.from({ length: 25 }, (_, i) => i), []);
  const highlightSet = useMemo(() => new Set(highlightedHours), [highlightedHours]);

  return (
    <div className={`select-none ${className}`} style={{ height: `${24 * hourHeight}px` }}>
      {hours.map(hour => {
        const isHighlighted = highlightSet.has(hour);
        return (
          <div
            key={hour}
            className="absolute left-0 right-0 flex items-start text-xs"
            style={{ top: `${hour * hourHeight}px` }}
          >
            <span className={`-translate-y-1/2 w-10 text-right pr-2 shrink-0 transition-colors ${isHighlighted ? 'text-white font-medium' : 'text-white/40'}`}>
              {String(hour).padStart(2, '0')}:00
            </span>
            <div className={`flex-1 border-t transition-colors ${isHighlighted ? 'border-white/40' : 'border-white/10'}`} />
          </div>
        );
      })}
    </div>
  );
}
