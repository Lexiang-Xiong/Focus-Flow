import { useState, useCallback } from 'react';
import type { Task, Zone, ClipboardData } from '@/types';

export function useClipboard() {
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // 复制任务
  const copyTask = useCallback((task: Task) => {
    setClipboard({
      type: 'task',
      data: { ...task },
      timestamp: Date.now(),
    });
  }, []);

  // 复制工作区（含任务）
  const copyZone = useCallback((zone: Zone, tasks: Task[]) => {
    setClipboard({
      type: 'zone',
      data: { zone: { ...zone }, tasks: tasks.map((t) => ({ ...t })) },
      timestamp: Date.now(),
    });
  }, []);

  // 粘贴任务到工作区
  const pasteTask = useCallback((zoneId: string): Task | null => {
    if (!clipboard || clipboard.type !== 'task') return null;
    const task = clipboard.data as Task;
    return {
      ...task,
      id: `task-${Date.now()}`,
      zoneId,
      order: 0, // 会在 addTask 中计算
      createdAt: Date.now(),
      completed: false,
      completedAt: undefined,
      totalWorkTime: 0,
    };
  }, [clipboard]);

  // 粘贴工作区
  const pasteZone = useCallback((zones: Zone[]): { zone: Zone; tasks: Task[] } | null => {
    if (!clipboard || clipboard.type !== 'zone') return null;
    const data = clipboard.data as { zone: Zone; tasks: Task[] };
    const newZoneId = `zone-${Date.now()}`;
    const maxOrder = zones.length > 0 ? Math.max(...zones.map((z) => z.order)) : -1;

    return {
      zone: {
        ...data.zone,
        id: newZoneId,
        name: `${data.zone.name} (副本)`,
        order: maxOrder + 1,
      },
      tasks: data.tasks.map((task, index) => ({
        ...task,
        id: `task-${Date.now()}-${index}`,
        zoneId: newZoneId,
        order: index,
        createdAt: Date.now(),
        completed: false,
        completedAt: undefined,
        totalWorkTime: 0,
      })),
    };
  }, [clipboard]);

  return {
    clipboard,
    copyTask,
    copyZone,
    pasteTask,
    pasteZone,
    hasTask: clipboard?.type === 'task',
    hasZone: clipboard?.type === 'zone',
  };
}
