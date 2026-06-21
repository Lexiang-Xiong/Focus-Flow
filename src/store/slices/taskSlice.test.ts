import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';

// taskSlice 仅在 checkRecurringTasks 用到 i18n；这里桩掉避免拉起 i18next 初始化副作用。
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key, changeLanguage: () => {} },
}));

import { createTaskSlice, type TaskSlice } from './taskSlice';

type Store = StoreApi<TaskSlice>;

function makeStore(): Store {
  // createTaskSlice 是 StateCreator，可直接作为 vanilla store 的初始化器。
  // 其内部 get().saveSnapshot?.() 在缺少 undoSlice 时为 no-op。
  return createStore<TaskSlice>()(createTaskSlice as unknown as StateCreator<TaskSlice>);
}

let store: Store;
beforeEach(() => {
  store = makeStore();
});

// 便捷取所有任务里指定 id 的那个
const find = (id: string) => store.getState().tasks.find(t => t.id === id)!;

// ============ addTask ============
describe('addTask（新增任务）', () => {
  it('新增根任务带正确默认值', () => {
    store.getState().addTask('z1', '写测试', '描述');
    const tasks = store.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      zoneId: 'z1', title: '写测试', description: '描述',
      priority: 'medium', completed: false, parentId: null, order: 0,
    });
  });

  it('同级任务 order 递增', () => {
    store.getState().addTask('z1', 'A', '');
    store.getState().addTask('z1', 'B', '');
    const orders = store.getState().tasks.map(t => t.order);
    expect(orders).toEqual([0, 1]);
  });

  it('子任务挂在父任务下，order 在子级里独立计数', () => {
    store.getState().addTask('z1', 'parent', '');
    const parentId = store.getState().tasks[0].id;
    store.getState().addTask('z1', 'child', '', 'medium', 'low', null, 'none', parentId);
    const child = store.getState().tasks.find(t => t.title === 'child')!;
    expect(child.parentId).toBe(parentId);
    expect(child.order).toBe(0);
  });
});

// ============ toggleTask（完成状态联动） ============
describe('toggleTask（完成状态向上/向下联动）', () => {
  // 构造 parent{ c1, c2 }
  function seedParentWithChildren() {
    store.getState().addTask('z1', 'parent', '');
    const parentId = store.getState().tasks[0].id;
    store.getState().addTask('z1', 'c1', '', 'medium', 'low', null, 'none', parentId);
    store.getState().addTask('z1', 'c2', '', 'medium', 'low', null, 'none', parentId);
    const c1 = store.getState().tasks.find(t => t.title === 'c1')!.id;
    const c2 = store.getState().tasks.find(t => t.title === 'c2')!.id;
    return { parentId, c1, c2 };
  }

  it('完成父任务会级联完成所有子任务，并写入 completedAt', () => {
    const { parentId, c1, c2 } = seedParentWithChildren();
    store.getState().toggleTask(parentId);
    expect(find(parentId).completed).toBe(true);
    expect(find(c1).completed).toBe(true);
    expect(find(c2).completed).toBe(true);
    expect(find(parentId).completedAt).toBeTypeOf('number');
  });

  it('所有子任务完成后父任务自动完成', () => {
    const { parentId, c1, c2 } = seedParentWithChildren();
    store.getState().toggleTask(c1);
    expect(find(parentId).completed).toBe(false); // c2 未完成
    store.getState().toggleTask(c2);
    expect(find(parentId).completed).toBe(true);  // 全部完成 → 父自动完成
  });

  it('preventAutoComplete 开启时父任务不自动完成', () => {
    const { parentId, c1, c2 } = seedParentWithChildren();
    store.getState().updateTask(parentId, { preventAutoComplete: true });
    store.getState().toggleTask(c1);
    store.getState().toggleTask(c2);
    expect(find(parentId).completed).toBe(false);
  });
});

// ============ deleteTask ============
describe('deleteTask（删除）', () => {
  it('删除父任务会连带删除所有子孙', () => {
    store.getState().addTask('z1', 'parent', '');
    const parentId = store.getState().tasks[0].id;
    store.getState().addTask('z1', 'child', '', 'medium', 'low', null, 'none', parentId);
    const childId = store.getState().tasks.find(t => t.title === 'child')!.id;
    store.getState().addTask('z1', 'grandchild', '', 'medium', 'low', null, 'none', childId);

    store.getState().deleteTask(parentId);
    expect(store.getState().tasks).toHaveLength(0);
  });

  it('删除子任务不影响父任务', () => {
    store.getState().addTask('z1', 'parent', '');
    const parentId = store.getState().tasks[0].id;
    store.getState().addTask('z1', 'child', '', 'medium', 'low', null, 'none', parentId);
    const childId = store.getState().tasks.find(t => t.title === 'child')!.id;

    store.getState().deleteTask(childId);
    expect(store.getState().tasks.map(t => t.id)).toEqual([parentId]);
  });
});

