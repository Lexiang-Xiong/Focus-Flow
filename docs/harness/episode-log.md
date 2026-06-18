# Focus-Flow · Development Workflow Harness — Episode Log

> 个人留底（docs/ 不进上游）。本文件是 Harness 笔记里 **Stage 1 Passive Capture** 的落地：把 Focus-Flow 真实开发片段记成 episode，并评估「子 agent 实现 + 人机对齐 + harness 观测」这套工作流是否有效。
> 起始 2026-06-14｜分支 `feat/byok-nlp-edit`。

## 实验设计

- **被观测者**：子 agent / workflow（当「开发者」），负责实现 BYOK NLP 编辑功能。
- **观测者（harness）**：主循环（我），负责记 episode、抓 drift、评估对齐有效性。不亲自写功能代码。
- **方法论锚**：[[Development Workflow Harness]] 的 Plan Episode + 对齐≠约束守则。

---

## Episode #1 — byok-nlp-phase1（schema + apply-core）

`episode_type: code`｜锚：分支 `feat/byok-nlp-edit` 工作树改动（未 commit）｜Intent：byok-plan-v2.md §0

### 派活前：人机对齐口径（我 surface，待人 ratify）

按「对齐≠约束」守则，下列属于 Intent 级口径，我**摆出来而非闷头脑补**：

- 实验 vs 留升级版 → 选**实验**，分两步：Phase 1 无 key 先落，LLM 契约（Phase 2）用 Jarvis API 后做。
- 起手范围 → 仅 **Phase 1**（schema + apply-core + 测试），纯逻辑、零 key、零基础设施。
- `update_task` = 按 id 部分更新；op 以 `id` 引用现有任务。

### 派活前：grounding deltas（harness 在写 spec 时核对 plan↔代码）

| # | 项 | plan 说 | 代码真相（证据） | 处置 |
|---|---|---|---|---|
| 0a | 部分更新 | （未明说） | `updateTask(id, updates: Partial<Task>)` taskSlice.ts:21 | ✅ 证实我的假设 |
| 0b | id 引用 | "能引用 id" | 各 action 以 id 定位 | ✅ 证实 |
| 1 | urgency | §6"锁死 priority/**urgency**/deadlineType 枚举" | urgency「值由 deadline 自动计算」types/index.ts:29 | ❌ 纠错：op 不设 urgency |
| 2 | zoneId | 未强调 | `addTask(zoneId, ...)` 必填 taskSlice.ts:182 | ➕ 补：op 须带 zoneId，apply-core 校验 zone 存在 |
| 3 | 删除 | "批量删除要显式" | `deleteTask` **级联删子树** taskSlice.ts:294-315 | ➕ 补：删父=删整棵，diff 须展开级联数量 |
| 4 | 单步撤销 | "一次 saveSnapshot + 批量 setState" | 每个 action 自带 `saveSnapshot()` | ➕ 补：批处理属 wiring（Phase 3），apply-core 保持纯 |

> harness 观察：**plan 的 §6 有一处实打实的错（urgency）**，且漏了 zoneId 必填、删除级联两个会影响正确性的点。这正是「只看 diff/plan 不看代码」会漏的——grounding 阶段抓到，成本最低。

### 实现 + 验证：workflow `byok-phase1-harness`（完成 2026-06-14｜4 agents｜~220k tok｜~10.5min）

**产物**：`src/lib/nlp-edit/{schema,apply-core,schema.test,apply-core.test}.ts`（4 文件，全新增，`git diff HEAD` 为空 = 零现有文件改动）。纯逻辑：只 `import type` 自 `@/types` 与 `./schema`，无 store/fs/tauri/fetch/新依赖。

**验收裁决（harness 亲跑，真实环境，非取 agent 自证）**：
`npx vitest run file-mirror-core + nlp-edit` → **Test Files 3 passed / Tests 45 passed**（baseline 16 + schema 12 + apply-core 17），`tsc --noEmit` 干净。→ **代码正确，测试真实非空洞，8 条护栏全覆盖。**

**三镜头判定**：

| 镜头 | 判定 | 备注 |
|---|---|---|
| ground-truth | ✅ pass | 4 条 grounding delta 全部正确落实（见下） |
| boundaries | ✅ pass | `git diff HEAD` 空、imports 纯、零新依赖 |
| tests-real | ❌ fail | **sandbox 假阴性**——沙箱内 vitest worker 起不来（baseline 同样报 config 错）。其 esbuild 旁路探针 27/27 才是对逻辑的正确判断。harness 已亲跑裁决为真绿 |

