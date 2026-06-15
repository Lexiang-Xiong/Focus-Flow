import { describe, it, expect } from 'vitest';
import type { Task, Zone } from '@/types';
import { groupTasksByZone } from './global-view-utils';

function task(id: string, zoneId: string, over: Partial<Task> = {}): Task {
  return {
    id,
    zoneId,
    parentId: null,
    title: id,
    description: '',
    completed: false,
    priority: 'medium',
    urgency: 'low',
    deadline: null,
    deadlineType: 'none',
    order: 0,
    createdAt: 0,
    expanded: false,
    isCollapsed: false,
    totalWorkTime: 0,
    ...over,
  } as Task;
}

function zone(id: string, name: string, color: string): Zone {
  return { id, name, color, order: 0, createdAt: 0 };
}

describe('groupTasksByZone', () => {
  it('空任务列表返回空数组', () => {
    expect(groupTasksByZone([], [zone('z1', 'Zone 1', '#f00')])).toEqual([]);
  });

  it('按 zoneId 分组并保留 zone 名称/颜色', () => {
    const zones = [zone('z1', 'Work', '#f00'), zone('z2', 'Life', '#0f0')];
    const tasks = [
      task('t1', 'z1'),
      task('t2', 'z2'),
      task('t3', 'z1'),
    ];
    const groups = groupTasksByZone(tasks, zones);
    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe('Work');
    expect(groups[0].tasks.map(t => t.id)).toEqual(['t1', 't3']);
    expect(groups[1].title).toBe('Life');
    expect(groups[1].tasks.map(t => t.id)).toEqual(['t2']);
  });

  it('忽略没有对应 zone 的任务', () => {
    const zones = [zone('z1', 'Zone 1', '#f00')];
    const tasks = [task('t1', 'z1'), task('t2', 'z-unknown')];
    const groups = groupTasksByZone(tasks, zones);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks.map(t => t.id)).toEqual(['t1']);
  });

  it('空 zone 列表返回空数组', () => {
    const tasks = [task('t1', 'z1')];
    expect(groupTasksByZone(tasks, [])).toEqual([]);
  });

  it('保持 zone 传入顺序', () => {
    const zones = [zone('z2', 'Zone 2', '#0f0'), zone('z1', 'Zone 1', '#f00')];
    const tasks = [task('t1', 'z1'), task('t2', 'z2')];
    const groups = groupTasksByZone(tasks, zones);
    expect(groups.map(g => g.zoneId)).toEqual(['z2', 'z1']);
  });
});
