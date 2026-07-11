import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
  onToggleExpanded,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromDailyPlan,
}: DailyPlanBacklogProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: 'daily-plan-backlog' });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col border-b border-white/10 bg-black/10 transition-all ${
        isOver ? 'bg-white/5' : ''
      } ${expanded ? 'min-h-[120px] max-h-[45%]' : 'shrink-0'}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-sm font-medium text-white/80">
          {t('view.backlog')} ({tasks.length})
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-white/50 hover:text-white/80 hover:bg-white/10"
          onClick={onToggleExpanded}
          title={expanded ? t('common.collapse') : t('common.expand')}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </Button>
      </div>

      {expanded && (
        <div className="flex-1 overflow-y-auto p-3">
          {tasks.length === 0 ? (
            <div className="text-sm text-white/40 text-center py-4">{t('view.noBacklogTasks')}</div>
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
