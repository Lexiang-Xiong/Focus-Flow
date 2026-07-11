import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';

vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key, changeLanguage: () => {} },
}));

import { createExecutionPlanSlice, type ExecutionPlanSlice, isPlanGroupExpired, isDateInPlanGroupRange } from './executionPlanSlice';
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
