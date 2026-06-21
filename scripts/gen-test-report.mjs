// 把 vitest 的 JSON 结果转成一份独立、零依赖的 HTML 测试报告。
// 用法: node scripts/gen-test-report.mjs [test-results.json] [test-report.html]
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';

const inFile = process.argv[2] || 'test-results.json';
const outFile = process.argv[3] || 'test-report.html';
const root = process.cwd();

const data = JSON.parse(readFileSync(inFile, 'utf8'));

// 每个被测模块的「功能说明」，让报告不只是测试名，也能看出覆盖了什么能力。
const FEATURE_NOTES = {
  'urgency-utils': '紧急度引擎：截止日期排名打分、档位映射、颜色分档、截止日期继承、加权排序、快捷日期换算',
  'tree-utils': '任务树：树形结构打平（含折叠/聚焦/分区过滤）、拖拽落点的深度与父节点定位',
  'taskSlice': '任务状态管理：增删改、完成状态向上/向下联动、工时累计汇总、预估时间汇总、统计、拖拽重排',
  'migration': '数据迁移：DB 设置 → 应用设置的字段映射与布尔/默认值回退',
  'file-mirror-core': '文件镜像内核：回声锁不变量（canonical）、镜像解析、启动/轮询动作决策',
  'file-mirror-engine': '文件镜像引擎：IO 编排与锁行为',
  'apply-core': 'BYOK NLP 编辑内核：op 校验 + action 计划 + diff 预览（增/改/删）、未知 id/zoneId/parentId 拦截、删除级联展开、op 上限、坏 op 全否决（fail-fast）',
  'schema': 'BYOK NLP 编辑 op 的 JSON Schema：add/update/delete 三类，priority/deadlineType 枚举锁死、additionalProperties:false 防越权、urgency 不可设（派生量）',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtMs = (ms) => (ms == null ? '–' : ms < 1 ? '<1ms' : ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`);

const files = data.testResults.map((f) => {
  const rel = relative(root, f.name);
  const base = rel.split(/[\\/]/).pop().replace(/\.test\.tsx?$/, '');
  const assertions = f.assertionResults || [];
  const passed = assertions.filter((a) => a.status === 'passed').length;
  const failed = assertions.filter((a) => a.status === 'failed').length;
  const skipped = assertions.filter((a) => a.status !== 'passed' && a.status !== 'failed').length;
  const duration = (f.endTime && f.startTime) ? f.endTime - f.startTime : null;
  // 按 describe 分组
  const groups = {};
  for (const a of assertions) {
    const g = (a.ancestorTitles && a.ancestorTitles[0]) || '(顶层)';
    (groups[g] ||= []).push(a);
  }
  return { rel, base, assertions, passed, failed, skipped, duration, groups, status: f.status };
});

const total = data.numTotalTests ?? files.reduce((n, f) => n + f.assertions.length, 0);
const totalPass = data.numPassedTests ?? files.reduce((n, f) => n + f.passed, 0);
const totalFail = data.numFailedTests ?? files.reduce((n, f) => n + f.failed, 0);
const totalSkip = total - totalPass - totalFail;
const wall = (data.startTime && files.length)
  ? Math.max(...files.map((f) => (data.testResults.find((t) => relative(root, t.name) === f.rel)?.endTime) || 0)) - data.startTime
  : files.reduce((n, f) => n + (f.duration || 0), 0);
const allGreen = totalFail === 0;
const passRate = total ? ((totalPass / total) * 100).toFixed(1) : '0.0';
const genDate = new Date(data.startTime || Date.now()).toLocaleString('zh-CN', { hour12: false });

const statusPill = (a) =>
  a.status === 'passed' ? '<span class="pill pass">通过</span>'
  : a.status === 'failed' ? '<span class="pill fail">失败</span>'
  : '<span class="pill skip">跳过</span>';

const fileSection = (f) => `
  <section class="file ${f.failed ? 'has-fail' : ''}">
    <header class="file-head" onclick="this.parentElement.classList.toggle('collapsed')">
      <span class="chevron">▾</span>
      <span class="file-name">${esc(f.rel)}</span>
      <span class="file-meta">
        <span class="count ok">${f.passed} 通过</span>
        ${f.failed ? `<span class="count bad">${f.failed} 失败</span>` : ''}
        ${f.skipped ? `<span class="count muted">${f.skipped} 跳过</span>` : ''}
        <span class="count muted">${fmtMs(f.duration)}</span>
      </span>
    </header>
    ${FEATURE_NOTES[f.base] ? `<p class="feature">覆盖能力：${esc(FEATURE_NOTES[f.base])}</p>` : ''}
    <div class="groups">
      ${Object.entries(f.groups).map(([g, items]) => `
        <div class="group">
          <h4>${esc(g)} <span class="muted">(${items.length})</span></h4>
          <ul>
            ${items.map((a) => `
              <li class="${a.status}">
                ${statusPill(a)}
                <span class="t-title">${esc(a.title)}</span>
                <span class="t-dur muted">${fmtMs(a.duration)}</span>
                ${a.failureMessages && a.failureMessages.length
                  ? `<pre class="fail-msg">${esc(a.failureMessages.join('\n'))}</pre>` : ''}
              </li>`).join('')}
          </ul>
        </div>`).join('')}
    </div>
  </section>`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Focus-Flow 测试报告</title>
<style>
  :root {
    --bg:#0f1117; --card:#171a23; --card2:#1d212c; --line:#272c3a;
    --txt:#e6e8ee; --muted:#9aa3b2; --green:#34d399; --red:#f87171; --amber:#fbbf24;
    --accent:#818cf8;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--txt);
    font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { max-width:1040px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:24px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 24px; font-size:13px; }
  .banner { display:flex; align-items:center; gap:14px; padding:18px 22px; border-radius:14px;
    background:linear-gradient(135deg, ${allGreen ? '#0c2e23,#10241f' : '#321616,#2a1414'});
    border:1px solid ${allGreen ? '#1f5e49' : '#7f2a2a'}; margin-bottom:24px; }
  .banner .icon { font-size:30px; }
  .banner b { font-size:18px; color:${allGreen ? 'var(--green)' : 'var(--red)'}; }
  .cards { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:28px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .stat .n { font-size:26px; font-weight:700; }
  .stat .l { color:var(--muted); font-size:12px; }
  .stat.pass .n { color:var(--green); } .stat.fail .n { color:var(--red); }
  .stat.rate .n { color:var(--accent); }
  .bar { height:8px; border-radius:6px; background:var(--card2); overflow:hidden; margin:0 0 28px; display:flex; }
  .bar i { display:block; height:100%; }
  .bar .g { background:var(--green); } .bar .r { background:var(--red); } .bar .s { background:var(--amber); }
  section.file { background:var(--card); border:1px solid var(--line); border-radius:12px; margin-bottom:14px; overflow:hidden; }
  section.file.has-fail { border-color:#7f2a2a; }
  .file-head { display:flex; align-items:center; gap:10px; padding:14px 18px; cursor:pointer; user-select:none; }
  .file-head:hover { background:var(--card2); }
  .chevron { color:var(--muted); transition:transform .15s; font-size:12px; }
  section.file.collapsed .chevron { transform:rotate(-90deg); }
  section.file.collapsed .groups, section.file.collapsed .feature { display:none; }
  .file-name { font-weight:600; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; }
  .file-meta { margin-left:auto; display:flex; gap:10px; font-size:12px; }
  .count.ok { color:var(--green); } .count.bad { color:var(--red); } .count.muted { color:var(--muted); }
  .feature { margin:0; padding:0 18px 12px; color:var(--muted); font-size:12.5px; }
  .groups { padding:4px 18px 16px; }
  .group { border-top:1px solid var(--line); padding:12px 0 4px; }
  .group h4 { margin:0 0 8px; font-size:13px; color:#c7cdda; }
  .group ul { list-style:none; margin:0; padding:0; }
  .group li { display:flex; align-items:center; gap:10px; padding:5px 0; flex-wrap:wrap; }
  .group li.failed { background:rgba(248,113,113,.06); border-radius:6px; padding:6px 8px; }
  .pill { font-size:11px; padding:2px 8px; border-radius:20px; font-weight:600; white-space:nowrap; }
  .pill.pass { background:rgba(52,211,153,.14); color:var(--green); }
  .pill.fail { background:rgba(248,113,113,.16); color:var(--red); }
  .pill.skip { background:rgba(251,191,36,.16); color:var(--amber); }
  .t-title { flex:1 1 auto; }
  .t-dur { font-size:11px; }
  .muted { color:var(--muted); }
  .fail-msg { flex-basis:100%; background:#1a0e0e; border:1px solid #5a2020; color:#fca5a5;
    padding:10px 12px; border-radius:8px; font-size:12px; overflow:auto; margin:6px 0 0; white-space:pre-wrap; }
  footer { color:var(--muted); font-size:12px; text-align:center; margin-top:32px; }
  .toolbar { display:flex; gap:10px; margin-bottom:14px; }
  .toolbar button { background:var(--card2); color:var(--txt); border:1px solid var(--line);
    border-radius:8px; padding:6px 12px; cursor:pointer; font-size:12px; }
  .toolbar button:hover { border-color:var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <h1>Focus-Flow · 自动化测试报告</h1>
  <p class="sub">vitest ${esc(data.version || '')} · 运行时间 ${esc(genDate)} · 总耗时 ${fmtMs(wall)}</p>

  <div class="banner">
    <span class="icon">${allGreen ? '✅' : '❌'}</span>
    <div>
      <b>${allGreen ? '全部通过' : `${totalFail} 项失败`}</b>
      <div class="muted">${totalPass}/${total} 用例通过 · 通过率 ${passRate}%</div>
    </div>
  </div>

  <div class="cards">
    <div class="stat"><div class="n">${total}</div><div class="l">用例总数</div></div>
    <div class="stat pass"><div class="n">${totalPass}</div><div class="l">通过</div></div>
    <div class="stat fail"><div class="n">${totalFail}</div><div class="l">失败</div></div>
    <div class="stat"><div class="n">${files.length}</div><div class="l">测试文件</div></div>
    <div class="stat rate"><div class="n">${passRate}%</div><div class="l">通过率</div></div>
  </div>

  <div class="bar">
    <i class="g" style="width:${total ? (totalPass / total) * 100 : 0}%"></i>
    <i class="r" style="width:${total ? (totalFail / total) * 100 : 0}%"></i>
    <i class="s" style="width:${total ? (totalSkip / total) * 100 : 0}%"></i>
  </div>

  <div class="toolbar">
    <button onclick="document.querySelectorAll('section.file').forEach(s=>s.classList.remove('collapsed'))">全部展开</button>
    <button onclick="document.querySelectorAll('section.file').forEach(s=>s.classList.add('collapsed'))">全部折叠</button>
  </div>

  ${files.map(fileSection).join('')}

  <footer>由 scripts/gen-test-report.mjs 基于 vitest JSON 结果生成 · ${esc(genDate)}</footer>
</div>
</body>
</html>`;

writeFileSync(outFile, html);
console.log(`HTML 报告已生成: ${outFile}  (${total} 用例, ${totalPass} 通过, ${totalFail} 失败)`);
