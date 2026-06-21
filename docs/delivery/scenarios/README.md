# BYOK NLP 编辑 · 能力矩阵真测截图（真 MiMo V2.5 中国区）

每种编辑能力 ≥2 例，由 `scripts/e2e-scenarios.mjs`（Playwright 无头 chromium 驱动 dev app @8088，经 `/__byok` 真打 MiMo）跑出。每张图是该例的 **diff 预览态**（模型把自然语言翻译成的 ops，确认前）。日期 2026-06-21。

| # | 能力 | 输入（自然语言） | 模型产出（预览） | 截图 |
|---|---|---|---|---|
| 01 | 新增·多个顶级 | 加三个任务：晨跑、读论文、写代码 | +晨跑/读论文/写代码（顶级） | `01-add-flat.png` |
| 02 | 新增·建新多层树 | 新建「发布 v2」，下面三步：写changelog、打tag、发公告 | +发布v2（顶级）；3 步 **挂到「新建:发布 v2」下**（tempId 建新树） | `02-add-tree.png` |
| 03 | 加子任务·到已有 | 给项目A加子任务：需求评审、技术方案 | +需求评审/技术方案 **挂到「项目A」下**（已有父名） | `03-sub-existing.png` |
| 04 | 加子任务·到已有 | 在项目A下面加「写测试」 | +写测试 **挂到「项目A」下** | `04-sub-existing2.png` |
| 05 | 更新·优先级 | 把「买菜」改成高优先级 | ~买菜：priority = high | `05-update-priority.png` |
| 06 | 更新·标记完成 | 把「写报告」标记为已完成 | ~写报告：completed = true | `06-update-complete.png` |
| 07 | 重挂父·re-parent | 把「子任务X」挪到「项目A」下面 | ~子任务X **挂到「项目A」下**（TP8 扩到 update） | `07-reparent.png` |
| 08 | 重挂父·re-parent | 把「写初稿」移到「写周报」下面 | ~写初稿 **挂到「写周报」下** | `08-reparent2.png` |
| 09 | 删除·级联子树 | 删掉「旧项目」（含 2 子） | 删除 3 个（含级联 2）+ **强制确认勾选**，Apply 默认禁用 | `09-delete-cascade.png` |
| 10 | 删除·单个 | 删除「临时任务」 | 删除 1 个 + 强制确认 | `10-delete-leaf.png` |
| 11 | 混合·增+改+删 | 加「今天复盘」，写周报设高优先级，删「测试任务」 | +今天复盘；~写周报 high；删测试任务 | `11-mixed.png` |
| 12 | 混合·加子任务+改优先级 | 给项目A加子任务「联调」，项目A改最高优先级 | +联调 挂到「项目A」下；~项目A：priority = critical | `12-mixed2.png` |

机器可读结果见 `_results.json`。凭据=用户的小米 MiMo Token Plan（中国区），key 仅在 gitignore 的 `.byok.local.json`，不入仓。
