// src/lib/nlp-edit/schema.ts
// BYOK NLP 编辑 op 的【纯定义】：JSON Schema（= OpenAI function-calling 的 parameters）
// + 对应的 TypeScript 类型。
// 与 file-mirror-core.ts 同一范式：纯逻辑、零 IO、零 store、零网络 → 可单测。
// 这里只描述「LLM 允许产出什么」；校验 / 落地决策在 apply-core.ts。
//
// 三种 op：add_task / update_task / delete_task（zone 操作后置，不在本期）。
// 字段枚举锁死 Task 的 priority / deadlineType（src/types/index.ts）。
// 注意：urgency 是 deadline 自动计算的「显示派生值」（types/index.ts:29），
//       不是可由 NLP 设置的字段 → 三种 op 都【不暴露】urgency。

import type { TaskPriority, DeadlineType } from '@/types';

// op 类型字面量，集中一处便于 schema 与解析共享
export const OP_KINDS = ['add_task', 'update_task', 'delete_task'] as const;
export type OpKind = (typeof OP_KINDS)[number];

// 锁死的枚举值（必须覆盖 src/types/index.ts 的全部档位）。
// 这里仍是手写字面量（TS 类型在运行时不存在，无法自动枚举 union），
// 但下方的 `satisfies` + 完整性断言会在【编译期】强制它与 TaskPriority/DeadlineType 同步：
// 上游若新增/改名档位而这里漏改，tsc 直接报错 —— 杜绝 Episode#3 那种静默漂移。
export const PRIORITY_VALUES = [
  'critical',
  'heavy',
  'high',
  'medium',
  'low',
] as const satisfies readonly TaskPriority[];
export const DEADLINE_TYPE_VALUES = [
  'exact',
  'today',
  'tomorrow',
  'week',
  'none',
] as const satisfies readonly DeadlineType[];

// 完整性断言（单一真相源守护）：若 TaskPriority/DeadlineType 有成员未列入上面数组，
// 下面的类型会变成 never，赋值即编译失败 → 强制本文件跟随 types/index.ts。
type _MissingPriority = Exclude<TaskPriority, (typeof PRIORITY_VALUES)[number]>;
type _MissingDeadlineType = Exclude<DeadlineType, (typeof DEADLINE_TYPE_VALUES)[number]>;
const _priorityExhaustive: _MissingPriority extends never ? true : never = true;
const _deadlineTypeExhaustive: _MissingDeadlineType extends never ? true : never = true;
void _priorityExhaustive;
void _deadlineTypeExhaustive;

// ---- 解析后的 op TypeScript 类型 ----
// add_task：必须带 zoneId（store.addTask 要求，taskSlice.ts:182）；parentId 可选。
//           不含 urgency（派生值）。
export interface AddTaskOp {
  op: 'add_task';
  zoneId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  deadline?: number | null;
  deadlineType?: DeadlineType;
  parentId?: string | null;
  /** 本批内临时句柄：后续 op 的 parentId 可引用它，用来一次性建新树（新父+新子）。 */
  tempId?: string;
}

// update_task：按 id 做 Partial 更新（store.updateTask，taskSlice.ts:21）。
//              除 id 外字段均可选；不含 urgency（派生值）。
export interface UpdateTaskOp {
  op: 'update_task';
  id: string;
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: TaskPriority;
  deadline?: number | null;
  deadlineType?: DeadlineType;
  parentId?: string | null;
}

// delete_task：仅需 id（store.deleteTask 会级联删整棵子树，taskSlice.ts:294）。
export interface DeleteTaskOp {
  op: 'delete_task';
  id: string;
}

export type EditOp = AddTaskOp | UpdateTaskOp | DeleteTaskOp;

// 顶层 LLM 输出：一个 ops 数组（function-calling 的 arguments 对象）
export interface EditOpsPayload {
  ops: EditOp[];
}

