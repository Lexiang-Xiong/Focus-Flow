import { describe, it, expect } from 'vitest';
import type { Task, Zone } from '@/types';
import type { EditOp } from './schema';
import { planOps, OP_LIMIT, type Snapshot } from './apply-core';

// ---- 最小构造器（照 file-mirror-core.test.ts 风格） ----
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

function snap(zones: Zone[], tasks: Task[]): Snapshot {
  return { zones, tasks };
}

// ============ happy path：add_task ============
describe('planOps · add_task（happy path）', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('合法 add → plan + added 预览 + add action', () => {
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: 'new' }]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.actions).toEqual([
      {
        kind: 'add',
        zoneId: 'z1',
        title: 'new',
        description: undefined,
        priority: undefined,
        deadline: undefined,
        deadlineType: undefined,
        parentId: null,
      },
    ]);
    expect(r.diff.added).toEqual([{ zoneId: 'z1', title: 'new', parentId: null, parentLabel: null }]);
    expect(r.hasDeletes).toBe(false);
  });

  it('add 到已存在 parent → 合法', () => {
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: 'child', parentId: 'a' }]);
    expect(r.kind).toBe('plan');
    if (r.kind === 'plan') expect(r.diff.added[0].parentId).toBe('a');
  });
});

// ============ happy path：update_task ============
describe('planOps · update_task（happy path）', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('partial 更新 → 仅携带改动字段（不含 id/op）', () => {
    const r = planOps(s, [
      { op: 'update_task', id: 'a', title: 'X', priority: 'high' },
    ]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.actions).toEqual([
      { kind: 'update', id: 'a', updates: { title: 'X', priority: 'high' } },
    ]);
    expect(r.diff.updated).toEqual([{ id: 'a', changes: { title: 'X', priority: 'high' } }]);
  });
});

// ============ happy path：delete_task + 级联 ============
describe('planOps · delete_task（happy path + 级联）', () => {
  it('删叶子 → removedIds 仅自身，cascadeCount 0', () => {
    const s = snap([zone('z1')], [task('a')]);
    const r = planOps(s, [{ op: 'delete_task', id: 'a' }]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.diff.deleted.removedIds).toEqual(['a']);
    expect(r.diff.deleted.cascadeCount).toBe(0);
    expect(r.hasDeletes).toBe(true);
    expect(r.deleteCount).toBe(1);
  });

  it('删父 → 级联展开整棵子树，cascadeCount 反映额外删除数', () => {
    // a -> b -> c, a -> d ；删 a 应连带 b/c/d（共 4）
    const s = snap(
      [zone('z1')],
      [
        task('a'),
        task('b', { parentId: 'a' }),
        task('c', { parentId: 'b' }),
        task('d', { parentId: 'a' }),
      ],
    );
    const r = planOps(s, [{ op: 'delete_task', id: 'a' }]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.diff.deleted.requestedIds).toEqual(['a']);
    expect([...r.diff.deleted.removedIds].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r.diff.deleted.cascadeCount).toBe(3); // b,c,d 额外
    expect(r.deleteCount).toBe(4);
  });

  it('删父+子重叠 → removedIds 去重，不重复计数', () => {
    const s = snap([zone('z1')], [task('a'), task('b', { parentId: 'a' })]);
    const r = planOps(s, [
      { op: 'delete_task', id: 'a' },
      { op: 'delete_task', id: 'b' },
    ]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect([...r.diff.deleted.removedIds].sort()).toEqual(['a', 'b']);
    expect(r.deleteCount).toBe(2);
  });
});

// ============ 混合 op happy path ============
describe('planOps · 混合 op', () => {
  it('add+update+delete 同批 → actions 顺序保持', () => {
    const s = snap([zone('z1')], [task('a'), task('b')]);
    const ops: EditOp[] = [
      { op: 'add_task', zoneId: 'z1', title: 'n' },
      { op: 'update_task', id: 'a', completed: true },
      { op: 'delete_task', id: 'b' },
    ];
    const r = planOps(s, ops);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.actions.map((x) => x.kind)).toEqual(['add', 'update', 'delete']);
    expect(r.diff.added).toHaveLength(1);
    expect(r.diff.updated).toHaveLength(1);
    expect(r.deleteCount).toBe(1);
  });
});

// ============ 护栏：空 ops ============
describe('planOps · 护栏 · 空 ops', () => {
  it('空数组 → noop（合法，不落地）', () => {
    expect(planOps(snap([zone('z1')], []), []).kind).toBe('noop');
  });
});

// ============ 护栏：未知 id（不静默） ============
describe('planOps · 护栏 · 未知 id', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('update 未知 id → UNKNOWN_TASK_ID', () => {
    const r = planOps(s, [{ op: 'update_task', id: 'nope', title: 'x' }]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('UNKNOWN_TASK_ID');
      expect(r.error.opIndex).toBe(0);
    }
  });

  it('delete 未知 id → UNKNOWN_TASK_ID（不静默跳过）', () => {
    const r = planOps(s, [{ op: 'delete_task', id: 'ghost' }]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_TASK_ID');
  });
});

