// src/lib/nlp-edit/apply-core.ts
// BYOK NLP 编辑的【纯逻辑】：snapshot + ops → 校验 → action 计划 + diff 预览。
// 与 file-mirror-core.ts 同一范式：纯函数、零 IO、零 store、零网络 → 可单测。
// 副作用（真正调 store.addTask/updateTask/deleteTask + saveSnapshot）留在 wiring 层，不在这里。
//
// 护栏（复用 file-mirror「不静默吞坏数据」的思路）：
//   - update/delete 的未知 id → 类型化错误，不静默跳过。
//   - add_task 的 zoneId 不存在 / parentId 不存在 → 类型化错误。
//   - op 数量上限（OP_LIMIT = 50）→ 类型化错误。
//   - 空 ops → 类型化 no-op 结果（不落地）。
//   - delete 级联：把整棵子树展开成真实删除集合并计数，供 UI 强制确认批量删除。

import type { Task, Zone } from '@/types';
import type { EditOp, AddTaskOp, UpdateTaskOp, DeleteTaskOp } from './schema';
import { PRIORITY_VALUES, DEADLINE_TYPE_VALUES } from './schema';

// op 数量上限：一次 NLP 编辑允许的最大 op 数。超过即报错，防止 LLM 失控批量操作。
export const OP_LIMIT = 50;

export interface Snapshot {
  zones: Zone[];
  tasks: Task[];
}

// ---- diff 预览结构 ----
// added：新增任务（来自 add_task，落地前没有真实 id，故用临时占位描述）。
export interface AddedPreview {
  zoneId: string;
  title: string;
  parentId: string | null;
  /** 父任务可读名：已有父=其标题；批内新父=「新建:标题」；顶级=null。让 UI 显示“挂到谁下”，防静默错挂。 */
  parentLabel: string | null;
}

// updated：更新任务（id 必须命中已存在任务）。
export interface UpdatedPreview {
  id: string;
  // 仅 op 携带的、要改的字段（不含 id / op）。
  changes: Partial<Omit<Task, 'id'>>;
}

// deleted：删除任务。requested 是用户/LLM 显式点名的 id；
//          removedIds 是级联展开后的真实删除集合（含子孙）；
//          cascadeCount 是「因级联额外被删」的数量（removedIds 减去 requested）。
export interface DeletedPreview {
  requestedIds: string[];
  removedIds: string[];
  cascadeCount: number;
}

export interface DiffPreview {
  added: AddedPreview[];
  updated: UpdatedPreview[];
  deleted: DeletedPreview;
}

// ---- action 计划：落地层照此调用 store action，一一对应 ----
export type PlannedAction =
  | {
      kind: 'add';
      zoneId: string;
      title: string;
      description?: string;
      priority?: Task['priority'];
      deadline?: number | null;
      deadlineType?: Task['deadlineType'];
      parentId?: string | null;
      // 本批内句柄；wiring 落地时据此把后续子任务挂到刚 addTask 出的真实 id 上。
      tempId?: string;
    }
  | { kind: 'update'; id: string; updates: Partial<Task> }
  | { kind: 'delete'; id: string };

// ---- 校验错误码（类型化，不静默） ----
export type PlanErrorCode =
  | 'OP_LIMIT_EXCEEDED'
  | 'UNKNOWN_TASK_ID'
  | 'UNKNOWN_ZONE_ID'
  | 'UNKNOWN_PARENT_ID'
  | 'DUPLICATE_TEMP_ID'
  | 'CYCLE'
  | 'MALFORMED_OP' // op 形状不合法（缺必填字段 / 枚举越界）—— 真实 LLM 输出的现实失败面
  | 'INVALID_OP';

export interface PlanError {
  code: PlanErrorCode;
  message: string;
  // 出错 op 在输入数组中的下标（空 / 上限错误时为 -1）。
  opIndex: number;
}

// 单个被跳过的 op（仅 invalidPolicy='skip' 模式产生）：携带原因，供预览展示，绝不静默。
export interface SkippedOp {
  opIndex: number;
  code: PlanErrorCode;
  message: string;
}

export interface PlanOptions {
  /**
   * 非法 op 的处置策略：
   * - 'reject'（默认）：保持 Phase 1 fail-fast 语义——任一 op 非法即整批否决（kind:'error'）。
   * - 'skip'：逐 op 校验，非法 op 跳过并记入 `skipped`（供 diff 预览展示原因），合法 op 仍编入计划。
   *   人在预览里看到「应用什么 + 跳过什么及为何」后再点 Apply，预览即闸门。
   * 注意：批级错误（op 数量超上限 / 空 ops）两种模式都仍是硬停，不被 skip 吞掉。
   */
  invalidPolicy?: 'reject' | 'skip';
}