**grounding 上前置口径的效果（正向信号）**：我派活前喂的 4 条 plan↔代码 delta，子 agent **全部正确执行**，且独立复现了其中 3 条 planConflict：

- urgency 不设为 op 字段（正确无视 plan §6 的错）✅
- add_task 必带 zoneId 且 apply-core 校验 ✅
- delete 级联展开（removedIds + cascadeCount + hasDeletes 供 HIL 强制确认）✅
- 单步撤销留 wiring 层，apply-core 保持纯 ✅

→ **前置口径 = 零返工**：凡是我 prior 钉死的点，agent 没有一处脑补错。

### Drift / 待 ratify（harness 抓到的真问题）

| # | 类型 | 内容 | 性质 |
|---|---|---|---|
| D1 | **验证环境** | 同一 workflow 内两 agent 对"测试是否通过"给出相反结论，差异 = sandbox。"绿"依赖关闭沙箱 | 流程级：gate 必须真实环境跑（§7 实证）。**不是 agent 错，是环境口径未定** |
| D2 | **plan 假设落空** | tests-real 查到 `.github/workflows/build.yml` **无 vitest 步骤**，只有 build。plan §7"`test:report` 全绿 = gate"依赖的 CI 门**根本不存在** | plan 缺口：gate 未接 CI |
| D3 | **Intent 邻近口径（待你 ratify）** | 子 agent 自行决定：update **可改 parentId（重挂父）但不可改 zoneId（换区）**；坏 op 一律 **fail-fast 全否决**（非部分应用） | 合理且有据，但属行为/范围口径，按守则应由你拍板 |
| D4 | 覆盖缺口（次要） | `INVALID_OP` 防御分支无测试（不在 8 条护栏内） | 低风险 |
| D5 | 环境卫生 | `node_modules` 初始缺 jsdom，需 `npm install` 才能跑全量 | 低风险 |
| **D6** | **reflexive（harness 自身 drift）** | 我只写了 harness 内部 episode-log，**没产出 §8 给人类的 Change Verdict**，被人工抓到。把"记了 episode"当成了"给了人类 verdict"——正是 §8 要防的 agent 自证完成 | 已补 `docs/delivery/phase1-nlp-core.{md,html}`。教训：**内部记录 ≠ 人类交付件，两者都要出** |
| **D7** | 现成管线真 bug | 出 HTML 报告时发现 `gen-test-report.mjs` 第 27 行 `rel.split('/')` 在 Windows（`relative()` 产反斜杠）下切不开 → `FEATURE_NOTES` **从未在 Windows 渲染过**（覆盖能力 0 条） | 已修 `split(/[\\/]/)` + 登记 apply-core/schema 两条。harness 在"复用现成 artifact 管线"时反而暴露了管线自身的跨平台 bug |

子 agent 自报 10 条 `ambiguitiesResolved`：除 D3 两条外，其余（op 上限=50、diff 形状、error 类型、空 ops→noop、文件命名等）均为低风险实现细节，**委派得当，无越界**。

---

## 工作流 + 人机对齐有效性评估 · 第 1 次（Episode #1 后）

**这套工作流有效吗？—— 初步是，且有可量化信号：**

1. **前置口径直接消灭 drift**：4 条 prior-钉死的 delta，agent 零脑补错；对照 plan §6 的 urgency 错——若不前置纠正，agent 很可能照抄 plan 出错。**"人/harness 先指定口径，agent 再执行"在真实代码上首次验证成立。**
2. **对抗验证抓到了自证抓不到的东西**：单 agent 会报"29/29 全绿"收工；三镜头让矛盾浮出，逼出真问题 D1（绿依赖环境）、D2（CI 无 gate）。**验证多样性 > 验证冗余**——三镜头用了不同 lens（真值/边界/真跑），不是三个一样的复读。
3. **harness 不取多数票、亲自裁决** = 关键。2 pass vs 1 fail，若投票则误判 tests-real 为噪声；亲跑才发现它的 fail 是诚实的"我验不了"，而绿是真的但有环境前提。**这正是 review_verdict 原则：结果不能自称完成。**
4. **成本**：~220k tok / 10.5min 换一个 Phase 的纯逻辑 + 三重验证 + 一份可追溯 episode。Ultracode 下可接受。

**暴露的方法论缺口（反哺 harness）：**

