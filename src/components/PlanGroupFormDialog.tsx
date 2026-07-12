import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePickerPopover } from './DatePickerPopover';
import type { PlanGroup } from '@/types';

interface PlanGroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGroup?: PlanGroup | null;
  onSubmit: (name: string, startDate: string | null, endDate: string | null) => void;
}

export function PlanGroupFormDialog({
  open,
  onOpenChange,
  initialGroup,
  onSubmit,
}: PlanGroupFormDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [noDateRange, setNoDateRange] = useState(false);

  const isEdit = !!initialGroup;

  useEffect(() => {
    if (open) {
      if (initialGroup) {
        setName(initialGroup.name);
        setStartDate(initialGroup.startDate ?? null);
        setEndDate(initialGroup.endDate ?? null);
        setNoDateRange(!initialGroup.startDate && !initialGroup.endDate);
      } else {
        setName('');
        setStartDate(null);
        setEndDate(null);
        setNoDateRange(false);
      }
    }
  }, [open, initialGroup]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed, noDateRange ? null : startDate, noDateRange ? null : endDate);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-4 bg-[#1a1a24] border-white/10 text-white text-xs">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {isEdit ? t('view.editPlanGroup') : t('view.createPlanGroup')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="plan-group-name" className="text-xs text-white/80">
              {t('view.planGroupName')}
            </Label>
            <Input
              id="plan-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('view.planGroupName')}
              className="bg-black/30 border-white/20 text-white placeholder:text-white/50"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="no-date-range"
              checked={noDateRange}
              onCheckedChange={(checked) => setNoDateRange(checked === true)}
            />
            <Label htmlFor="no-date-range" className="text-xs text-white/80 cursor-pointer">
              {t('view.noDate')}
            </Label>
          </div>

          {!noDateRange && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-white/80">{t('view.startDate')}</Label>
                <DatePickerPopover
                  selected={startDate}
                  onSelect={setStartDate}
                  placeholder={t('view.startDate')}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-white/80">{t('view.endDate')}</Label>
                <DatePickerPopover
                  selected={endDate}
                  onSelect={setEndDate}
                  placeholder={t('view.endDate')}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={!name.trim()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