// ---- planOps 结果（discriminated union，照 file-mirror SyncAction 风格） ----
export type PlanResult =
  | { kind: 'error'; error: PlanError }
  | { kind: 'noop' } // 空 ops：合法但不落地
  | {
      kind: 'plan';
      actions: PlannedAction[];
      diff: DiffPreview;
      // 是否包含删除（含级联），UI 据此强制显式确认。
      hasDeletes: boolean;
      // 真实将被删除的任务总数（含级联子孙）。
      deleteCount: number;
      // 被跳过的非法 op（仅 invalidPolicy='skip' 时可能非空；'reject' 模式恒为 []）。
      skipped: SkippedOp[];
    };

// 收集某任务的全部子孙 id（不含自身），与 store.deleteTask 的级联语义一致（taskSlice.ts:297）。
function collectDescendantIds(parentId: string, tasks: Task[]): string[] {
  const children = tasks.filter((t) => t.parentId === parentId);
  return children.flatMap((c) => [c.id, ...collectDescendantIds(c.id, tasks)]);
}

function err(code: PlanErrorCode, message: string, opIndex: number): PlanResult {
  return { kind: 'error', error: { code, message, opIndex } };
}

// op 形状校验用：枚举成员判定（这些值在运行时存在，可直接查；与 schema.ts 的单一真相源对齐）。
const PRIORITY_SET = new Set<string>(PRIORITY_VALUES);
const DEADLINE_TYPE_SET = new Set<string>(DEADLINE_TYPE_VALUES);

/**
 * 纯函数：把 LLM 产出的 ops 校验并编译成 action 计划 + diff 预览。
 * 不修改 snapshot，不触发任何副作用。
 *
 * 顺序：先做批级护栏（上限 / 空），再逐 op 校验并构建计划。单个 op 非法时：
 *   - invalidPolicy='reject'（默认）→ 立即整批否决（fail-fast，保持 Phase 1 语义）。
 *   - invalidPolicy='skip' → 跳过该 op 并记入 skipped（不静默），合法 op 仍编入计划。
 * 关键不变量：planOneOp 在「记账（push 到 actions/diff/共享状态）之前」完成全部校验，
 * 失败时不改动任何共享状态 → skip 掉一个坏 op 后，其余 op 的计划保持干净。
 */
