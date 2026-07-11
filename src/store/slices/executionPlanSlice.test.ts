import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';

vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key, changeLanguage: () => {} },
}));

import { createExecutionPlanSlice, type ExecutionPlanSlice, isPlanGroupExpired, isDateInPlanGroupRange, findOverlappingSpan } from './executionPlanSlice';
import { createTaskSlice, type TaskSlice } from './taskSlice';
import { createUndoSlice, type UndoSlice } from './undoSlice';

type Combined = ExecutionPlanSlice & TaskSlice & UndoSlice;
type Store = StoreApi<Combined>;

const initCombined: StateCreator<Combined> = (set, get, api) => ({
  ...createTaskSlice(set as never, get as never, api as never),
  ...createExecutionPlanSlice(set as never, get as never, api as never),
  ...createUndoSlice(set as never, get as never, api as never),
});

function makeStore(): Store {
  return createStore<Combined>()(initCombined);
}

let store: Store;
beforeEach(() => {
  store = makeStore();
});

const groupByName = (name: string) => store.getState().planGroups.find(g => g.name === name)!;

// ============ 创建计划组 ============
describe('addPlanGroup', () => {
  it('创建无时间计划组并返回 id', () => {
    const id = store.getState().addPlanGroup('七月中期短期计划');
    const groups = store.getState().planGroups;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id, name: '七月中期短期计划', startDate: null, endDate: null, order: 0 });
    expect(groups[0].createdAt).toBeTypeOf('number');
  });

  it('创建有时间计划组并保证 startDate <= endDate', () => {
    store.getState().addPlanGroup('倒序日期组', '2026-07-15', '2026-07-11');
    const g = groupByName('倒序日期组');
    expect(g.startDate).toBe('2026-07-11');
    expect(g.endDate).toBe('2026-07-15');
  });

  it('多个计划组 order 递增', () => {
    store.getState().addPlanGroup('A');
    store.getState().addPlanGroup('B');
    expect(store.getState().planGroups.map(g => g.order)).toEqual([0, 1]);
  });
});

// ============ 更新 / 查询 / 排序 ============
describe('updatePlanGroup / getPlanGroupById / reorderPlanGroups', () => {
  it('updatePlanGroup 改名并修正日期顺序', () => {
    store.getState().addPlanGroup('旧名', '2026-07-11', '2026-07-13');
    const id = store.getState().planGroups[0].id;
    store.getState().updatePlanGroup(id, { name: '新名', startDate: '2026-07-20', endDate: '2026-07-18' });
    const g = store.getState().getPlanGroupById(id);
    expect(g).toMatchObject({ name: '新名', startDate: '2026-07-18', endDate: '2026-07-20' });
  });

  it('reorderPlanGroups 按传入顺序重排', () => {
    store.getState().addPlanGroup('A');
    store.getState().addPlanGroup('B');
    const [a, b] = store.getState().planGroups;
    store.getState().reorderPlanGroups([b, a]);
    expect(store.getState().planGroups.map(g => g.name)).toEqual(['B', 'A']);
  });
});

// ============ 删除计划组：清理任务引用 ============
describe('deletePlanGroup', () => {
  it('删除计划组时清理所有任务对该组的引用', () => {
    store.getState().addPlanGroup('G1');
    store.getState().addPlanGroup('G2');
    const g1 = groupByName('G1').id;
    const g2 = groupByName('G2').id;

    store.getState().addTask('zone-1', '任务1', '');
    const taskId = store.getState().tasks[0].id;
    store.getState().addTaskToPlanGroup(taskId, g1);
    store.getState().addTaskToPlanGroup(taskId, g2);

    expect(store.getState().tasks[0].planGroupIds).toEqual([g1, g2]);

    store.getState().deletePlanGroup(g1);

    expect(store.getState().planGroups.map(g => g.id)).toEqual([g2]);
    expect(store.getState().tasks[0].planGroupIds).toEqual([g2]);
  });
});

// ============ 过期与日期范围判断 ============
describe('isPlanGroupExpired / isDateInPlanGroupRange', () => {
  it('endDate < today 时过期', () => {
    const group = { id: 'g', name: 'G', startDate: '2026-07-01', endDate: '2026-07-10', order: 0, createdAt: 0 };
    expect(isPlanGroupExpired(group, '2026-07-11')).toBe(true);
    expect(isPlanGroupExpired(group, '2026-07-10')).toBe(false);
  });

  it('无时间组永不过期且任意日期都在范围内', () => {
    const group = { id: 'g', name: 'G', startDate: null, endDate: null, order: 0, createdAt: 0 };
    expect(isPlanGroupExpired(group, '2026-07-11')).toBe(false);
    expect(isDateInPlanGroupRange(group, '2026-07-11')).toBe(true);
  });

  it('日期落在 [startDate, endDate] 内才算在范围', () => {
    const group = { id: 'g', name: 'G', startDate: '2026-07-11', endDate: '2026-07-15', order: 0, createdAt: 0 };
    expect(isDateInPlanGroupRange(group, '2026-07-12')).toBe(true);
    expect(isDateInPlanGroupRange(group, '2026-07-10')).toBe(false);
    expect(isDateInPlanGroupRange(group, '2026-07-16')).toBe(false);
  });
});

