import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

interface DatePickerPopoverProps {
  selected?: string | null;
  onSelect: (date: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

const calendarClassNames = {
  root: 'calendar-dark',
  months: 'flex flex-col gap-1 relative',
  month: 'flex flex-col',
  caption: 'flex justify-center items-center py-1 relative',
  caption_label: 'text-[11px] font-medium text-white',
  nav: 'absolute inset-x-0 top-1 flex items-center justify-between w-full z-10 px-1',
  nav_button: 'h-5 w-5 bg-black p-0 text-white hover:bg-white hover:text-black rounded flex items-center justify-center transition-colors text-[10px] border border-white/20',
  nav_button_previous: '',
  nav_button_next: '',
  table: 'w-full border-collapse space-y-1',
  head_row: 'flex',
  head_cell: 'text-white/50 rounded-md w-8 font-normal text-[10px]',
  row: 'flex w-full mt-1',
  cell: 'h-8 w-8 text-center text-[11px] p-0 relative focus-within:relative focus-within:z-20',
  day: 'h-8 w-8 p-0 font-normal text-white bg-black hover:bg-white hover:text-black rounded-md transition-colors',
  day_selected: 'bg-white text-black hover:bg-white hover:text-black',
  day_today: 'border border-green-500 text-green-400',
  day_outside: 'text-white/30 opacity-50',
  day_disabled: 'text-white/30 opacity-50',
  day_hidden: 'invisible',
};

function formatDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return dateStr;
}

export function DatePickerPopover({
  selected,
  onSelect,
  placeholder = '选择日期',
  disabled = false,
}: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="justify-start text-left font-normal h-7 text-[11px] bg-black/30 border-white/20 text-white hover:bg-white/10 hover:text-white"
        >
          <CalendarIcon size={14} className="mr-1.5 opacity-70" />
          {selected ? formatDisplay(selected) : <span className="text-white/50">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2 bg-black border border-white/20 z-[9999]"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <CalendarComponent
          mode="single"
          selected={selected ? new Date(selected) : undefined}
          onSelect={(date) => {
            if (date) {
              // 使用本地日期，避免 toISOString 的时区偏移导致日期差一天
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              onSelect(`${year}-${month}-${day}`);
            } else {
              onSelect(null);
            }
            setOpen(false);
          }}
          className="rounded-md my-2"
          classNames={calendarClassNames}
        />
      </PopoverContent>
    </Popover>
  );
}
