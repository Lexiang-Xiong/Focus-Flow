import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SpanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStartHour?: number;
  initialEndHour?: number;
  onSubmit: (startHour: number, endHour: number, description?: string) => void;
}

const STEP_MINUTES = 5;
const TOTAL_MINUTES = 24 * 60;

function formatHour(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function SpanFormDialog({
  open,
  onOpenChange,
  initialStartHour,
  initialEndHour,
  onSubmit,
}: SpanFormDialogProps) {
  const { t } = useTranslation();
  const [startMinutes, setStartMinutes] = useState<number>(() => {
    const m = Math.round((initialStartHour ?? 9) * 60);
    return Math.round(m / STEP_MINUTES) * STEP_MINUTES;
  });
  const [endMinutes, setEndMinutes] = useState<number>(() => {
    const m = Math.round((initialEndHour ?? 10) * 60);
    return Math.round(m / STEP_MINUTES) * STEP_MINUTES;
  });
  const [description, setDescription] = useState('');

  const error = useMemo(() => {
    if (startMinutes >= endMinutes) return t('view.spanStartBeforeEnd');
    return null;
  }, [startMinutes, endMinutes, t]);

  const handleSubmit = () => {
    if (error) return;
    onSubmit(startMinutes / 60, endMinutes / 60, description.trim() || undefined);
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={`${open}-${initialStartHour}-${initialEndHour}`} className="sm:max-w-md bg-[#1a1a24] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>{t('view.createSpan')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-white/70">{t('view.startTime')}</Label>
            <Select
              value={String(startMinutes)}
              onValueChange={(value) => setStartMinutes(Number(value))}
            >
              <SelectTrigger className="bg-black/30 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black border-white/20 text-white max-h-[240px]">
                {Array.from({ length: TOTAL_MINUTES / STEP_MINUTES + 1 }, (_, i) => i * STEP_MINUTES).map((m) => (
                  <SelectItem key={m} value={String(m)}>{formatHour(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white/70">{t('view.endTime')}</Label>
            <Select
              value={String(endMinutes)}
              onValueChange={(value) => setEndMinutes(Number(value))}
            >
              <SelectTrigger className="bg-black/30 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black border-white/20 text-white max-h-[240px]">
                {Array.from({ length: TOTAL_MINUTES / STEP_MINUTES + 1 }, (_, i) => i * STEP_MINUTES).map((m) => (
                  <SelectItem key={m} value={String(m)}>{formatHour(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white/70">{t('view.spanDescription')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('view.spanDescriptionPlaceholder')}
              className="bg-black/30 border-white/20 text-white placeholder:text-white/30 resize-none min-h-[72px]"
            />
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={!!error} onClick={handleSubmit}>
            {t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