- **"环境口径"应进 Intent Contract**：D1 说明 sandbox/CI/测试运行环境本身是一种需要 prior 说清的口径，否则"绿不绿"无定论。这是 plan-episode `intent_contract` 该加的字段（如 `verification_env`）。
- **gate 与 CI 的真实性要核**：D2 说明 plan 写的 gate 可能并不存在于 CI。harness 在 grounding 阶段除了核 plan↔代码，还应核 **plan↔CI**。

**下一步候选（待你定，不自行扩范围）**：① ratify D3 两条口径；② Phase 2（provider + LLM 契约，用 Jarvis API 实验）开第二个 workflow；③ 先把 D1/D2 的"环境口径"补回 byok-plan-v2 §0/§7。

---

## Episode #2 — byok-tree-capability（树/子任务能力探索性实测）

`episode_type: code+probe`｜锚：workflow `byok-tree-capability`（2 agents，~98k tok，~3.6min）｜触发：人工提问「子任务/树结构 LLM 能做到吗」

这是 **Phase 2 LLM 契约的探索性首测**（研究性质，非正式 gate）。两层都**真跑**：schema 层真 apply-core，LLM 层真 Qwen3.5-27B（ModelScope，Jarvis 同款 key，未回显）。

### 结论：取决于"父任务是否已存在"

| 能力 | schema 层 | LLM 层（Qwen3.5 真测） |
|---|---|---|
| 给**已存在**任务加子任务 | ✅ plan | ✅ R1 完美（resolve 「项目A」→t-proj） |
| 移动/重挂已存在子任务 | ✅ plan | ✅ R2 完美（选了 update_task 而非 delete+add） |
| 拆分已存在任务为子任务 | ✅ plan | ✅ R4 完美 |
| 删子树（级联） | ✅ 4/3 | —（Episode #1 已验） |
| **一次性建新多层树** | ❌ UNKNOWN_PARENT_ID | ❌ **见下，最危险** |

### ★ 关键发现：新树不是"干净报错",是"静默错挂"

schema 层：新父在同批里没有 id，子 op 的 parentId（无论引用标题还是 tmp-id）都不在冻结的 `taskIds`（apply-core.ts:131）里 → fail-fast `UNKNOWN_PARENT_ID`。

LLM 层（R3「新建项目上线，下面加三个子任务」）：模型**没**报错、**没**瞎编 id、**没**省略 parentId——它把三个新子任务**静默挂到了最近的已存在项目 t-proj（项目A）**上。结果:`上线` 建成空壳,`部署/回归测试/发公告` 挂错到 `项目A`。**因为 t-proj 真实存在,UNKNOWN_PARENT_ID 不触发,所有护栏放行 → 一个结构合法、语义错误的 plan 静默通过。**

→ 这是 plausible-but-wrong 存活验证的活样本（正是对抗验证存在的理由）。**限制不是 schema-only——表征缺口(无批内引用)会主动把一个有能力的模型带偏成错结果。**

### 由此长出的真实设计要求（喂回 plan）

| # | 要求 | 来源 |
|---|---|---|
| T1 | schema 加**批内引用**(add_task 带 tempId/ref,planOps 解析)或顺序 apply 回灌真 id;且 `store.addTask` 需回传/接收 id | 新树静默错挂 |
| T2 | **diff 预览必须显示父任务名字**(不只 parentId)——R3 那种错挂,人唯一能拦下的地方就是 diff;现有 io-contract 渲染只显示"子任务"不显示挂到谁，看不出错 | HIL 是最后防线 |
| T3 | **加 cycle/depth 守护**：re-parent 无环检测,把父挪到自己子孙下会成环;apply-core 只查 parentId 存在 | schema 探针 |
| T4（正向） | **function-calling 对 ModelScope 网关可用**,模型能 resolve 已存在 id、选对 op、吐最小 partial update | LLM 探针 toolCallingWorked=true |

### harness 评估（第 2 次）

- **真测 > 推断,再次验证**:我派活前的判断("已有树✅/新树❌因 id 问题")方向对,但**漏了最危险的一面**——我以为新树会"干净报错",真测才发现 LLM 会**静默错挂**。光推断会把"做不到"当成"安全的做不到",真跑才暴露"不安全的做错"。
- **探索性 probe 的价值**:97k tok / 3.6min 换到一个会上线伤数据的静默 bug 的提前定位 + function-calling 可用性确认。值。
- **方法论**:plausible-but-wrong 不只出现在"验证 agent 的发现",也出现在"被构建功能本身的输出"——HIL diff 必须能让人看见语义,不只结构。