// ============ 工时累计 ============
describe('addWorkTime（工时累计与向上汇总）', () => {
  it('记录自身 ownTime 与 totalWorkTime', () => {
    store.getState().addTask('z1', 'A', '');
    const id = store.getState().tasks[0].id;
    store.getState().addWorkTime(id, 60);
    expect(find(id).ownTime).toBe(60);
    expect(find(id).totalWorkTime).toBe(60);
    expect(store.getState().taskComputedTimes[id].totalWorkTime).toBe(60);
  });

  it('子任务工时向上累加到父任务 totalWorkTime', () => {
    store.getState().addTask('z1', 'parent', '');
    const parentId = store.getState().tasks[0].id;
    store.getState().addTask('z1', 'child', '', 'medium', 'low', null, 'none', parentId);
    const childId = store.getState().tasks.find(t => t.title === 'child')!.id;

    store.getState().addWorkTime(childId, 120);
    expect(find(childId).totalWorkTime).toBe(120);
    expect(find(parentId).totalWorkTime).toBe(120); // 父汇总子任务工时
    expect(find(parentId).ownTime ?? 0).toBe(0);     // 父自身未计时
  });
});

// ============ 预估时间 ============
describe('getEstimatedTime（预估时间自底向上汇总）', () => {
  it('父任务无自有预估时则汇总子任务', () => {
    store.getState().addTask('z1', 'parent', '');
    const parentId = store.getState().tasks[0].id;
    store.getState().addTask('z1', 'child', '', 'medium', 'low', null, 'none', parentId);
    const childId = store.getState().tasks.find(t => t.title === 'child')!.id;

    store.getState().updateTask(childId, { estimatedTime: 30 });
    expect(store.getState().getEstimatedTime(parentId)).toBe(30);
  });
});

// ============ getStats ============
describe('getStats（统计）', () => {
  it('统计总数/完成/待办/高优先级/紧急', () => {
    store.getState().addTask('z1', 'A', '', 'high', 'urgent');
    store.getState().addTask('z1', 'B', '', 'low', 'low');
    const aId = store.getState().tasks.find(t => t.title === 'A')!.id;
    store.getState().toggleTask(aId);

    const stats = store.getState().getStats();
    expect(stats.total).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.pending).toBe(1);
    // A 已完成，因此高优先级/紧急的“待办”计数为 0
    expect(stats.highPriority).toBe(0);
    expect(stats.urgent).toBe(0);
  });
});

// ============ moveTaskNode ============
describe('moveTaskNode（拖拽落位重排 order）', () => {
  it('按锚点把任务移动到目标位置并重排同级 order', () => {
    store.getState().addTask('z1', 'A', '');
    store.getState().addTask('z1', 'B', '');
    store.getState().addTask('z1', 'C', '');
    const id = (title: string) => store.getState().tasks.find(t => t.title === title)!.id;
    const A = id('A'), B = id('B'), C = id('C');

    // 把 C 移动到 A 之后（锚点 A）
    store.getState().moveTaskNode(C, null, A, 'z1');

    const orderOf = (tid: string) => find(tid).order;
    expect(orderOf(A)).toBe(0);
    expect(orderOf(C)).toBe(1);
    expect(orderOf(B)).toBe(2);
  });

  it('锚点为 null 时插到最前面', () => {
    store.getState().addTask('z1', 'A', '');
    store.getState().addTask('z1', 'B', '');
    const id = (title: string) => store.getState().tasks.find(t => t.title === title)!.id;
    const A = id('A'), B = id('B');

    store.getState().moveTaskNode(B, null, null, 'z1');
    expect(find(B).order).toBe(0);
    expect(find(A).order).toBe(1);
  });

  // T07 后半：右移缩进（改变父级）/ 左移升级（脱离父级）
  it('改父级：把同级任务缩进成另一条的子任务', () => {
    store.getState().addTask('z1', 'A', '');
    store.getState().addTask('z1', 'B', '');
    const id = (title: string) => store.getState().tasks.find(t => t.title === title)!.id;
    const A = id('A'), B = id('B');

    // 把 B 挂到 A 之下（newParentId = A）
    store.getState().moveTaskNode(B, A, null, 'z1');
    expect(find(B).parentId).toBe(A);
    expect(find(A).parentId).toBeNull();
  });

  it('升级：把子任务移出父级回到顶层', () => {
    store.getState().addTask('z1', 'parent', '');
    const parentId = store.getState().tasks[0].id;
    store.getState().addTask('z1', 'child', '', 'medium', 'low', null, 'none', parentId);
    const childId = store.getState().tasks.find(t => t.title === 'child')!.id;

    // newParentId = null → 回到顶层
    store.getState().moveTaskNode(childId, null, parentId, 'z1');
    expect(find(childId).parentId).toBeNull();
  });
});

