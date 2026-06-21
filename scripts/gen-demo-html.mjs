// 把交付截图合并成【单个自包含 HTML】（图片全 base64 内嵌），便于发给别人直接打开。
// 输出 docs/delivery/byok-nlp-edit-demo.html
import fs from 'node:fs';

const SC = 'docs/delivery/scenarios';
const D = 'docs/delivery';
const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const card = (n, kind, prompt, init, out, file) => `
  <div class="card"><div class="head"><span class="num">${n}</span><span class="kind">${kind}</span></div>
    <div class="body"><div class="io">
      <div><div class="lbl">输入</div><div class="prompt">${prompt}</div></div>
      <div><div class="lbl">初始</div><div class="init">${init}</div></div>
      <div><div class="lbl">模型产出</div><div class="out">${out}</div></div>
    </div><div class="shotwrap"><img src="${b64(`${SC}/${file}`)}" alt="${n}"></div></div>
  </div>`;

const scen = [
  ['01', '新增 · 多个顶级任务', '帮我加三个任务：晨跑、读论文、写代码', '空分区「工作」', '<span class="add">+ 晨跑 / 读论文 / 写代码</span>（均顶级）', '01-add-flat.png'],
  ['02', '新增 · 建新多层树（tempId）', '新建一个「发布 v2」任务，下面有三步：写 changelog、打 tag、发公告', '空分区「工作」', '<span class="add">+ 发布 v2</span>；3 步 <span class="new">挂到「新建:发布 v2」下</span>', '02-add-tree.png'],
  ['03', '加子任务 · 到已有任务', '给项目A加两个子任务：需求评审、技术方案', '已有「项目A」', '<span class="add">+ 需求评审 / 技术方案</span> <span class="new">挂到「项目A」下</span>', '03-sub-existing.png'],
  ['04', '加子任务 · 到已有任务', '在项目A下面再加一个「写测试」', '已有「项目A」', '<span class="add">+ 写测试</span> <span class="new">挂到「项目A」下</span>', '04-sub-existing2.png'],
  ['05', '更新 · 优先级', '把「买菜」改成高优先级', '已有「买菜」（medium）', '<span class="upd">~ 买菜：priority = high</span>', '05-update-priority.png'],
  ['06', '更新 · 标记完成', '把「写报告」标记为已完成', '已有「写报告」（未完成）', '<span class="upd">~ 写报告：completed = true</span>', '06-update-complete.png'],
  ['07', '重挂父 · re-parent', '把「子任务X」挪到「项目A」下面', '已有「项目A」「子任务X」（均顶级）', '<span class="upd">~ 子任务X</span> <span class="new">挂到「项目A」下</span>', '07-reparent.png'],
  ['08', '重挂父 · re-parent', '把「写初稿」移到「写周报」下面', '已有「写周报」「写初稿」', '<span class="upd">~ 写初稿</span> <span class="new">挂到「写周报」下</span>', '08-reparent2.png'],
  ['09', '删除 · 级联子树（强制确认）', '删掉「旧项目」', '「旧项目」含子1、子2', '<span class="del">删除 3 个（含级联 2）</span>；需勾选确认，Apply 默认禁用', '09-delete-cascade.png'],
  ['10', '删除 · 单个', '删除「临时任务」', '已有「临时任务」「保留任务」', '<span class="del">删除 1 个</span>（保留任务不动）；需勾选确认', '10-delete-leaf.png'],
  ['11', '混合 · 增 + 改 + 删', '加一个「今天复盘」，把「写周报」设为高优先级，删掉「测试任务」', '已有「写周报」「测试任务」', '<span class="add">+ 今天复盘</span>；<span class="upd">~ 写周报 high</span>；<span class="del">删 测试任务</span>', '11-mixed.png'],
  ['12', '混合 · 加子任务 + 改优先级', '给项目A加个子任务「联调」，再把项目A改成最高优先级', '已有「项目A」', '<span class="add">+ 联调</span> <span class="new">挂到「项目A」下</span>；<span class="upd">~ 项目A：priority = critical</span>', '12-mixed2.png'],
];

const hero = (file, cap) => `<figure class="hero"><img src="${b64(`${D}/${file}`)}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`;

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Focus-Flow · BYOK 自然语言任务编辑 · 真机演示</title>
<style>
:root{--bg:#0f1117;--card:#171a23;--card2:#1d212c;--line:#272c3a;--txt:#e6e8ee;--muted:#9aa3b2;--green:#34d399;--amber:#fbbf24;--accent:#818cf8;--red:#f87171}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:34px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.sub{color:var(--muted);font-size:13px;margin:0 0 20px}
.heroes{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.hero{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.hero img{width:100%;display:block}.hero figcaption{padding:8px 12px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;margin-bottom:20px;overflow:hidden}
.head{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--card2);border-bottom:1px solid var(--line)}
.num{font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}.kind{font-weight:600}
.body{display:grid;grid-template-columns:360px 1fr;gap:0}
.io{padding:16px 18px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:12px}
.lbl{font-size:11px;letter-spacing:.04em;color:var(--muted);text-transform:uppercase;margin-bottom:4px}
.prompt{background:#0c1730;border:1px solid #25407a;border-radius:8px;padding:10px 12px;font-size:14px;color:#cfe0ff}
.init{color:var(--muted);font-size:13px}.out{font-size:13px;line-height:1.7}
.add{color:var(--green)}.upd{color:#7cc4f5}.del{color:var(--red)}.new{color:var(--amber)}
.shotwrap{padding:10px;background:#0a0c12;display:flex;align-items:center;justify-content:center}.shotwrap img{width:100%;border-radius:8px;display:block}
code{background:var(--card2);padding:1px 5px;border-radius:4px;font-family:ui-monospace,Menlo,monospace;font-size:12px}
@media(max-width:820px){.body{grid-template-columns:1fr}.io{border-right:none;border-bottom:1px solid var(--line)}.heroes{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<h1>Focus-Flow · 应用内 BYOK 自然语言任务编辑 — 真机演示</h1>
<p class="sub">一句中文 → 真实 LLM（小米 MiMo V2.5）→ 受 schema 约束的任务编辑 → diff 预览（含父任务名/级联/强制确认）→ 一键落地（可一步撤销）。本页所有截图均为真实运行（Playwright 驱动应用，真打网关），图片已内嵌，单文件可离线打开。</p>

<h2>一、端到端三态（硬样本：「下午要干三件事，其中第二件下面有三个小点」）</h2>
<div class="heroes">
${hero('phase4-shot0-config.png', '应用内 BYOK 配置（填 base/key/model，key 明文存本地，标注风险）')}
${hero('phase4-shot1-input.png', '① 输入态：一句自然语言')}
${hero('phase4-shot2-preview.png', '② diff 预览：三个小点「挂到『新建:写周报』下」——父名清晰，绝不静默错挂')}
${hero('phase4-shot3-tree.png', '③ 落地后任务树：写周报带三个子任务，可一步撤销')}
</div>

<h2>二、能力矩阵（每种编辑 ≥2 例 · 输入 ↔ 界面 对比）</h2>
<p class="sub">左 = 自然语言输入 / 初始状态 / 模型产出，右 = 该例真实 diff 预览界面。</p>
${scen.map((s) => card(...s)).join('\n')}
</div></body></html>`;

fs.writeFileSync(`${D}/byok-nlp-edit-demo.html`, html);
const kb = Math.round(fs.statSync(`${D}/byok-nlp-edit-demo.html`).size / 1024);
console.log(`wrote ${D}/byok-nlp-edit-demo.html (${kb} KB, self-contained)`);
