import { useTranslation } from 'react-i18next';
import { GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task, Zone } from '@/types';

interface SortableTaskItemProps {
  task: Task;
  zone?: Zone;
  selectedDate: string;
  dragHandleTitle?: string;
  onToggleTask: (taskId: string) => void;
  onNavigateToZone: (zoneId: string, taskId?: string) => void;
  onRemoveTaskFromDailyPlan: (taskId: string, date: string) => void;
  onRemoveFromSpan?: (taskId: string) => void;
}

export function SortableTaskItem({
  task,
  zone,
  selectedDate,
  dragHandleTitle,
  onToggleTask,
  onNavigateToZone,
  onRemoveTaskFromDailyPlan,
  onRemoveFromSpan,
}: SortableTaskItemProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 rounded bg-black/20 hover:bg-white/5 border border-white/5"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-white/30 hover:text-white/60 cursor-grab active:cursor-grabbing shrink-0"
        title={dragHandleTitle ?? t('task.dragToSort')}
      >
        <GripVertical size={14} />
      </button>
      <Checkbox
        checked={task.completed}
        onCheckedChange={() => onToggleTask(task.id)}
        className="border-white/30"
      />
      <button
        onClick={() => onNavigateToZone(task.zoneId, task.id)}
        className="flex-1 text-left min-w-0"
      >
        <div className={`text-[13px] truncate hover:underline ${
          task.completed ? 'line-through text-white/40' : 'text-white/90'
        }`}>
          {task.title}
        </div>
        {task.description && (
          <div className="text-[12px] text-white/50 truncate mt-0.5">
            {task.description}
          </div>
        )}
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
        onClick={() => onRemoveFromSpan ? onRemoveFromSpan(task.id) : onRemoveTaskFromDailyPlan(task.id, selectedDate)}
        title={onRemoveFromSpan ? t('task.removeFromSpan') : t('task.removeFromPlan')}
      >
        <X size={12} />
      </Button>
    </div>
  );
}
