import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePickerPopover } from './DatePickerPopover';
import type { PlanGroup, Task } from '@/types';
import { isPlanGroupExpired } from '@/store/slices/executionPlanSlice';

interface AddToPlanMenuProps {
  task: Task;
  planGroups: PlanGroup[];
  onAddToDailyPlan: (taskId: string, date: string) => void;
  onAddToPlanGroup: (taskId: string, groupId: string) => void;
  className?: string;
}

type Step = 'menu' | 'daily' | 'group';

export function AddToPlanMenu({
  task,
  planGroups,
  onAddToDailyPlan,
  onAddToPlanGroup,
  className = '',
}: AddToPlanMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('menu');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const safePlanGroups = planGroups || [];
  const activeGroups = useMemo(
    () => safePlanGroups.filter(g => !isPlanGroupExpired(g, today)).sort((a, b) => a.order - b.order),
    [safePlanGroups, today]
  );

  const handleClose = () => {
    setOpen(false);
    setStep('menu');
    setSelectedDate(null);
  };

  const handleAddToDaily = () => {
    if (!selectedDate) return;
    onAddToDailyPlan(task.id, selectedDate);
    handleClose();
  };

  const handleAddToGroup = (groupId: string) => {
    onAddToPlanGroup(task.id, groupId);
    handleClose();
  };

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className={`task-action-btn ${className}`}
        onClick={() => setOpen(true)}
        title={t('task.addToDailyPlan')}
      >
        <CalendarPlus size={12} />
      </Button>

      <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-md p-4 bg-[#1a1a24] border-white/10 text-white text-[11px]">
          <DialogHeader>
            <DialogTitle className="text-[12px]">
              {step === 'menu' && t('task.addToPlanGroup')}
              {step === 'daily' && t('task.addToDailyPlan')}
              {step === 'group' && t('task.addToPlanGroup')}
            </DialogTitle>
          </DialogHeader>

          {step === 'menu' && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <button
                onClick={() => {
                  setStep('daily');
                  setSelectedDate(today);
                }}
                className="flex flex-col items-center gap-2 p-3 rounded-lg bg-black/20 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <CalendarPlus size={20} className="text-green-400" />
                <span className="text-[11px]">{t('task.addToDailyPlan')}</span>
              </button>
              <button
                onClick={() => setStep('group')}
                className="flex flex-col items-center gap-2 p-3 rounded-lg bg-black/20 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <FolderPlus size={20} className="text-blue-400" />
                <span className="text-[11px]">{t('task.addToPlanGroup')}</span>
              </button>
            </div>
          )}

          {step === 'daily' && (
            <div className="space-y-4 py-2">
              <DatePickerPopover
                selected={selectedDate}
                onSelect={setSelectedDate}
                placeholder={t('view.startDate')}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setStep('menu')}>
                  {t('common.back')}
                </Button>
                <Button size="sm" className="h-7 text-[11px]" disabled={!selectedDate} onClick={handleAddToDaily}>
                  {t('common.add')}
                </Button>
              </div>
            </div>
          )}

          {step === 'group' && (
            <div className="space-y-2 py-2 max-h-[50vh] overflow-y-auto">
              {activeGroups.length === 0 ? (
                <div className="text-[10px] text-white/50 text-center py-4">{t('view.noPlanGroups')}</div>
              ) : (
                activeGroups.map(group => {
                  const alreadyIn = task.planGroupIds?.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      disabled={alreadyIn}
                      onClick={() => handleAddToGroup(group.id)}
                      className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                        alreadyIn
                          ? 'bg-white/5 border-white/5 text-white/40 cursor-not-allowed'
                          : 'bg-black/20 border-white/10 hover:bg-white/10 text-white/90'
                      }`}
                    >
                      <div className="font-medium text-[11px]">{group.name}</div>
                      <div className="text-[10px] text-white/50">
                        {group.startDate || group.endDate
                          ? `${group.startDate ?? ''} ~ ${group.endDate ?? ''}`
                          : t('view.noDate')}
                      </div>
                    </button>
                  );
                })
              )}
              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setStep('menu')}>
                  {t('common.back')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
