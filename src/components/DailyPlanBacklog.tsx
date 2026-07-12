import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { SortableTaskItem } from './SortableTaskItem';
import { Button } from '@/components/ui/button';
import type { Task, Zone } from '@/types';

interface DailyPlanBacklogProps {
  date: string;
  tasks: Task[];
  zones: Zone[];
  expanded: boolean;
  collapsed?: boolean;
  layout?: 'vertical' | 'horizontal';
  style?: React.CSSProperties;
  onToggleExpanded: () => void;
  onToggleTask: (taskId: string) => void;
  onNavigateToZone: (zoneId: string, taskId?: string) => void;
  onRemoveTaskFromDailyPlan: (taskId: string, date: string) => void;
}

function getZoneById(zones: Zone[], zoneId: string): Zone | undefined {
  return zones.find(z => z.id === zoneId);
}

export function DailyPlanBacklog({
  date,
  tasks,
  zones,
  expanded,
  collapsed,
  layout = 'vertical',
  style,
  onToggleExpanded,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromDailyPlan,
}: DailyPlanBacklogProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: 'daily-plan-backlog' });

  if (collapsed) {
    return (
      <div
        style={style}
        className="h-full flex flex-col items-center justify-between py-2 bg-black/10 border-r border-white/10"
      >
        <span
          className="text-xs font-medium text-white/70"
          style={{ writingMode: 'vertical-rl' }}
        >
          {t('view.dailyTasks')}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-white/50 hover:text-white/80 hover:bg-white/10"
          onClick={onToggleExpanded}
          title={t('common.expand')}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shrink-0 border-b border-white/10 bg-black/10 transition-all flex flex-col ${
        isOver ? 'bg-white/5' : ''
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-sm font-medium text-white/80">
          {t('view.dailyTasks')} ({tasks.length})
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-white/50 hover:text-white/80 hover:bg-white/10"
          onClick={onToggleExpanded}
          title={expanded ? t('common.collapse') : t('common.expand')}
        >
          {layout === 'horizontal' ? (
            <ChevronLeft size={16} />
          ) : expanded ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </Button>
      </div>

      {expanded && (
        <div className="flex-1 overflow-y-auto p-3">
          {tasks.length === 0 ? (
            <div className="text-sm text-white/40 text-center py-4">{t('view.noDailyTasks')}</div>
          ) : (
            <SortableContext
              items={tasks.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {tasks.map(task => {
                  const zone = getZoneById(zones, task.zoneId);
                  return (
                    <SortableTaskItem
                      key={task.id}
                      task={task}
                      zone={zone}
                      selectedDate={date}
                      dragHandleTitle={t('task.dragToSort')}
                      onToggleTask={onToggleTask}
                      onNavigateToZone={onNavigateToZone}
                      onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
                    />
                  );
                })}
              </div>
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}