// ============ 护栏：bad zoneId ============
describe('planOps · 护栏 · 未知 zoneId', () => {
  it('add 到不存在 zone → UNKNOWN_ZONE_ID', () => {
    const r = planOps(snap([zone('z1')], []), [
      { op: 'add_task', zoneId: 'zX', title: 't' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_ZONE_ID');
  });
});

// ============ 护栏：bad parentId ============
describe('planOps · 护栏 · 未知 parentId', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('add 到不存在 parent → UNKNOWN_PARENT_ID', () => {
    const r = planOps(s, [
      { op: 'add_task', zoneId: 'z1', title: 't', parentId: 'missing' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_PARENT_ID');
  });

  it('update 设到不存在 parent → UNKNOWN_PARENT_ID', () => {
    const r = planOps(s, [{ op: 'update_task', id: 'a', parentId: 'missing' }]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_PARENT_ID');
  });

  it('parentId 显式 null 合法（顶级任务）', () => {
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: 't', parentId: null }]);
    expect(r.kind).toBe('plan');
  });
});

// ============ 护栏：超上限 ============
describe('planOps · 护栏 · op 数量上限', () => {
  it(`> OP_LIMIT(${OP_LIMIT}) → OP_LIMIT_EXCEEDED`, () => {
    const s = snap([zone('z1')], []);
    const ops: EditOp[] = Array.from({ length: OP_LIMIT + 1 }, () => ({
      op: 'add_task' as const,
      zoneId: 'z1',
      title: 't',
    }));
    const r = planOps(s, ops);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('OP_LIMIT_EXCEEDED');
      expect(r.error.opIndex).toBe(-1);
    }
  });

  it(`== OP_LIMIT(${OP_LIMIT}) → 合法`, () => {
    const s = snap([zone('z1')], []);
    const ops: EditOp[] = Array.from({ length: OP_LIMIT }, () => ({
      op: 'add_task' as const,
      zoneId: 'z1',
      title: 't',
    }));
    expect(planOps(s, ops).kind).toBe('plan');
  });
});

// ============ fail-fast：错误带出错下标 ============
describe('planOps · fail-fast', () => {
  it('第 2 个 op 出错 → opIndex=1，不返回部分计划', () => {
    const s = snap([zone('z1')], [task('a')]);
    const r = planOps(s, [
      { op: 'update_task', id: 'a', title: 'ok' },
      { op: 'delete_task', id: 'nope' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('UNKNOWN_TASK_ID');
      expect(r.error.opIndex).toBe(1);
    }
  });
});

// ============ 建新树（T1 tempId 批内引用）+ diff 显父名（T2） ============
describe('planOps · 建新树 tempId + parentLabel', () => {
  it('TP7/T1: 新父带 tempId、子 op 引用它 → plan，一次性建新树', () => {
    const s = snap([zone('z1')], []);
    const r = planOps(s, [
      { op: 'add_task', zoneId: 'z1', title: '上线', tempId: 't1' },
      { op: 'add_task', zoneId: 'z1', title: '部署', parentId: 't1' },
    ]);
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.actions).toHaveLength(2);
    const child = r.diff.added.find((a) => a.title === '部署');
    expect(child?.parentLabel).toBe('新建:上线'); // TP8：看得出挂到刚新建的「上线」下
  });

  it('TP8/T2: add 到已存在父 → parentLabel 显示已有父名', () => {
    const s = snap([zone('z1')], [task('a', { title: '项目A' })]);
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: '子', parentId: 'a' }]);
    expect(r.kind).toBe('plan');
    if (r.kind === 'plan') expect(r.diff.added[0].parentLabel).toBe('项目A');
  });

  it('未知 parent（既非已有也非已定义 tempId）→ UNKNOWN_PARENT_ID', () => {
    const r = planOps(snap([zone('z1')], []), [
      { op: 'add_task', zoneId: 'z1', title: 'x', parentId: 'ghost' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_PARENT_ID');
  });

  it('前向引用（引用后面才定义的 tempId）→ UNKNOWN_PARENT_ID', () => {
    const r = planOps(snap([zone('z1')], []), [
      { op: 'add_task', zoneId: 'z1', title: '子', parentId: 't1' },
      { op: 'add_task', zoneId: 'z1', title: '父', tempId: 't1' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_PARENT_ID');
  });

  it('tempId 与已有任务 id 冲突 → DUPLICATE_TEMP_ID', () => {
    const r = planOps(snap([zone('z1')], [task('a')]), [
      { op: 'add_task', zoneId: 'z1', title: 'x', tempId: 'a' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('DUPLICATE_TEMP_ID');
  });

  it('TP9/T3: re-parent 到自身子孙 → CYCLE', () => {
    const s = snap([zone('z1')], [task('a'), task('b', { parentId: 'a' }), task('c', { parentId: 'b' })]);
    const r = planOps(s, [{ op: 'update_task', id: 'a', parentId: 'c' }]); // a 挂到它孙子 c 下
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('CYCLE');
  });

  it('TP9: re-parent 到自身 → CYCLE', () => {
    const s = snap([zone('z1')], [task('a')]);
    const r = planOps(s, [{ op: 'update_task', id: 'a', parentId: 'a' }]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('CYCLE');
  });

  it('re-parent 到非子孙 → 合法', () => {
    const s = snap([zone('z1')], [task('a'), task('b', { parentId: 'a' }), task('x')]);
    const r = planOps(s, [{ op: 'update_task', id: 'b', parentId: 'x' }]); // b 从 a 挪到 x，无环
    expect(r.kind).toBe('plan');
  });
});

// ============ 护栏：未知 op 类型（防御分支） ============
describe('planOps · 护栏 · 非法 op 类型', () => {
  it('未知 op.op → INVALID_OP', () => {
    const s = snap([zone('z1')], []);
    const r = planOps(s, [{ op: 'frobnicate' } as unknown as EditOp]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('INVALID_OP');
  });
});

// ============ 形状校验：MALFORMED_OP（真实 LLM 输出的现实失败面） ============
describe('planOps · 形状校验 · MALFORMED_OP', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('add 缺非空 title → MALFORMED_OP', () => {
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: '   ' } as EditOp]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('MALFORMED_OP');
  });

  it('add 非法 priority → MALFORMED_OP（防 Episode#3 档位漂移混入）', () => {
    const r = planOps(s, [
      { op: 'add_task', zoneId: 'z1', title: 't', priority: 'urgent' } as unknown as EditOp,
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('MALFORMED_OP');
  });

  it('update 缺 id → MALFORMED_OP', () => {
    const r = planOps(s, [{ op: 'update_task', title: 'x' } as unknown as EditOp]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('MALFORMED_OP');
  });

  it('合法 priority（5 级任一）→ 不报 MALFORMED', () => {
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: 't', priority: 'critical' }]);
    expect(r.kind).toBe('plan');
  });
});

// ============ invalidPolicy='skip'：部分应用 + 跳过项进预览（不静默） ============
describe('planOps · invalidPolicy=skip（部分应用）', () => {
  const s = snap([zone('z1')], [task('a')]);

  it('坏 op 被跳过、好 op 仍编入计划，skipped 带原因+下标', () => {
    const r = planOps(
      s,
      [
        { op: 'add_task', zoneId: 'z1', title: '好任务' },
        { op: 'delete_task', id: 'ghost' }, // 未知 id
        { op: 'update_task', id: 'a', title: 'X' },
      ],
      { invalidPolicy: 'skip' },
    );
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    // 两个好 op 落地（add + update），坏 op 不进 actions
    expect(r.actions.map((x) => x.kind)).toEqual(['add', 'update']);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toEqual({ opIndex: 1, code: 'UNKNOWN_TASK_ID', message: expect.any(String) });
  });

  it('reject（默认）下同样输入 → 整批否决（对照）', () => {
    const r = planOps(s, [
      { op: 'add_task', zoneId: 'z1', title: '好任务' },
      { op: 'delete_task', id: 'ghost' },
    ]);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('UNKNOWN_TASK_ID');
  });

  it('tempId 级联：父 op 因坏 zone 被跳 → 引用它的子 op 也被跳（不会错挂）', () => {
    const r = planOps(
      s,
      [
        { op: 'add_task', zoneId: 'BAD', title: '新父', tempId: 't1' }, // 坏 zone → 跳
        { op: 'add_task', zoneId: 'z1', title: '新子', parentId: 't1' }, // 父没注册 → 跳
        { op: 'add_task', zoneId: 'z1', title: '独立任务' }, // 好 op
      ],
      { invalidPolicy: 'skip' },
    );
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.actions).toHaveLength(1);
    expect(r.diff.added[0].title).toBe('独立任务');
    expect(r.skipped.map((x) => x.opIndex)).toEqual([0, 1]);
    expect(r.skipped[1].code).toBe('UNKNOWN_PARENT_ID');
  });

  it('全部 op 非法 → plan（actions 空）+ skipped 全列出（预览据此提示无可应用）', () => {
    const r = planOps(
      s,
      [
        { op: 'delete_task', id: 'x' },
        { op: 'update_task', id: 'y', title: 'z' },
      ],
      { invalidPolicy: 'skip' },
    );
    expect(r.kind).toBe('plan');
    if (r.kind !== 'plan') return;
    expect(r.actions).toHaveLength(0);
    expect(r.skipped).toHaveLength(2);
  });

  it('skip 模式下 op 数量超上限仍硬停（批级错误不被吞）', () => {
    const ops: EditOp[] = Array.from({ length: OP_LIMIT + 1 }, () => ({
      op: 'add_task' as const,
      zoneId: 'z1',
      title: 't',
    }));
    const r = planOps(s, ops, { invalidPolicy: 'skip' });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('OP_LIMIT_EXCEEDED');
  });

  it('reject 模式 plan 的 skipped 恒为空数组', () => {
    const r = planOps(s, [{ op: 'add_task', zoneId: 'z1', title: 't' }]);
    expect(r.kind).toBe('plan');
    if (r.kind === 'plan') expect(r.skipped).toEqual([]);
  });
});
