// src/lib/nlp-edit/nlp-smoke.test.ts
// 真 LLM 证据（evidence，不是 CI gate）：拿 Episode#2 的硬样本打真实 ModelScope 网关，
// 验证模型用 tempId 建新树、不把新子任务静默错挂到既有任务上。
//
// 需要凭据，从【环境变量】读（CLI evidence 跑法，不经浏览器 localStorage）：
//   BYOK_KEY=...  [BYOK_BASE=https://api-inference.modelscope.cn/v1]  [BYOK_MODEL=Qwen/Qwen2.5-72B-Instruct]  \
//   npx vitest run src/lib/nlp-edit/nlp-smoke.test.ts
// 没有 BYOK_KEY 时【自动跳过】→ 不影响 `npm run test` 的 CI gate（真集成证据不卡 CI，见 byok-plan-v2 §7）。
// node 直连 base（无浏览器 CORS，故不走 /__byok 代理）。key 只从 env 读，绝不硬编码 / 入仓 / 打日志。

import { describe, it, expect } from 'vitest';
import type { Task, Zone } from '@/types';
import { createProvider } from './provider';
import { planOps, type Snapshot } from './apply-core';

const KEY = process.env.BYOK_KEY;
const BASE = process.env.BYOK_BASE || 'https://api-inference.modelscope.cn/v1';
const MODEL = process.env.BYOK_MODEL || 'Qwen/Qwen2.5-72B-Instruct';

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id, zoneId: 'z1', parentId: null, isCollapsed: false, title: id, description: '',
    completed: false, priority: 'medium', urgency: 'low', deadline: null, deadlineType: 'none',
    order: 0, createdAt: 0, expanded: false, totalWorkTime: 0, ...over,
  };
}
const zone: Zone = { id: 'z1', name: '工作', color: '#3b82f6', order: 0, createdAt: 0 };

describe.skipIf(!KEY)('真 LLM 证据 · Episode#2 硬样本（需 BYOK_KEY；无 key 自动跳过，不进 CI）', () => {
  it('「下午要干三件事，其中第二件下面有三个小点」→ 用 tempId 建新树，不静默错挂到既有任务', async () => {
    // 故意放一个【既有】任务作为「错挂诱饵」：Episode#2 里模型曾把新子任务静默挂到最近的既有任务上。
    const snapshot: Snapshot = { zones: [zone], tasks: [task('t-proj', { title: '项目A' })] };

    const provider = createProvider({
      fetchFn: (i, init) => fetch(i, init), // node 直连，无 CORS
      storage: { getItem: (k) => (k === 'byok_v1' ? JSON.stringify({ base: BASE, key: KEY, model: MODEL }) : null) },
    });

    const r = await provider.requestOps('下午要干三件事，其中第二件下面有三个小点', snapshot);
    // 打印真实 ops 供人眼判定（这是交付证据的一部分）。
    console.log('\n=== REAL LLM OPS ===\n' + JSON.stringify(r, null, 2));
    expect(r.kind).toBe('ops');
    if (r.kind !== 'ops') return;

    const plan = planOps(snapshot, r.ops, { invalidPolicy: 'skip' });
    console.log('\n=== PLAN (diff) ===\n' + JSON.stringify(plan, null, 2));
    expect(plan.kind).toBe('plan');
    if (plan.kind !== 'plan') return;

    // 关键 Episode#2 断言：没有任何【新增】任务被挂到既有诱饵任务 t-proj 下。
    const misattached = plan.diff.added.filter((a) => a.parentId === 't-proj');
    expect(misattached, '新子任务被静默错挂到既有「项目A」').toHaveLength(0);

    // 至少建出三件事中的若干（结构不写死，留人眼看 diff），且应当出现批内新建父（parentLabel 以「新建:」开头）。
    expect(plan.diff.added.length).toBeGreaterThanOrEqual(3);
    const hasNewTreeParent = plan.diff.added.some((a) => a.parentLabel?.startsWith('新建:'));
    expect(hasNewTreeParent, '第二件的三个小点应挂在一个【新建】父下（tempId 建新树）').toBe(true);
  }, 60_000);
});
