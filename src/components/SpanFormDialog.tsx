import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
  onSubmit: (startHour: number, endHour: number) => void;
}

const HOUR_OPTIONS = Array.from({ length: 49 }, (_, i) => i * 0.5);

function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
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
  const [startHour, setStartHour] = useState<number>(initialStartHour ?? 9);
  const [endHour, setEndHour] = useState<number>(initialEndHour ?? 10);

  const error = useMemo(() => {
    if (startHour >= endHour) return t('view.spanStartBeforeEnd');
    return null;
  }, [startHour, endHour, t]);

  const handleSubmit = () => {
    if (error) return;
    onSubmit(startHour, endHour);
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
              value={String(startHour)}
              onValueChange={(value) => setStartHour(Number(value))}
            >
              <SelectTrigger className="bg-black/30 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black border-white/20 text-white max-h-[240px]">
                {HOUR_OPTIONS.map(h => (
                  <SelectItem key={h} value={String(h)}>{formatHour(h)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white/70">{t('view.endTime')}</Label>
            <Select
              value={String(endHour)}
              onValueChange={(value) => setEndHour(Number(value))}
            >
              <SelectTrigger className="bg-black/30 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black border-white/20 text-white max-h-[240px]">
                {HOUR_OPTIONS.map(h => (
                  <SelectItem key={h} value={String(h)}>{formatHour(h)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
