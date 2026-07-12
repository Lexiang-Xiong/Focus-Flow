import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PlanGroupFormDialog } from './PlanGroupFormDialog';
import { ExpiredPlanGroups } from './ExpiredPlanGroups';
import type { PlanGroup, Task, Zone } from '@/types';
import { isPlanGroupExpired } from '@/store/slices/executionPlanSlice';

interface PlanGroupViewProps {
  planGroups: PlanGroup[];
  tasks: Task[];
  zones: Zone[];
  today?: string;
  onAddGroup: (name: string, startDate: string | null, endDate: string | null) => void;
  onUpdateGroup: (id: string, updates: Partial<Omit<PlanGroup, 'id'>>) => void;
  onDeleteGroup: (id: string) => void;
  onToggleTask: (taskId: string) => void;
  onNavigateToZone: (zoneId: string, taskId?: string) => void;
  onRemoveTaskFromGroup: (taskId: string, groupId: string) => void;
}

function getZoneById(zones: Zone[], zoneId: string): Zone | undefined {
  return zones.find(z => z.id === zoneId);
}

export function PlanGroupView({
  planGroups,
  tasks,
  zones,
  today = new Date().toISOString().slice(0, 10),
  onAddGroup,
  onUpdateGroup,
  onDeleteGroup,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromGroup,
}: PlanGroupViewProps) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PlanGroup | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const activeGroups = useMemo(
    () => planGroups.filter(g => !isPlanGroupExpired(g, today)).sort((a, b) => a.order - b.order),
    [planGroups, today]
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <h2 className="text-sm font-medium text-white/90">{t('view.planGroups')}</h2>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowForm(true)}>
          <Plus size={14} className="mr-1" />
          {t('view.createPlanGroup')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeGroups.length === 0 && (
          <div className="text-xs text-white/50 text-center py-8">{t('view.noPlanGroups')}</div>
        )}

        {activeGroups.map(group => {
          const groupTasks = tasks.filter(t => t.planGroupIds?.includes(group.id));
          const pendingCount = groupTasks.filter(t => !t.completed).length;
          const isExpanded = expandedIds.has(group.id);
          const dateRange =
            group.startDate || group.endDate
              ? `${group.startDate ?? ''} ~ ${group.endDate ?? ''}`
              : t('view.noDate');

          return (
            <div
              key={group.id}
              className="rounded-lg border border-white/10 bg-black/20 overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2">
                <button
                  onClick={() => toggleExpanded(group.id)}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  {isExpanded ? <ChevronUp size={14} className="text-white/70" /> : <ChevronDown size={14} className="text-white/70" />}
                  <span className="font-medium truncate text-xs">{group.name}</span>
                  <span className="text-xs text-white/50 whitespace-nowrap">
                    {t('view.tasksCount', { count: groupTasks.length })} ·{' '}
                    {t('view.pendingTasksCount', { count: pendingCount })}
                  </span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
                    onClick={() => setEditingGroup(group)}
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

              <div className="px-3 pb-2 text-xs text-white/50 flex items-center gap-1">
                <Calendar size={10} />
                {dateRange}
              </div>

              {isExpanded && (
                <div className="border-t border-white/10">
                  {groupTasks.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-white/40 text-center">
                      {t('task.noTasks')}
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {groupTasks.map(task => {
                        const zone = getZoneById(zones, task.zoneId);
                        return (
                          <div
                            key={task.id}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-white/5"
                          >
                            <Checkbox
                              checked={task.completed}
                              onCheckedChange={() => onToggleTask(task.id)}
                              className="border-white/30"
                            />
                            <button
                              onClick={() => onNavigateToZone(task.zoneId, task.id)}
                              className={`flex-1 text-left text-xs truncate hover:underline ${
                                task.completed ? 'line-through text-white/40' : 'text-white/90'
                              }`}
                            >
                              {task.title}
                            </button>
                            {zone && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: zone.color }}
                                title={zone.name}
                              />
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-white/40 hover:text-white/80 hover:bg-white/10 shrink-0"
                              onClick={() => onRemoveTaskFromGroup(task.id, group.id)}
                              title={t('task.removeFromPlan')}
                            >
                              <X size={12} />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <ExpiredPlanGroups
          planGroups={planGroups}
          tasks={tasks}
          onDeleteGroup={onDeleteGroup}
          onEditGroup={setEditingGroup}
        />
      </div>

      <PlanGroupFormDialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingGroup(null);
        }}
        onSubmit={onAddGroup}
      />

      <PlanGroupFormDialog
        open={!!editingGroup}
        onOpenChange={(open) => {
          if (!open) setEditingGroup(null);
        }}
        initialGroup={editingGroup ?? undefined}
        onSubmit={(name, startDate, endDate) => {
          if (editingGroup) {
            onUpdateGroup(editingGroup.id, { name, startDate, endDate });
          }
        }}
      />
    </div>
  );
}