export function planOps(
  snapshot: Snapshot,
  ops: EditOp[],
  opts: PlanOptions = {},
): PlanResult {
  const policy = opts.invalidPolicy ?? 'reject';

  // 空 ops → 合法 no-op，不落地。
  if (ops.length === 0) {
    return { kind: 'noop' };
  }

  // op 数量上限护栏（批级错误：两种模式都硬停，不被 skip 吞掉）。
  if (ops.length > OP_LIMIT) {
    return err(
      'OP_LIMIT_EXCEEDED',
      `操作数量 ${ops.length} 超过上限 ${OP_LIMIT}`,
      -1,
    );
  }

  const zoneIds = new Set(snapshot.zones.map((z) => z.id));
  const taskIds = new Set(snapshot.tasks.map((t) => t.id));
  const titleById = new Map(snapshot.tasks.map((t) => [t.id, t.title] as [string, string]));
  const tempTitles = new Map<string, string>(); // 本批内 tempId -> 新任务标题（校验引用 + parentLabel）

  const actions: PlannedAction[] = [];
  const added: AddedPreview[] = [];
  const updated: UpdatedPreview[] = [];
  const requestedDeleteIds: string[] = [];
  const removedIdSet = new Set<string>();
  const skipped: SkippedOp[] = [];

  // 单 op：校验通过 → 就地编入 actions/diff/共享状态并返回 null；失败 → 返回 PlanError（不改动任何共享状态）。
  const planOneOp = (op: EditOp, i: number): PlanError | null => {
    const fail = (code: PlanErrorCode, message: string): PlanError => ({ code, message, opIndex: i });

    if (op.op === 'add_task') {
      const a = op as AddTaskOp;
      // 形状校验（真实 LLM 输出的现实失败面）：必填 title 非空、zoneId 是字符串；可选枚举值合法。
      if (typeof a.title !== 'string' || a.title.trim() === '') {
        return fail('MALFORMED_OP', 'add_task 缺少非空 title');
      }
      if (typeof a.zoneId !== 'string') {
        return fail('MALFORMED_OP', 'add_task 缺少 zoneId');
      }
      if (a.priority != null && !PRIORITY_SET.has(a.priority)) {
        return fail('MALFORMED_OP', `非法 priority：${a.priority}`);
      }
      if (a.deadlineType != null && !DEADLINE_TYPE_SET.has(a.deadlineType)) {
        return fail('MALFORMED_OP', `非法 deadlineType：${a.deadlineType}`);
      }
      if (!zoneIds.has(a.zoneId)) {
        return fail('UNKNOWN_ZONE_ID', `未知分区 id：${a.zoneId}`);
      }
      // tempId 不得与已有任务 id 或本批已定义的 tempId 冲突。
      if (a.tempId != null && (taskIds.has(a.tempId) || tempTitles.has(a.tempId))) {
        return fail('DUPLICATE_TEMP_ID', `临时 id 冲突：${a.tempId}`);
      }
      // parentId 可引用已有任务，或本批内【更早】定义的 tempId（前向引用即未知）。
      if (a.parentId != null && !taskIds.has(a.parentId) && !tempTitles.has(a.parentId)) {
        return fail('UNKNOWN_PARENT_ID', `未知父任务 id：${a.parentId}`);
      }
      const parentLabel =
        a.parentId == null
          ? null
          : titleById.get(a.parentId) ??
            (tempTitles.has(a.parentId) ? `新建:${tempTitles.get(a.parentId)}` : a.parentId);
      actions.push({
        kind: 'add',
        zoneId: a.zoneId,
        title: a.title,
        description: a.description,
        priority: a.priority,
        deadline: a.deadline,
        deadlineType: a.deadlineType,
        parentId: a.parentId ?? null,
        tempId: a.tempId,
      });
      added.push({
        zoneId: a.zoneId,
        title: a.title,
        parentId: a.parentId ?? null,
        parentLabel,
      });
      // 注册 tempId（在解析完本 op 的 parent 之后 → 不能引用自身，强制前向）。
      if (a.tempId != null) tempTitles.set(a.tempId, a.title);
      return null;
    }

    if (op.op === 'update_task') {
      const u = op as UpdateTaskOp;
      if (typeof u.id !== 'string') {
        return fail('MALFORMED_OP', 'update_task 缺少 id');
      }
      if (u.priority != null && !PRIORITY_SET.has(u.priority)) {
        return fail('MALFORMED_OP', `非法 priority：${u.priority}`);
      }
      if (u.deadlineType != null && !DEADLINE_TYPE_SET.has(u.deadlineType)) {
        return fail('MALFORMED_OP', `非法 deadlineType：${u.deadlineType}`);
      }
      if (!taskIds.has(u.id)) {
        return fail('UNKNOWN_TASK_ID', `未知任务 id：${u.id}`);
      }
      if (u.parentId != null && !taskIds.has(u.parentId) && !tempTitles.has(u.parentId)) {
        return fail('UNKNOWN_PARENT_ID', `未知父任务 id：${u.parentId}`);
      }
      // 环守护：把任务挂到自身或自身子孙下 → 成环，报错而非静默。
      // （tempId 父是本批新建的叶子，不可能与既有结构成环，故只查既有 id。）
      if (u.parentId != null && taskIds.has(u.parentId)) {
        if (
          u.parentId === u.id ||
          collectDescendantIds(u.id, snapshot.tasks).includes(u.parentId)
        ) {
          return fail('CYCLE', `不能把「${titleById.get(u.id) ?? u.id}」挂到它自己或其子孙下`);
        }
      }
      // 只取 op 携带的可改字段，剥掉 op / id。
      const { op: _op, id: _id, ...rest } = u;
      const changes = rest as Partial<Omit<Task, 'id'>>;
      actions.push({ kind: 'update', id: u.id, updates: changes as Partial<Task> });
      updated.push({ id: u.id, changes });
      return null;
    }

    if (op.op === 'delete_task') {
      const d = op as DeleteTaskOp;
      if (typeof d.id !== 'string') {
        return fail('MALFORMED_OP', 'delete_task 缺少 id');
      }
      if (!taskIds.has(d.id)) {
        return fail('UNKNOWN_TASK_ID', `未知任务 id：${d.id}`);
      }
      requestedDeleteIds.push(d.id);
      // 级联展开：自身 + 全部子孙，去重进 removedIdSet。
      removedIdSet.add(d.id);
      for (const did of collectDescendantIds(d.id, snapshot.tasks)) {
        removedIdSet.add(did);
      }
      actions.push({ kind: 'delete', id: d.id });
      return null;
    }

    return fail('INVALID_OP', `不支持的 op 类型：${(op as { op?: string }).op}`);
  };

  for (let i = 0; i < ops.length; i++) {
    const error = planOneOp(ops[i], i);
    if (error) {
      if (policy === 'reject') {
        return { kind: 'error', error };
      }
      skipped.push({ opIndex: error.opIndex, code: error.code, message: error.message });
    }
  }

  const removedIds = [...removedIdSet];
  const deleted: DeletedPreview = {
    requestedIds: requestedDeleteIds,
    removedIds,
    // 「额外」被级联删除的数量 = 总删除 - 显式点名（去重后）。
    cascadeCount: removedIds.length - new Set(requestedDeleteIds).size,
  };

  return {
    kind: 'plan',
    actions,
    diff: { added, updated, deleted },
    hasDeletes: removedIds.length > 0,
    deleteCount: removedIds.length,
    skipped,
  };
}
