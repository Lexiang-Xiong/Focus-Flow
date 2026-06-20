import { describe, it, expect } from 'vitest';
import {
  OP_KINDS,
  PRIORITY_VALUES,
  DEADLINE_TYPE_VALUES,
  EDIT_OPS_PARAMETERS,
  EDIT_OPS_FUNCTION,
  EDIT_OPS_TOOL_NAME,
  type EditOp,
} from './schema';

// schema.ts 是纯定义，测试只锁「形状契约」：
//   - 枚举值与 types 对齐（锁死，防漂移）；
//   - JSON Schema 结构能当 OpenAI function-calling parameters 用；
//   - TS 类型能描述三种 op（编译期断言）。

// ============ 枚举锁死 ============
describe('枚举值锁死', () => {
  it('op 三种且仅三种', () => {
    expect([...OP_KINDS].sort()).toEqual(['add_task', 'delete_task', 'update_task']);
  });

  it('priority 锁 5 级（与上游 TaskPriority 对齐：critical|heavy|high|medium|low）', () => {
    expect([...PRIORITY_VALUES].sort()).toEqual(['critical', 'heavy', 'high', 'low', 'medium']);
  });

  it('deadlineType 锁 exact|today|tomorrow|week|none', () => {
    expect([...DEADLINE_TYPE_VALUES].sort()).toEqual([
      'exact',
      'none',
      'today',
      'tomorrow',
      'week',
    ]);
  });
});

// ============ JSON Schema 结构（OpenAI parameters 契约） ============
describe('EDIT_OPS_PARAMETERS（function parameters 契约）', () => {
  it('顶层是 object，ops 为 array', () => {
    expect(EDIT_OPS_PARAMETERS.type).toBe('object');
    expect(EDIT_OPS_PARAMETERS.properties.ops.type).toBe('array');
    expect(EDIT_OPS_PARAMETERS.required).toContain('ops');
  });

  it('ops.items 用 oneOf 锁三种 op 分支', () => {
    const oneOf = EDIT_OPS_PARAMETERS.properties.ops.items.oneOf;
    expect(oneOf).toHaveLength(3);
    const consts = oneOf.map((s) => s.properties.op.const).sort();
    expect(consts).toEqual(['add_task', 'delete_task', 'update_task']);
  });

  it('每个分支 additionalProperties:false（防 LLM 夹带越权字段）', () => {
    for (const branch of EDIT_OPS_PARAMETERS.properties.ops.items.oneOf) {
      expect(branch.additionalProperties).toBe(false);
    }
  });

  it('三种 op 都不暴露 urgency（urgency 是派生显示值）', () => {
    for (const branch of EDIT_OPS_PARAMETERS.properties.ops.items.oneOf) {
      expect(Object.keys(branch.properties)).not.toContain('urgency');
    }
  });

  it('add_task：zoneId+title 必填，priority/deadlineType 锁枚举', () => {
    const add = EDIT_OPS_PARAMETERS.properties.ops.items.oneOf.find(
      (s) => s.properties.op.const === 'add_task',
    )!;
    expect(add.required).toEqual(expect.arrayContaining(['op', 'zoneId', 'title']));
    // oneOf 分支是联合类型，TS 无法据运行时 find 收窄到 add 分支；这里断言 schema 形态故按 add 取属性。
    const addProps = add.properties as Record<string, { enum?: readonly string[] }>;
    expect(addProps.priority.enum).toEqual([...PRIORITY_VALUES]);
    expect(addProps.deadlineType.enum).toEqual([...DEADLINE_TYPE_VALUES]);
  });

  it('update_task：仅 id 必填（partial 更新）', () => {
    const upd = EDIT_OPS_PARAMETERS.properties.ops.items.oneOf.find(
      (s) => s.properties.op.const === 'update_task',
    )!;
    expect(upd.required).toEqual(expect.arrayContaining(['op', 'id']));
    expect(upd.required).not.toContain('title');
  });

  it('delete_task：仅 id', () => {
    const del = EDIT_OPS_PARAMETERS.properties.ops.items.oneOf.find(
      (s) => s.properties.op.const === 'delete_task',
    )!;
    expect(del.required).toEqual(expect.arrayContaining(['op', 'id']));
    expect(Object.keys(del.properties).sort()).toEqual(['id', 'op']);
  });
});

// ============ function 定义可直接用 ============
describe('EDIT_OPS_FUNCTION（tool 定义）', () => {
  it('带 name / description / parameters', () => {
    expect(EDIT_OPS_FUNCTION.name).toBe(EDIT_OPS_TOOL_NAME);
    expect(typeof EDIT_OPS_FUNCTION.description).toBe('string');
    expect(EDIT_OPS_FUNCTION.parameters).toBe(EDIT_OPS_PARAMETERS);
  });
});

// ============ TS 类型能描述三种 op（编译期 + 运行期烟测） ============
describe('EditOp 类型联合', () => {
  it('三种 op 字面量都可构造', () => {
    const ops: EditOp[] = [
      { op: 'add_task', zoneId: 'z1', title: 'hi' },
      { op: 'update_task', id: 't1', title: 'new' },
      { op: 'delete_task', id: 't2' },
    ];
    expect(ops.map((o) => o.op)).toEqual(['add_task', 'update_task', 'delete_task']);
  });
});
