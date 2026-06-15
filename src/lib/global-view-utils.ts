import type { Task, Zone } from '@/types';

export interface TaskZoneGroup {
  title: string;
  color: string;
  zoneId: string;
  tasks: Task[];
}

/**
 * 将任务按工作区（Zone）分组。
 * 只保留存在对应 zone 的分组，并保持 zones 数组的传入顺序。
 */
export function groupTasksByZone(tasks: Task[], zones: Zone[]): TaskZoneGroup[] {
  const groups: TaskZoneGroup[] = [];

  zones.forEach((zone) => {
    const zoneTasks = tasks.filter((t) => t.zoneId === zone.id);
    if (zoneTasks.length > 0) {
      groups.push({
        title: zone.name || 'Unknown Zone',
        color: zone.color,
        zoneId: zone.id,
        tasks: zoneTasks,
      });
    }
  });

  return groups;
}
