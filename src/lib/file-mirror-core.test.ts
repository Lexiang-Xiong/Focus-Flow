import { describe, it, expect } from 'vitest';
import type { Task, Zone } from '@/types';
import {
  canonical,
  parseMirror,
  decideBootAction,
  decidePollAction,
  type MirrorFile,
} from './file-mirror-core';

// ---- 最小构造器 ----
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    zoneId: 'z1',
    parentId: null,
    isCollapsed: false,
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
    totalWorkTime: 0,
    ...over,
  };
}

function zone(id: string, over: Partial<Zone> = {}): Zone {
  return { id, color: '#fff', order: 0, createdAt: 0, ...over };
}

function mirror(zones: Zone[], tasks: Task[], over: Partial<MirrorFile> = {}): MirrorFile {
  return { version: 1, zones, tasks, ...over };
}

// ============ 回声锁不变量：canonical ============
describe('canonical（回声锁不变量）', () => {
  it('忽略数组顺序', () => {
    const z = [zone('z1')];
    expect(canonical(z, [task('a'), task('b')])).toBe(canonical(z, [task('b'), task('a')]));
  });

  it('忽略对象键序', () => {
    const t = task('a', { title: 'X', completed: true });
    const reordered = Object.fromEntries(Object.entries(t).reverse()) as Task;
    expect(canonical([], [t])).toBe(canonical([], [reordered]));
  });

  it('字段变化 → canonical 变化', () => {
    expect(canonical([zone('z1')], [task('a', { title: 'X' })]))
      .not.toBe(canonical([zone('z1')], [task('a', { title: 'Y' })]));
  });

  it('增删任务 → canonical 变化', () => {
    expect(canonical([zone('z1')], [task('a')]))
      .not.toBe(canonical([zone('z1')], [task('a'), task('b')]));
  });
});

// ============ 解析 / 校验：parseMirror ============
describe('parseMirror（拒绝损坏数据）', () => {
  it('解析合法文件', () => {
    const f = parseMirror(JSON.stringify(mirror([zone('z1')], [task('a')])));
    expect(f).not.toBeNull();
    expect(f!.tasks).toHaveLength(1);
    expect(f!.zones).toHaveLength(1);
  });

  it('非法 JSON → null', () => {
    expect(parseMirror('{ not json')).toBeNull();
  });

  it('缺 tasks/zones 数组 → null', () => {
    expect(parseMirror(JSON.stringify({ version: 1 }))).toBeNull();
    expect(parseMirror(JSON.stringify({ tasks: 'x', zones: [] }))).toBeNull();
    expect(parseMirror(JSON.stringify({ tasks: [], zones: 'y' }))).toBeNull();
  });

  it('序列化→解析往返不丢数据', () => {
    const zones = [zone('z1'), zone('z2')];
    const tasks = [task('a', { title: 'hi', completed: true }), task('b', { parentId: 'a' })];
    const parsed = parseMirror(JSON.stringify(mirror(zones, tasks)))!;
    expect(canonical(parsed.zones, parsed.tasks)).toBe(canonical(zones, tasks));
  });
});

// ============ 启动对账：谁为准（数据完整性核心） ============
describe('decideBootAction（启动谁为准）', () => {
  const store = { zones: [zone('z1')], tasks: [task('a')] };

  it('文件缺失 → export（初始化）', () => {
    expect(decideBootAction(store, null).kind).toBe('export');
  });

  it('护栏：空文件 + 非空 store → export（不让空文件覆盖好数据）', () => {
    expect(decideBootAction(store, mirror([], [])).kind).toBe('export');
  });

  it('文件与 store 不一致 → import（文件为准，含离线编辑）', () => {
    const action = decideBootAction(store, mirror([zone('z1')], [task('a'), task('b')]));
    expect(action.kind).toBe('import');
    if (action.kind === 'import') expect(action.tasks).toHaveLength(2);
  });

  it('文件与 store 一致（忽略顺序）→ noop', () => {
    expect(decideBootAction(store, mirror([zone('z1')], [task('a')])).kind).toBe('noop');
  });

  it('store 与文件都为空 → noop（合法的全空）', () => {
    expect(decideBootAction({ zones: [], tasks: [] }, mirror([], [])).kind).toBe('noop');
  });
});

// ============ 轮询对账 ============
describe('decidePollAction（轮询是否导入）', () => {
  const file = mirror([zone('z1')], [task('a')]);

  it('文件为 null → noop', () => {
    expect(decidePollAction(null, 'whatever').kind).toBe('noop');
  });

  it('文件 == 基线 → noop（回声锁）', () => {
    const baseline = canonical(file.zones, file.tasks);
    expect(decidePollAction(file, baseline).kind).toBe('noop');
  });

  it('文件 != 基线 → import', () => {
    const action = decidePollAction(file, 'stale-baseline');
    expect(action.kind).toBe('import');
    if (action.kind === 'import') expect(action.tasks).toHaveLength(1);
  });
});
