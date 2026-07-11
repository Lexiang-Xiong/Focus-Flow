import { describe, it, expect } from 'vitest';
import type { Task, Zone, PlanGroup } from '@/types';
import { canonical, type MirrorFile, type Snapshot } from './file-mirror-core';
import { createMirrorEngine } from './file-mirror-engine';

// ---- 最小构造器 ----
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id, zoneId: 'z1', parentId: null, isCollapsed: false, title: id, description: '',
    completed: false, priority: 'medium', urgency: 'low', deadline: null, deadlineType: 'none',
    order: 0, createdAt: 0, expanded: false, totalWorkTime: 0, ...over,
  };
}
function zone(id: string): Zone {
  return { id, color: '#fff', order: 0, createdAt: 0 };
}
function planGroup(id: string): PlanGroup {
  return { id, name: id, order: 0, createdAt: 0 };
}
function mirror(zones: Zone[], tasks: Task[], groups: PlanGroup[] = []): MirrorFile {
  return { version: 1, zones, tasks, planGroups: groups };
}

// ---- 注入假依赖：内存文件 + 内存 store ----
function harness(store: Snapshot, file: MirrorFile | null = null) {
  let fileContent: string | null = file ? JSON.stringify(file) : null;
  let current: Snapshot = store;
  const applied: Snapshot[] = [];
  let writes = 0;

  const engine = createMirrorEngine({
    readRaw: async () => fileContent,
    writeRaw: async (c) => { fileContent = c; writes += 1; },
    getSnapshot: () => current,
    applySnapshot: (zones, tasks, planGroups) => { current = { zones, tasks, planGroups }; applied.push({ zones, tasks, planGroups }); },
    now: () => 0,
  });

  return {
    engine,
    setStore: (s: Snapshot) => { current = s; },
    setFile: (f: MirrorFile | null) => { fileContent = f ? JSON.stringify(f) : null; },
    fileCanonical: () => {
      if (fileContent == null) return null;
      const p = JSON.parse(fileContent);
      return canonical(p.zones, p.tasks, p.planGroups ?? []);
    },
    writes: () => writes,
    applied: () => applied,
    current: () => current,
  };
}

// ============ 启动对账：真去读写文件、谁为准 ============
describe('engine.bootReconcile', () => {
  it('文件缺失 → 写文件初始化（无导入）', async () => {
    const store: Snapshot = { zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1')] };
    const h = harness(store, null);
    await h.engine.bootReconcile();
    expect(h.engine.didBoot).toBe(true);
    expect(h.writes()).toBe(1);
    expect(h.applied()).toHaveLength(0);
    expect(h.fileCanonical()).toBe(canonical(store.zones, store.tasks, store.planGroups));
    expect(h.engine.baseline).toBe(canonical(store.zones, store.tasks, store.planGroups));
  });

  it('文件 == store → 不写、不导入', async () => {
    const store: Snapshot = { zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1')] };
    const h = harness(store, mirror([zone('z1')], [task('a')], [planGroup('g1')]));
    await h.engine.bootReconcile();
    expect(h.writes()).toBe(0);
    expect(h.applied()).toHaveLength(0);
    expect(h.engine.baseline).toBe(canonical(store.zones, store.tasks, store.planGroups));
  });

  it('文件 != store → 导入文件（不写）', async () => {
    const store: Snapshot = { zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1')] };
    const h = harness(store, mirror([zone('z1')], [task('a'), task('b')], [planGroup('g1')]));
    await h.engine.bootReconcile();
    expect(h.applied()).toHaveLength(1);
    expect(h.current().tasks).toHaveLength(2);
    expect(h.current().planGroups).toHaveLength(1);
    expect(h.writes()).toBe(0);
  });

  it('护栏：空文件 + 非空 store → 写修复（不导入空数据）', async () => {
    const store: Snapshot = { zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1')] };
    const h = harness(store, mirror([], [], []));
    await h.engine.bootReconcile();
    expect(h.applied()).toHaveLength(0);
    expect(h.writes()).toBe(1);
    expect(h.fileCanonical()).toBe(canonical(store.zones, store.tasks, store.planGroups));
  });
});

// ============ 导出：store 变化写文件 + 回声锁 ============
describe('engine.handleStoreChange', () => {
  it('启动前的变化被丢弃（不写）', async () => {
    const h = harness({ zones: [zone('z1')], tasks: [task('a')], planGroups: [] }, null);
    await h.engine.handleStoreChange();
    expect(h.writes()).toBe(0);
  });

  it('启动后 store 变化 → 写文件', async () => {
    const store: Snapshot = { zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1')] };
    const h = harness(store, mirror([zone('z1')], [task('a')], [planGroup('g1')]));
    await h.engine.bootReconcile();          // baseline = store
    expect(h.writes()).toBe(0);
    h.setStore({ zones: [zone('z1')], tasks: [task('a'), task('b')], planGroups: [planGroup('g1')] });
    await h.engine.handleStoreChange();
    expect(h.writes()).toBe(1);
    expect(h.fileCanonical()).toBe(canonical([zone('z1')], [task('a'), task('b')], [planGroup('g1')]));
  });

  it('planGroups 变化 → 写文件', async () => {
    const store: Snapshot = { zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1')] };
    const h = harness(store, mirror([zone('z1')], [task('a')], [planGroup('g1')]));
    await h.engine.bootReconcile();
    h.setStore({ zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1'), planGroup('g2')] });
    await h.engine.handleStoreChange();
    expect(h.writes()).toBe(1);
  });

  it('store 无实质变化 → 回声锁跳过（不写）', async () => {
    const store: Snapshot = { zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1')] };
    const h = harness(store, mirror([zone('z1')], [task('a')], [planGroup('g1')]));
    await h.engine.bootReconcile();
    // 仅数组顺序变化，canonical 不变
    h.setStore({ zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1')] });
    await h.engine.handleStoreChange();
    expect(h.writes()).toBe(0);
  });
});

// ============ 轮询导入 + 无回声死循环 ============
describe('engine.pollOnce', () => {
  it('外部文件变化 → 导入；再轮询不变 → 不重复导入', async () => {
    const store: Snapshot = { zones: [zone('z1')], tasks: [task('a')], planGroups: [planGroup('g1')] };
    const h = harness(store, mirror([zone('z1')], [task('a')], [planGroup('g1')]));
    await h.engine.bootReconcile();
    expect(h.applied()).toHaveLength(0);

    // 外部（cc）改了文件
    h.setFile(mirror([zone('z1')], [task('a'), task('c')], [planGroup('g1')]));
    await h.engine.pollOnce();
    expect(h.applied()).toHaveLength(1);
    expect(h.current().tasks).toHaveLength(2);

    // 文件没再变 → 不再导入
    await h.engine.pollOnce();
    expect(h.applied()).toHaveLength(1);
  });

  it('导入后 store 同步变化不会回写文件（无死循环）', async () => {
    const store: Snapshot = { zones: [], tasks: [], planGroups: [] };
    const h = harness(store, mirror([zone('z1')], [task('a'), task('b')], [planGroup('g1')]));
    await h.engine.bootReconcile();           // file != store → 导入
    expect(h.applied()).toHaveLength(1);
    const writesAfterImport = h.writes();
    // 导入把 store 设成了文件数据；模拟由此触发的 store 变化
    h.setStore({ zones: [zone('z1')], tasks: [task('a'), task('b')], planGroups: [planGroup('g1')] });
    await h.engine.handleStoreChange();
    expect(h.writes()).toBe(writesAfterImport);  // baseline 已等于导入数据 → 不回写
  });
});
