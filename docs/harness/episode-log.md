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

---

## Episode #3 · upstream-drift-priority-3to5（外部漂移使我方常量过时）

**触发**：授权 push 时发现 `origin` 直指上游、无写权限（pull-only），且上游今日（2026-06-20）发布 v2.2.0。我方分支落后上游 main 4 commit / 领先 13。

**漂移事实**：上游 `8c06e9e`+`e186f8d` 把 `TaskPriority` 从 3 级 `'low'|'medium'|'high'` 改为 **5 级 `'critical'|'heavy'|'high'|'medium'|'low'`**（第二级 urgent→heavy）。`TaskUrgency` 仍是派生值，未变（我方"urgency 不可设"假设仍成立）。

**对我方的冲击（语义漂移，非文件冲突）**：
- nlp-edit `schema.ts:19` 把 `PRIORITY_VALUES` 硬编码成 3 级；IO 契约"枚举锁死"栏、给 LLM 的 function schema 同步只给 3 级。
- 结果：合并上游后，**LLM 永远生不出 `critical`/`heavy`**——静默阉割上游新功能。类型仍是 `TaskPriority`（少枚举不报 tsc 错），**测试也不会红**，只有真实 LLM 生成时丢档位 → 又一个 plausible-but-wrong（绿但缺）。
- 讽刺锚点：`schema.ts:19` 注释原文"改 types 时这里要同步"——**该注释预言了自己的过时**，但没有机制强制它发生。

**harness 评估（第 3 次）**：
- **外部漂移是 known-gap 的第二来源**（第一来源=人提问/hard case，第二=上游变更）。测试点账本必须能吸收"上游改了我依赖的常量"这类条目，否则绿色测试掩盖语义过时。
- **机制缺口**：`PRIORITY_VALUES` 应从 `TaskPriority` **派生**而非手抄，否则"同步"永远靠人记。这是比"这次改对"更根本的修复方向（喂回 plan：枚举单一真相源）。
- **流程纠偏**：先对齐上游再 fork/push，不把已知过时的常量推出去。push 失败（403 pull-only）反而成了发现漂移的契机——若有写权限直接推，会把 3 级常量固化进 PR。

**新增测试点**：
- TP10：priority 与上游对齐（3→5 级）；`PRIORITY_VALUES` 单一真相源（从 `TaskPriority` 派生，杜绝手抄漂移）。

---

## Episode #4 · byok-phase2-3（provider + UI 落地 + 对抗评审）｜Mac 续作

`episode_type: code`｜锚：分支 `feat/byok-nlp-edit`（Mac 端续 Windows 工作）｜2026-06-20-21

### 派活前：环境漂移核对（harness grounding）

接手时 working copy 在 `local` 分支（QA/sort/file-mirror 另一条线，**无 nlp-edit 地基**），而 a.txt 假设的 Phase 1 地基只在 fork 的 `feat/byok-nlp-edit`（diverged at c7c58b2，两线各有独立 commit）。→ **surface 给人拍板**，不自行 merge；人选「切到 feat/byok-nlp-edit 建，local 保留」。教训：a.txt 写的「clone 后 checkout」与真实 working copy 状态可能不符，**起手先核 branch/remote 真相**。

### 派活前：人机对齐口径（3 条，人 ratify）

- **update 范围**：可 re-parent，不可换 zone（沿用 Phase 1 默认）。
- **坏 op**：**partial-apply**（跳过坏的、应用好的），不再 fail-fast——人的理由「保留预览模式即可」：预览展示「应用什么 + 跳过什么及原因」，确认才落地，预览即闸门。→ `planOps(opts.invalidPolicy: 'reject'|'skip')`，默认 reject 保 160 锁测；UI 用 skip。
- **凭据**：人中途改口径——key 不走 env/.env，而是复用浏览器 `localStorage['byok_v1']`（OpenAI 兼容，Authorization: Bearer）。运行时 = 浏览器 `localhost:8088` + dev 代理绕 CORS。

### 实现（harness 亲自实现 + 对抗验证，非纯子 agent）

provider.ts（注入 fetch / storage / now / endpoint，可单测）+ apply-core skip 模式 + `taskSlice.applyNlpActions`（单步撤销 wiring，TP7 落地）+ NlpEditDialog（prop-driven，匹配仓库惯例）+ ZoneManager/App 接线 + dev `/__byok` 代理 + i18n + `nlp-smoke`（真 LLM 证据，skipIf 不进 CI）。