// ---- JSON Schema（OpenAI function-calling 的 `parameters` 对象）----
// 用 oneOf + discriminator(op) 把三种 op 锁成互斥分支；
// 字段枚举锁死，additionalProperties:false 防止 LLM 夹带越权字段（如 urgency / id 注入到 add）。

const addTaskSchema = {
  type: 'object',
  description: '新增一个任务。必须指定已存在的 zoneId。',
  properties: {
    op: { type: 'string', const: 'add_task' },
    zoneId: {
      type: 'string',
      description: '目标分区 id，必须是当前快照中已存在的 zone。',
    },
    title: { type: 'string', description: '任务标题（必填，非空）。' },
    description: { type: 'string', description: '任务描述，可选。' },
    priority: {
      type: 'string',
      enum: [...PRIORITY_VALUES],
      description: '优先级，省略则由落地侧取默认值。',
    },
    deadline: {
      type: ['integer', 'null'],
      description: '截止时间戳（毫秒 epoch），无则为 null。',
    },
    deadlineType: {
      type: 'string',
      enum: [...DEADLINE_TYPE_VALUES],
      description: '截止时间类型。',
    },
    parentId: {
      type: ['string', 'null'],
      description: '父任务 id，顶级任务为 null。可为已存在任务 id，或本批内更早 add_task 的 tempId（挂到刚新建的父下）。',
    },
    tempId: {
      type: 'string',
      description: '本批内临时句柄；给本次新建的任务起个名，后续 op 的 parentId 引用它即可一次性建新树。',
    },
  },
  required: ['op', 'zoneId', 'title'],
  additionalProperties: false,
} as const;

const updateTaskSchema = {
  type: 'object',
  description: '按 id 部分更新一个已存在的任务，只携带要改的字段。',
  properties: {
    op: { type: 'string', const: 'update_task' },
    id: {
      type: 'string',
      description: '要更新的任务 id，必须是当前快照中已存在的任务。',
    },
    title: { type: 'string', description: '新标题，可选。' },
    description: { type: 'string', description: '新描述，可选。' },
    completed: { type: 'boolean', description: '完成状态，可选。' },
    priority: {
      type: 'string',
      enum: [...PRIORITY_VALUES],
      description: '新优先级，可选。',
    },
    deadline: {
      type: ['integer', 'null'],
      description: '新截止时间戳（毫秒 epoch），可选。',
    },
    deadlineType: {
      type: 'string',
      enum: [...DEADLINE_TYPE_VALUES],
      description: '新截止时间类型，可选。',
    },
    parentId: {
      type: ['string', 'null'],
      description: '新父任务 id，可选；若给出非 null 必须是已存在任务。',
    },
  },
  required: ['op', 'id'],
  additionalProperties: false,
} as const;

const deleteTaskSchema = {
  type: 'object',
  description: '删除一个任务。注意：会级联删除其全部子孙任务。',
  properties: {
    op: { type: 'string', const: 'delete_task' },
    id: {
      type: 'string',
      description: '要删除的任务 id，必须是当前快照中已存在的任务。',
    },
  },
  required: ['op', 'id'],
  additionalProperties: false,
} as const;

// 顶层 parameters：{ ops: [ <add|update|delete> ... ] }
export const EDIT_OPS_PARAMETERS = {
  type: 'object',
  properties: {
    ops: {
      type: 'array',
      description: '要应用的编辑操作列表，按顺序执行。',
      items: {
        oneOf: [addTaskSchema, updateTaskSchema, deleteTaskSchema],
      },
    },
  },
  required: ['ops'],
  additionalProperties: false,
} as const;

// 完整 function/tool 定义，可直接塞进 OpenAI `tools: [...]`。
export const EDIT_OPS_TOOL_NAME = 'emit_task_edits';

export const EDIT_OPS_FUNCTION = {
  name: EDIT_OPS_TOOL_NAME,
  description:
    '根据用户的自然语言请求，输出一组对任务的结构化编辑操作（新增 / 更新 / 删除）。' +
    '只能输出 schema 约束内的字段，不得越权。',
  parameters: EDIT_OPS_PARAMETERS,
} as const;
