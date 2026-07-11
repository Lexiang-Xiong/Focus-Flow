import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanGroupView } from './PlanGroupView';
import { DailyPlanView } from './DailyPlanView';
import type { PlanGroup, Task, Zone, DailyPlanSpan } from '@/types';

type ExecutionPlanTab = 'daily' | 'groups';

interface ExecutionPlanViewProps {
  planGroups: PlanGroup[];
  tasks: Task[];
  zones: Zone[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  onBack: () => void;
  onAddGroup: (name: string, startDate: string | null, endDate: string | null) => void;
  onUpdateGroup: (id: string, updates: Partial<Omit<PlanGroup, 'id'>>) => void;
  onDeleteGroup: (id: string) => void;
  onToggleTask: (taskId: string) => void;
  onNavigateToZone: (zoneId: string, taskId?: string) => void;
  onRemoveTaskFromGroup: (taskId: string, groupId: string) => void;
  onRemoveTaskFromDailyPlan: (taskId: string, date: string) => void;
  onAddTasksToDailyPlan: (taskIds: string[], date: string) => void;
  onSetDailyPlanOrder: (taskId: string, date: string, order: number) => void;
  onMoveTaskToSpan: (taskId: string, date: string, spanId: string, order?: number) => void;
  onMoveTaskOutOfSpan: (taskId: string, date: string, spanId: string) => void;
  onSetDailyPlanSpanOrder: (taskId: string, date: string, spanId: string, order: number) => void;
  onCreateSpan: (date: string, startHour: number, endHour: number, description?: string) => string | null;
  onUpdateSpan: (spanId: string, updates: Partial<Omit<DailyPlanSpan, 'id'>>) => boolean;
  onDeleteSpan: (spanId: string) => void;
  spans: DailyPlanSpan[];
}

export function ExecutionPlanView({
  planGroups,
  tasks,
  zones,
  selectedDate,
  onDateChange,
  onBack,
  onAddGroup,
  onUpdateGroup,
  onDeleteGroup,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromGroup,
  onRemoveTaskFromDailyPlan,
  onAddTasksToDailyPlan,
  onSetDailyPlanOrder,
  onMoveTaskToSpan,
  onMoveTaskOutOfSpan,
  onSetDailyPlanSpanOrder,
  onCreateSpan,
  onUpdateSpan,
  onDeleteSpan,
  spans,
}: ExecutionPlanViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ExecutionPlanTab>('daily');

  return (
    <div className="flex flex-col h-full bg-[#13131a]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={onBack}
            title={t('common.back')}
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft size={16} />
          </Button>
          <span className="text-sm font-medium text-white/90">{t('view.executionPlan')}</span>
        </div>

        <div className="flex items-center gap-1 bg-black/30 rounded-md p-0.5 border border-white/10">
          <Button
            size="sm"
            variant={tab === 'daily' ? 'secondary' : 'ghost'}
            onClick={() => setTab('daily')}
            className={`h-7 text-xs ${
              tab === 'daily'
                ? 'bg-white/15 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            <CalendarDays size={13} className="mr-1" />
            {t('view.dailyPlan')}
          </Button>
          <Button
            size="sm"
            variant={tab === 'groups' ? 'secondary' : 'ghost'}
            onClick={() => setTab('groups')}
            className={`h-7 text-xs ${
              tab === 'groups'
                ? 'bg-white/15 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            <Layers size={13} className="mr-1" />
            {t('view.planGroups')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'groups' ? (
          <PlanGroupView
            planGroups={planGroups}
            tasks={tasks}
            zones={zones}
            onAddGroup={onAddGroup}
            onUpdateGroup={onUpdateGroup}
            onDeleteGroup={onDeleteGroup}
            onToggleTask={onToggleTask}
            onNavigateToZone={onNavigateToZone}
            onRemoveTaskFromGroup={onRemoveTaskFromGroup}
          />
        ) : (
          <DailyPlanView
            planGroups={planGroups}
            tasks={tasks}
            zones={zones}
            selectedDate={selectedDate}
            onDateChange={onDateChange}
            onToggleTask={onToggleTask}
            onNavigateToZone={onNavigateToZone}
            onRemoveTaskFromDailyPlan={onRemoveTaskFromDailyPlan}
            onAddTasksToDailyPlan={onAddTasksToDailyPlan}
            onSetDailyPlanOrder={onSetDailyPlanOrder}
            onMoveTaskToSpan={onMoveTaskToSpan}
            onMoveTaskOutOfSpan={onMoveTaskOutOfSpan}
            onSetDailyPlanSpanOrder={onSetDailyPlanSpanOrder}
            onCreateSpan={onCreateSpan}
            onUpdateSpan={onUpdateSpan}
            onDeleteSpan={onDeleteSpan}
            spans={spans}
          />
        )}
      </div>
    </div>
  );
}