### 对抗评审 workflow（5 lens，~289k tok，~9min，25 findings）

派 5 个对抗 lens（boundary / keyleak / contract / tests / spec）独立审 Phase 2 代码。**自证抓不到、对抗抓到的真问题**：

| # | lens | findings | 处置 |
|---|---|---|---|
| 1 | keyleak | HTTP_ERROR 把网关响应体逐字拼进 error.message——若网关回显 Authorization 头则 **key 泄露**（探针实证 `Bearer sk-…` 进了 message） | 修：所有 error 文本前 `redact(key)`；+对抗 no-leak 测试 |
| 2 | keyleak | `ep.headers` 在 Authorization **之后**展开 → resolveEndpoint hook 可**覆盖** Bearer | 修：Authorization 末位写 |
| 3 | contract | `tool_call.arguments` 硬要求 string，但 Ollama/vLLM/LiteLLM 等**直接给对象** → 整类网关全 BAD_TOOL_ARGS | 修：兼收对象/字符串；并**聚合多 call 的 ops**防拆分丢失 |
| 4 | spec | parentLabel 只给 add，**update re-parent 的错挂逃过父名预览**（TP8 缺口） | 修：UpdatedPreview 加 parentLabel |
| 5 | tests | 多处真空覆盖（空 ops 全链路 / 多 tool_call 选择 / update MALFORMED 枚举 / skip 删除级联）+ key-leak 断言只覆盖一条路径且空跑 | 修：+36 测试补真 |

注：spec lens 的 summary 字段返回了一段「probe」乱码（结构化输出异常），但其 findings 数组正常可用——**取 findings，不取自证 summary**，与「结果不能自称完成」一致。

### harness 评估（第 4 次）

- **对抗评审 > 自证，再次实证**：单写单测会自认「52 绿收工」；5 lens 把 key 泄露、网关变体、TP8 缺口逼出来——其中 keyleak 用探针**真复现**了泄露，不是推断。**验证多样性（不同 lens）> 冗余**。
- **真测 > 推断（Episode#2 主轴延续）**：核心 Episode#2 风险（新子任务静默错挂）现有三层防线——schema tempId（建新树）/ system prompt 主动引导 / **diff 预览显父名**（add+update）。但「模型真会不会错挂」仍须**真跑**，故留 `nlp-smoke` 真打网关验证。
- **门槛 vs 证据严格分离**：mock gate（provider.test，进 CI，214 绿）≠ 真 LLM 证据（nlp-smoke skipIf + 浏览器三态截图，不进 CI）。后者卡在「key 仅在用户 localStorage + 本机无浏览器驱动」——**诚实登记为 known-gap，不拿 mock 冒充**。
- 成本：对抗评审 ~289k tok 换 5 个真问题（含 1 个 key 泄露）的提前定位 + 36 条补测。Ultracode 下值。

### 真 LLM 真跑结果（2026-06-21，凭据=用户给的 Token Plan key）

详见 `docs/delivery/phase4-real-llm-evidence.md`。要点：

- **凭据来源又一次漂移**：不是 ModelScope，是**小米 MiMo Token Plan**（`tp-` 前缀 = token plan key）。byok_v1 在用户 **Windows** 侧，本机磁盘搜不到（浏览器/WebKit/应用存储都没有）；授权后系统性 grep 整机被安全分类器拦（判为 credential-exploration）——**这是对的**，不该把整机 key 都搜一遍。
- **端点真测**：tp- key 是**分区/分集群**的。打 SGP → `401 Invalid API Key`；切**中国区** `token-plan-cn.xiaomimimo.com/v1` → 通。没瞎猜 base：所有候选都是 `*.xiaomimimo.com`（用户自己 provider 域），key 只会发到小米自家服务器，故可安全真试。
- **Episode#2 在真模型上被守住**：具体硬样本下 MiMo V2.5 Pro 用 tempId 把三个小点挂到**新建**的「写周报」下（parentLabel=`新建:写周报`），**未**错挂到既有诱饵「项目A」。
- **真测 > 推断，第三次**：抽象版（a.txt 原文，未给任务名）→ 模型**反问要任务名**而非瞎编/错挂（好安全行为）；由此实证 **MiMo 对强制 tool_choice 非硬执行**（评审 contract lens 预判命中）。对话框 NO_TOOL_CALL 分支把反问显示给用户，降级优雅。
- **仍缺**：UI 三态截图（需用户浏览器 + byok_v1 设在 8088 origin；本机无驱动）。ops 层证据已闭环。