// ============ DailyPlanSpan ============
const makeSpan = (id: string, date: string, startHour: number, endHour: number) => ({
  id, date, startHour, endHour, createdAt: 0,
});

describe('DailyPlanSpan CRUD', () => {
  it('createDailyPlanSpan 创建时间块并返回 id', () => {
    const id = store.getState().createDailyPlanSpan('2026-07-12', 9, 12);
    expect(id).toBeTruthy();
    const span = store.getState().dailyPlanSpans.find(s => s.id === id);
    expect(span).toMatchObject({ date: '2026-07-12', startHour: 9, endHour: 12 });
  });

  it('开始时间必须严格小于结束时间', () => {
    expect(store.getState().createDailyPlanSpan('2026-07-12', 12, 12)).toBeNull();
    expect(store.getState().createDailyPlanSpan('2026-07-12', 13, 12)).toBeNull();
  });

  it('时间范围限制在 0–24 小时', () => {
    expect(store.getState().createDailyPlanSpan('2026-07-12', -1, 12)).toBeNull();
    expect(store.getState().createDailyPlanSpan('2026-07-12', 9, 25)).toBeNull();
  });

  it('重叠时间块不能创建', () => {
    store.getState().createDailyPlanSpan('2026-07-12', 9, 12);
    expect(store.getState().createDailyPlanSpan('2026-07-12', 11, 13)).toBeNull();
    expect(store.getState().createDailyPlanSpan('2026-07-12', 8, 10)).toBeNull();
  });

  it('不同日期的重叠时间允许', () => {
    store.getState().createDailyPlanSpan('2026-07-12', 9, 12);
    expect(store.getState().createDailyPlanSpan('2026-07-13', 10, 11)).toBeTruthy();
  });

  it('updateDailyPlanSpan 更新时间并检测重叠', () => {
    const id = store.getState().createDailyPlanSpan('2026-07-12', 9, 12)!;
    store.getState().createDailyPlanSpan('2026-07-12', 14, 16);

    expect(store.getState().updateDailyPlanSpan(id, { startHour: 13, endHour: 15 })).toBe(false);
    expect(store.getState().updateDailyPlanSpan(id, { startHour: 12, endHour: 14 })).toBe(true);

    const span = store.getState().dailyPlanSpans.find(s => s.id === id);
    expect(span).toMatchObject({ startHour: 12, endHour: 14 });
  });

  it('deleteDailyPlanSpan 删除时间块并清理任务引用', () => {
    store.getState().addTask('z1', '任务', '');
    const taskId = store.getState().tasks[0].id;

    const spanId = store.getState().createDailyPlanSpan('2026-07-12', 9, 12)!;
    store.getState().addTaskToDailyPlan(taskId, '2026-07-12');
    store.getState().moveTaskToDailyPlanSpan(taskId, '2026-07-12', spanId);

    expect(store.getState().tasks[0].dailyPlanSpanIds?.['2026-07-12']).toBe(spanId);

    store.getState().deleteDailyPlanSpan(spanId);

    expect(store.getState().dailyPlanSpans).toHaveLength(0);
    expect(store.getState().tasks[0].dailyPlanSpanIds?.['2026-07-12']).toBeUndefined();
  });

  it('getDailyPlanSpansByDate 返回按开始时间排序的列表', () => {
    store.getState().createDailyPlanSpan('2026-07-12', 14, 16);
    store.getState().createDailyPlanSpan('2026-07-12', 9, 12);
    store.getState().createDailyPlanSpan('2026-07-13', 10, 11);

    const result = store.getState().getDailyPlanSpansByDate('2026-07-12');
    expect(result.map(s => s.startHour)).toEqual([9, 14]);
  });
});

describe('findOverlappingSpan', () => {
  const spans = [
    makeSpan('s1', '2026-07-12', 9, 12),
    makeSpan('s2', '2026-07-12', 14, 16),
  ];

  it('检测时间交叉', () => {
    expect(findOverlappingSpan(spans, '2026-07-12', 11, 15)).toBe(spans[0]);
    expect(findOverlappingSpan(spans, '2026-07-12', 8, 10)).toBe(spans[0]);
    expect(findOverlappingSpan(spans, '2026-07-12', 12, 14)).toBeUndefined();
  });

  it('excludeId 排除自身', () => {
    expect(findOverlappingSpan(spans, '2026-07-12', 9, 12, 's1')).toBeUndefined();
  });

  it('不同日期不重叠', () => {
    expect(findOverlappingSpan(spans, '2026-07-13', 10, 15)).toBeUndefined();
  });
});
