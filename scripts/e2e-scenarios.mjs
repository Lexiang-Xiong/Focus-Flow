// 能力矩阵 E2E：每种编辑能力 ≥2 例，真打 MiMo，逐例截 diff 预览。
// 用 window.__appStore（dev-only）注入 fixture（分区/任务），再跑 nlp 对话框。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync('.byok.local.json', 'utf8'));
const OUT = 'docs/delivery/scenarios';
fs.mkdirSync(OUT, { recursive: true });

const Z = [{ id: 'z1', name: '工作' }];
const scenarios = [
  { key: '01-add-flat', kind: '新增·多个顶级任务', tasks: [], prompt: '帮我加三个任务：晨跑、读论文、写代码' },
  { key: '02-add-tree', kind: '新增·建新多层树', tasks: [], prompt: '新建一个「发布 v2」任务，下面有三步：写 changelog、打 tag、发公告' },
  { key: '03-sub-existing', kind: '加子任务·到已有任务', tasks: [{ id: 't-pa', title: '项目A' }], prompt: '给项目A加两个子任务：需求评审、技术方案' },
  { key: '04-sub-existing2', kind: '加子任务·到已有任务', tasks: [{ id: 't-pa', title: '项目A' }], prompt: '在项目A下面再加一个「写测试」' },
  { key: '05-update-priority', kind: '更新·优先级', tasks: [{ id: 't-mc', title: '买菜' }], prompt: '把「买菜」改成高优先级' },
  { key: '06-update-complete', kind: '更新·标记完成', tasks: [{ id: 't-wr', title: '写报告' }], prompt: '把「写报告」标记为已完成' },
  { key: '07-reparent', kind: '重挂父·re-parent', tasks: [{ id: 't-pa', title: '项目A' }, { id: 't-x', title: '子任务X' }], prompt: '把「子任务X」挪到「项目A」下面' },
  { key: '08-reparent2', kind: '重挂父·re-parent', tasks: [{ id: 't-wr', title: '写周报' }, { id: 't-cj', title: '写初稿' }], prompt: '把「写初稿」移到「写周报」下面' },
  { key: '09-delete-cascade', kind: '删除·级联子树', tasks: [{ id: 't-old', title: '旧项目' }, { id: 't-c1', title: '子1', parentId: 't-old' }, { id: 't-c2', title: '子2', parentId: 't-old' }], prompt: '删掉「旧项目」' },
  { key: '10-delete-leaf', kind: '删除·单个', tasks: [{ id: 't-tmp', title: '临时任务' }, { id: 't-keep', title: '保留任务' }], prompt: '删除「临时任务」' },
  { key: '11-mixed', kind: '混合·增+改+删', tasks: [{ id: 't-wr', title: '写周报' }, { id: 't-test', title: '测试任务' }], prompt: '加一个「今天复盘」，把「写周报」设为高优先级，删掉「测试任务」' },
  { key: '12-mixed2', kind: '混合·加子任务+改优先级', tasks: [{ id: 't-pa', title: '项目A' }], prompt: '给项目A加个子任务「联调」，再把项目A改成最高优先级' },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 760 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto('http://localhost:8088', { waitUntil: 'load' });
await page.waitForSelector('[data-testid="nlp-trigger"]', { timeout: 15000 });
await page.evaluate((c) => localStorage.setItem('byok_v1', JSON.stringify(c)), cfg);

const results = [];
for (const sc of scenarios) {
  try {
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-testid="nlp-trigger"]', { timeout: 15000 });
    // 注入 fixture（分区 + 任务）
    await page.evaluate(
      ([zones, tasks]) => {
        const mk = (t) => ({ id: t.id, zoneId: t.zoneId || 'z1', parentId: t.parentId ?? null, isCollapsed: false, title: t.title, description: '', completed: !!t.completed, priority: t.priority || 'medium', urgency: 'low', deadline: null, deadlineType: 'none', order: t.order || 0, createdAt: 0, expanded: true, totalWorkTime: 0, ownTime: 0 });
        const w = /** @type {any} */ (window);
        w.__appStore.setState({ zones: zones.map((z, i) => ({ id: z.id, name: z.name, color: '#3b82f6', order: i, createdAt: 0 })), tasks: tasks.map(mk), activeZoneId: zones[0].id, currentView: 'zones' });
      },
      [Z, sc.tasks],
    );
    await page.waitForTimeout(500);

    await page.click('[data-testid="nlp-trigger"]');
    await page.waitForSelector('[data-testid="nlp-input"]', { timeout: 8000 });
    await page.fill('[data-testid="nlp-input"]', sc.prompt);

    let ok = false;
    for (let i = 1; i <= 4 && !ok; i++) {
      await page.click('[data-testid="nlp-generate"]');
      const r = await Promise.race([
        page.waitForSelector('[data-testid="nlp-apply"]', { timeout: 45000 }).then(() => 'ok').catch(() => 'to'),
        page.waitForSelector('[data-testid="nlp-error"]', { timeout: 45000 }).then(() => 'err').catch(() => 'to'),
      ]);
      if (r === 'ok') { ok = true; break; }
      const msg = await page.locator('[data-testid="nlp-error"]').first().textContent().catch(() => '');
      console.log(`  ${sc.key} retry ${i}: ${r} ${(msg || '').slice(0, 50)}`);
      await page.waitForTimeout(1000);
    }
    if (!ok) { results.push({ key: sc.key, kind: sc.kind, ok: false }); console.log(`✗ ${sc.key}`); continue; }

    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${sc.key}.png`, animations: 'disabled' });
    const preview = await page.evaluate(() => {
      const txt = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
      return { added: txt('[data-testid="nlp-added"]'), updated: txt('[data-testid="nlp-updated"]'), skipped: txt('[data-testid="nlp-skipped"]') };
    });
    results.push({ key: sc.key, kind: sc.kind, ok: true, preview });
    console.log(`✓ ${sc.key} (${sc.kind})  added=${preview.added.length} updated=${preview.updated.length} skipped=${preview.skipped.length}`);
  } catch (e) {
    results.push({ key: sc.key, kind: sc.kind, ok: false, err: String(e).slice(0, 120) });
    console.log(`✗ ${sc.key}: ${String(e).slice(0, 120)}`);
  }
}

fs.writeFileSync(`${OUT}/_results.json`, JSON.stringify(results, null, 2));
console.log('\nDONE ' + results.filter((r) => r.ok).length + '/' + results.length + ' ok');
await browser.close();