// ============ applyNlpActions（TP7 落地 wiring：建新树 + 单步撤销） ============
describe('applyNlpActions（NLP 编辑批量落地）', () => {
  const byTitle = (t: string) => store.getState().tasks.find(x => x.title === t)!;

  it('TP7: 批内 tempId 建新多层树 → 子任务挂到刚新建父的【真实 id】上', () => {
    const { tempIdMap, createdIds } = store.getState().applyNlpActions([
      { kind: 'add', zoneId: 'z1', title: '上线', parentId: null, tempId: 't1' },
      { kind: 'add', zoneId: 'z1', title: '部署', parentId: 't1' },
      { kind: 'add', zoneId: 'z1', title: '回归测试', parentId: 't1' },
    ]);
    const parent = byTitle('上线');
    const deploy = byTitle('部署');
    const regress = byTitle('回归测试');
    // tempId 解析为真实父 id（不是 't1' 字面量，也不是错挂到别处）
    expect(deploy.parentId).toBe(parent.id);
    expect(regress.parentId).toBe(parent.id);
    expect(tempIdMap['t1']).toBe(parent.id);
    expect(createdIds).toHaveLength(3);
    // 同父下子任务 order 独立递增
    expect([deploy.order, regress.order]).toEqual([0, 1]);
  });

  it('add 到【已存在】真实父 id → 直接挂上', () => {
    store.getState().addTask('z1', '项目A', '');
    const realParent = store.getState().tasks[0].id;
    store.getState().applyNlpActions([
      { kind: 'add', zoneId: 'z1', title: '子', parentId: realParent },
    ]);
    expect(byTitle('子').parentId).toBe(realParent);
  });

  it('update re-parent：把已存在任务挂到另一父下，order 排到新同级末尾', () => {
    store.getState().addTask('z1', 'A', '');
    store.getState().addTask('z1', 'B', '');
    const A = byTitle('A').id;
    const B = byTitle('B').id;
    store.getState().applyNlpActions([{ kind: 'update', id: B, updates: { parentId: A } }]);
    expect(find(B).parentId).toBe(A);
    expect(find(B).order).toBe(0); // A 下首个子任务
  });

  it('delete 级联删整棵子树', () => {
    store.getState().applyNlpActions([
      { kind: 'add', zoneId: 'z1', title: 'p', parentId: null, tempId: 't1' },
      { kind: 'add', zoneId: 'z1', title: 'c', parentId: 't1', tempId: 't2' },
      { kind: 'add', zoneId: 'z1', title: 'g', parentId: 't2' },
    ]);
    const pId = byTitle('p').id;
    store.getState().applyNlpActions([{ kind: 'delete', id: pId }]);
    expect(store.getState().tasks).toHaveLength(0);
  });

  it('单步撤销：整批多 action 只触发一次 saveSnapshot', () => {
    const snap = vi.fn();
    store.setState({ saveSnapshot: snap } as unknown as Partial<TaskSlice>);
    store.getState().applyNlpActions([
      { kind: 'add', zoneId: 'z1', title: 'a', parentId: null, tempId: 't1' },
      { kind: 'add', zoneId: 'z1', title: 'b', parentId: 't1' },
      { kind: 'add', zoneId: 'z1', title: 'c', parentId: 't1' },
    ]);
    expect(snap).toHaveBeenCalledTimes(1);
  });

  it('混合 add+update+delete 同批，computedTimes 重算', () => {
    store.getState().addTask('z1', '旧', '');
    const oldId = byTitle('旧').id;
    store.getState().addTask('z1', '待删', '');
    const delId = byTitle('待删').id;
    const r = store.getState().applyNlpActions([
      { kind: 'add', zoneId: 'z1', title: '新', parentId: null },
      { kind: 'update', id: oldId, updates: { title: '旧改' } },
      { kind: 'delete', id: delId },
    ]);
    expect(byTitle('新')).toBeTruthy();
    expect(find(oldId).title).toBe('旧改');
    expect(store.getState().tasks.find(t => t.id === delId)).toBeUndefined();
    expect(r.createdIds).toHaveLength(1);
    // computedTimes 覆盖现存任务
    expect(store.getState().taskComputedTimes[byTitle('新').id]).toBeTruthy();
  });
});
