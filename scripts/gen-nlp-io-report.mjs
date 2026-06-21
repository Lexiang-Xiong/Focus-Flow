// 把 BYOK NLP 编辑内核（apply-core）的【真实 I/O】渲成一份分层 HTML。
// 三层：形态层（概述，像将来 diff 预览）→ 原始数据层（详情，ops in / PlanResult out）→ 协议层（边界）。
// 它同时是 Phase 1 的「可视化证据」和 apply-core 的「架构边界文档」。
//
// 关键：所有输出都是【真实跑 apply-core】得到的，不是手写。fixture 只是输入（模拟 LLM 会吐的 ops），
//       被测对象（核心逻辑）是真的 —— 故用 fixture 是诚实的（被测在罐头输入的下游）。
//
// 用法: node scripts/gen-nlp-io-report.mjs [out.html]
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const outFile = process.argv[2] || 'docs/delivery/phase1-io-contract.html';

// ---- 1. 把真实 TS 内核转译成可运行的 ESM（import type 全擦除，无运行时依赖）----
async function loadTs(entry) {
  const r = await build({ entryPoints: [entry], bundle: false, write: false, format: 'esm', platform: 'node' });
  const code = r.outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const applyCore = await loadTs('src/lib/nlp-edit/apply-core.ts');
const schema = await loadTs('src/lib/nlp-edit/schema.ts');
const { planOps, OP_LIMIT } = applyCore;
const { PRIORITY_VALUES, DEADLINE_TYPE_VALUES, OP_KINDS } = schema;

// ---- 2. 构造快照（含一棵树，用来展级联删除）----
const mkTask = (id, title, o = {}) => ({
  id, title, zoneId: o.zoneId, parentId: o.parentId ?? null,
  description: o.description ?? '', completed: o.completed ?? false,
  priority: o.priority ?? 'medium', urgency: 'low',
  deadline: o.deadline ?? null, deadlineType: o.deadlineType ?? 'none',
  order: o.order ?? 0, createdAt: 0, isCollapsed: false, expanded: false, totalWorkTime: 0,
});
const ZONES = [
  { id: 'z-work', name: '工作区', color: '#3b82f6', order: 0, createdAt: 0 },
  { id: 'z-life', name: '生活', color: '#22c55e', order: 1, createdAt: 0 },
];
const TASKS = [
  mkTask('t-proj', '项目A', { zoneId: 'z-work', parentId: null }),
  mkTask('t-design', '设计稿', { zoneId: 'z-work', parentId: 't-proj' }),
  mkTask('t-wire', '画线框', { zoneId: 'z-work', parentId: 't-design' }),
  mkTask('t-impl', '写实现', { zoneId: 'z-work', parentId: 't-proj' }),
  mkTask('t-bug', '修登录bug', { zoneId: 'z-work', parentId: null }),
  mkTask('t-shop', '买菜', { zoneId: 'z-life', parentId: null }),
];
const SNAP = { zones: ZONES, tasks: TASKS };
const titleOf = (id) => TASKS.find((t) => t.id === id)?.title ?? id;
const zoneNameOf = (id) => ZONES.find((z) => z.id === id)?.name ?? id;

// ---- 3. fixtures：每条模拟「LLM 对某句自然语言会吐的 ops」----
const FIXTURES = [
  { label: '新增单个任务', nl: '在工作区加个「写周报」，高优先级', ops: [{ op: 'add_task', zoneId: 'z-work', title: '写周报', priority: 'high' }] },
  { label: '改优先级 + 截止', nl: '把「修登录bug」设为高优先级、明天截止', ops: [{ op: 'update_task', id: 't-bug', priority: 'high', deadlineType: 'tomorrow' }] },
  { label: '删叶子任务（无级联）', nl: '删掉「买菜」', ops: [{ op: 'delete_task', id: 't-shop' }] },
  { label: '删父任务（级联爆炸半径）', nl: '把「项目A」整个删掉', ops: [{ op: 'delete_task', id: 't-proj' }] },
  { label: '一句话多步', nl: '加个「发周报」，把修bug设高优，删掉买菜', ops: [{ op: 'add_task', zoneId: 'z-work', title: '发周报' }, { op: 'update_task', id: 't-bug', priority: 'high' }, { op: 'delete_task', id: 't-shop' }] },
  { label: '子任务 · 挂到已存在父 ✅', nl: '给「项目A」加子任务「写测试」', ops: [{ op: 'add_task', zoneId: 'z-work', title: '写测试', parentId: 't-proj' }] },
  { label: '建新树 · tempId 批内引用 ✅（TP7/T1）', nl: '新建项目「上线」，下面加「部署」「回归」', ops: [{ op: 'add_task', zoneId: 'z-work', title: '上线', tempId: 'u1' }, { op: 'add_task', zoneId: 'z-work', title: '部署', parentId: 'u1' }, { op: 'add_task', zoneId: 'z-work', title: '回归', parentId: 'u1' }] },
  { label: '护栏 · 成环 re-parent ❌（TP9）', nl: '把「项目A」挪到它自己的子任务「画线框」下', ops: [{ op: 'update_task', id: 't-proj', parentId: 't-wire' }] },
  { label: '护栏 · 未知任务 id', nl: '改一个不存在的任务', ops: [{ op: 'update_task', id: 't-nope', title: 'x' }] },
  { label: '护栏 · 未知分区', nl: '往不存在的分区加任务', ops: [{ op: 'add_task', zoneId: 'z-nope', title: 'x' }] },
  { label: '护栏 · 空操作', nl: '（模型没产出任何 op）', ops: [] },
  { label: '护栏 · 超过 op 上限', nl: `（模型失控，批量 ${OP_LIMIT + 1} 个）`, ops: Array.from({ length: OP_LIMIT + 1 }, (_, i) => ({ op: 'add_task', zoneId: 'z-work', title: 't' + i })) },
];

// ---- 4. 真跑 ----
const RUNS = FIXTURES.map((f) => ({ ...f, result: planOps(SNAP, f.ops) }));

// ---- 5. 渲染 ----
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const j = (v) => esc(JSON.stringify(v, null, 2));

function overview(r) {
  if (r.kind === 'noop') return `<div class="ov noop">∅ 空操作 · 合法但不落地</div>`;
  if (r.kind === 'error') return `<div class="ov err">✗ <b>${esc(r.error.code)}</b> <span class="muted">@op[${r.error.opIndex}]</span><div class="msg">${esc(r.error.message)}</div></div>`;
  const lines = [];
  for (const a of r.diff.added) lines.push(`<div class="line add">+ 新增「${esc(a.title)}」<span class="muted">（${esc(zoneNameOf(a.zoneId))}${a.parentLabel ? ' · 挂到「' + esc(a.parentLabel) + '」下' : ''}）</span></div>`);
  for (const u of r.diff.updated) {
    const ch = Object.entries(u.changes).map(([k, v]) => `<span class="chip">${esc(k)}=${esc(String(v))}</span>`).join(' ');
    lines.push(`<div class="line upd">~ 改「${esc(titleOf(u.id))}」 ${ch}</div>`);
  }
  const d = r.diff.deleted;
  if (d.removedIds.length) {
    const names = d.requestedIds.map(titleOf).join('、');
    const warn = d.cascadeCount > 0 ? `<span class="warnflag">⚠ 含级联 ${d.cascadeCount} 个子孙</span>` : '';
    lines.push(`<div class="line del">− 删除 ${r.deleteCount} 个：${esc(names)} ${warn}</div>`);
  }
  return `<div class="ov plan">${lines.join('')}<div class="actcount muted">落地动作 ${r.actions.length} 步</div></div>`;
}

const card = (r) => `
  <section class="card">
    <div class="card-h">
      <span class="label">${esc(r.label)}</span>
      <span class="nl">“${esc(r.nl)}”</span>
    </div>
    ${overview(r.result)}
    <details>
      <summary>原始数据态（输入 ops → PlanResult 输出）</summary>
      <div class="raw">
        <div><div class="raw-t">输入 ops（fixture，模拟 LLM 产出）${r.ops.length > 6 ? ` · 共 ${r.ops.length} 条，截前 3` : ''}</div><pre>${j(r.ops.length > 6 ? r.ops.slice(0, 3) : r.ops)}</pre></div>
        <div><div class="raw-t">apply-core 真实输出 PlanResult</div><pre>${j(r.result)}</pre></div>
      </div>
    </details>
  </section>`;

const opSchemaRow = (kind, required, fields) => `
  <tr><td><code>${kind}</code></td><td>${required.map((x) => `<code>${x}</code>`).join(' ')}</td><td class="muted">${fields}</td></tr>`;

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>apply-core · I/O 契约 & 架构边界</title>
<style>
  :root{--bg:#0f1117;--card:#171a23;--card2:#1d212c;--line:#272c3a;--txt:#e6e8ee;--muted:#9aa3b2;--green:#34d399;--red:#f87171;--amber:#fbbf24;--accent:#818cf8;}
  *{box-sizing:border-box;} body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}
  .wrap{max-width:1040px;margin:0 auto;padding:32px 20px 64px;}
  h1{font-size:23px;margin:0 0 4px;} .sub{color:var(--muted);margin:0 0 22px;font-size:13px;}
  h2{font-size:16px;margin:30px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line);}
  .intro{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:13px 16px;font-size:13px;color:#c7cdda;margin-bottom:8px;}
  code{background:var(--card2);padding:1px 6px;border-radius:5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:6px;}
  th,td{text-align:left;padding:10px 13px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13px;} th{color:#c7cdda;background:var(--card2);}
  tr:last-child td{border-bottom:none;}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px;}
  .card-h{display:flex;align-items:baseline;gap:12px;margin-bottom:10px;flex-wrap:wrap;}
  .label{font-weight:600;} .nl{color:var(--muted);font-size:12.5px;}
  .ov{border-radius:9px;padding:10px 12px;background:var(--card2);}
  .ov.noop{color:var(--muted);} .ov.err{background:rgba(248,113,113,.08);color:#fca5a5;} .ov.err .msg{color:var(--muted);font-size:12.5px;margin-top:3px;}
  .line{padding:2px 0;} .line.add{color:var(--green);} .line.upd{color:var(--amber);} .line.del{color:var(--red);}
  .chip{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:0 6px;font-size:12px;color:#c7cdda;}
  .warnflag{color:var(--amber);font-weight:600;font-size:12.5px;}
  .actcount{font-size:12px;margin-top:6px;}
  details{margin-top:10px;} summary{cursor:pointer;color:var(--accent);font-size:12.5px;user-select:none;}
  .raw{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;} @media(max-width:720px){.raw{grid-template-columns:1fr;}}
  .raw-t{font-size:11.5px;color:var(--muted);margin-bottom:4px;} pre{background:#0b0d13;border:1px solid var(--line);border-radius:8px;padding:10px;overflow:auto;font-size:11.5px;margin:0;max-height:280px;}
  .muted{color:var(--muted);} ul{margin:8px 0;padding-left:20px;} li{margin:4px 0;}
  footer{color:var(--muted);font-size:12px;text-align:center;margin-top:36px;}
</style></head><body><div class="wrap">
  <h1>apply-core · I/O 契约 & 架构边界</h1>
  <p class="sub">BYOK NLP 编辑 Phase 1 · 输出由真实 <code>planOps</code> 跑 fixture 得到（非手写）· 由 <code>scripts/gen-nlp-io-report.mjs</code> 生成</p>
  <div class="intro">
    这块是纯逻辑、<b>没有 UI</b>，但它是 LLM 对话功能的起点。所以这里画的是它的 <b>I/O 契约</b>，不是页面：<br>
    <b>形态层</b>（每张卡上半，像将来 diff 预览）→ 点开 <b>原始数据态</b>（ops 进 / PlanResult 出）→ 末尾 <b>协议层</b>（边界）。<br>
    对纯逻辑模块，<b>I/O + 协议 就是它的架构边界</b>，无需另画依赖图。
  </div>

  <h2>① 形态层 + 详情层：真实 I/O（${RUNS.length} 例）</h2>
  ${RUNS.map(card).join('')}

  <h2>② 协议层 = 架构边界（apply-core 的边）</h2>
  <p class="sub">边界的两半：「收什么 / 吐什么 / 保证什么」（下表）＋「绝不碰什么」（见末尾 forbidden）。</p>

  <h3 style="font-size:14px;color:#c7cdda;margin:14px 0 6px;">入口 op（schema 锁死，<code>additionalProperties:false</code> 防越权）</h3>
  <table><tr><th>op</th><th>必填</th><th>可选字段</th></tr>
    ${opSchemaRow('add_task', ['op', 'zoneId', 'title'], 'description, priority, deadline, deadlineType, parentId, tempId（批内句柄·建新树）')}
    ${opSchemaRow('update_task', ['op', 'id'], 'title, description, completed, priority, deadline, deadlineType, parentId（按 id 部分更新）')}
    ${opSchemaRow('delete_task', ['op', 'id'], '（无）· 注意级联删整棵子树')}
  </table>

  <h3 style="font-size:14px;color:#c7cdda;margin:14px 0 6px;">枚举锁死 / 上限</h3>
  <ul>
    <li>priority ∈ <code>${PRIORITY_VALUES.join(' | ')}</code></li>
    <li>deadlineType ∈ <code>${DEADLINE_TYPE_VALUES.join(' | ')}</code></li>
    <li>op 种类 ∈ <code>${OP_KINDS.join(' | ')}</code> · 单批上限 <code>OP_LIMIT=${OP_LIMIT}</code></li>
    <li><b>urgency 不可设</b>（deadline 派生的显示值，types/index.ts:29）</li>
  </ul>

  <h3 style="font-size:14px;color:#c7cdda;margin:14px 0 6px;">出口：PlanResult（discriminated union）</h3>
  <ul>
    <li><code>{kind:'noop'}</code> — 空 ops，合法不落地</li>
    <li><code>{kind:'error', error:{code, message, opIndex}}</code> — 类型化错误，<b>fail-fast 不静默</b></li>
    <li><code>{kind:'plan', actions, diff, hasDeletes, deleteCount}</code> — action 计划 + diff 预览；删除已级联展开，<code>deleteCount/hasDeletes</code> 供 UI 强制确认</li>
  </ul>

  <h3 style="font-size:14px;color:#c7cdda;margin:14px 0 6px;">错误码（协议保证拦截的越界）</h3>
  <p><code>OP_LIMIT_EXCEEDED</code> · <code>UNKNOWN_TASK_ID</code> · <code>UNKNOWN_ZONE_ID</code> · <code>UNKNOWN_PARENT_ID</code> · <code>DUPLICATE_TEMP_ID</code> · <code>CYCLE</code> · <code>INVALID_OP</code></p>

  <h3 style="font-size:14px;color:#c7cdda;margin:14px 0 6px;">边界另一半：forbidden（这块绝不碰）</h3>
  <p class="muted">纯函数：不碰 store / fs / 网络 / 命令；不修改入参 snapshot；副作用（真调 store action + saveSnapshot）留在 wiring 层。→ 与 byok-plan-v2 §4 boundary rules 一致。</p>

  <h3 style="font-size:14px;color:#c7cdda;margin:14px 0 6px;">树/层级边界（原 known-gap，现已覆盖 · 见 docs/harness/test-points.md）</h3>
  <ul>
    <li><b>TP7 一次性建新多层树 ✅ 已支持（核心层）</b>：add_task 加 tempId、子 op 用 parentId 引用（见上「建新树·tempId」例）。⚠ app 内真正落地还需 Phase 3 wiring（addTask 回传真 id）。</li>
    <li><b>TP8 diff 显父名 ✅</b>：added 带 parentLabel（已有父=名字、新父=「新建:X」），形态层显示「挂到 X 下」→ 防 LLM 静默错挂。</li>
    <li><b>TP9 re-parent 环守护 ✅</b>：把任务挂到自身/自身子孙下 → <code>CYCLE</code>（见上「成环 re-parent」例）。tempId 新父是新叶子，不参与既有环判定。</li>
  </ul>

  <footer>apply-core I/O 契约 & 架构边界 · 真实 planOps 输出 · 形态/原始/协议 三层 · 2026-06-14</footer>
</div></body></html>`;

writeFileSync(outFile, html);
console.log(`I/O 契约报告已生成: ${outFile}  (${RUNS.length} 例真实 planOps 输出)`);
