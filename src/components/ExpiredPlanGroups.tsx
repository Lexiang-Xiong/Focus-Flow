import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Trash2, Edit2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanGroup, Task } from '@/types';
import { isPlanGroupExpired } from '@/store/slices/executionPlanSlice';

interface ExpiredPlanGroupsProps {
  planGroups: PlanGroup[];
  tasks: Task[];
  onDeleteGroup: (id: string) => void;
  onEditGroup?: (group: PlanGroup) => void;
}

export function ExpiredPlanGroups({ planGroups, tasks, onDeleteGroup, onEditGroup }: ExpiredPlanGroupsProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const expiredGroups = useMemo(
    () => planGroups.filter(g => isPlanGroupExpired(g, today)).sort((a, b) => b.order - a.order),
    [planGroups, today]
  );

  if (expiredGroups.length === 0) return null;

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-white/70 hover:text-white border-t border-white/10 transition-colors"
      >
        <span className="flex items-center gap-2">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {t('view.expiredGroups')} ({expiredGroups.length})
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 mt-2">
          {expiredGroups.map(group => {
            const groupTasks = tasks.filter(t => t.planGroupIds?.includes(group.id));
            const pendingCount = groupTasks.filter(t => !t.completed).length;
            const dateRange =
              group.startDate || group.endDate
                ? `${group.startDate ?? ''} ~ ${group.endDate ?? ''}`
                : t('view.noDate');

            return (
              <div
                key={group.id}
                className="flex items-center justify-between px-3 py-2 rounded bg-red-900/30 border border-red-500/30 text-white/90"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-medium truncate text-[11px]">{group.name}</span>
                  <span className="text-[10px] text-white/50 flex items-center gap-1">
                    <Calendar size={10} />
                    {dateRange}
                    {' · '}
                    {t('view.pendingTasksCount', { count: pendingCount })}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
                    onClick={() => onEditGroup?.(group)}
                    title={t('common.edit')}
                  >
                    <Edit2 size={12} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-white/60 hover:text-red-400 hover:bg-red-500/10"
                    onClick={() => onDeleteGroup(group.id)}
                    title={t('common.delete')}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
