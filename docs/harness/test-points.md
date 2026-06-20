# Focus-Flow · BYOK NLP 编辑 — 测试点账本（Test-Point Ledger）

> 人拥有的、活的账本（方法论见 Obsidian「Development Workflow Harness · 测试点账本」）。
> 每条 = 人在开发全程提出的一个验收点 / hard case / 需求。**强制流向 test + report + 架构边界**；known-gap 三处可见。
> 状态：`covered-now` / `deferred-phaseN` / `known-gap` / `won't-do`。
> 闭环对账：验收阶段每条必须是 covered 或明确 won't-do，不许 deferred 被忘掉。

| ID | 测试点 | 来源 | 状态 | → test | → report | → 架构边界 |
|---|---|---|---|---|---|---|
| TP1 | 验收证据 = 真 LLM→todo 三态截图（非 mock），针对新功能 | 受众/证据讨论 | `pending-run`（工具就绪：dev@8088 + Wand2 入口；待用户用自己 key 真跑截图） | Phase4 真 LLM 截图 | byok-plan-v2 §7/§8 / phase2-3 报告 | — |
| TP2 | 人类报告 = HTML + 实测截图 | 报告格式讨论 | `covered-now`（HTML×2）/ 截图 `pending-run` | — | phase1-nlp-core.html / phase2-3-nlp-edit.html | — |
| TP3 | mock 只做 gate；集成证据必须真跑 | mock-vs-real 争论 | `covered-now`（gate + **真 LLM ops 证据已真跑**：MiMo V2.5 中国区，建新树无错挂）；UI 截图 `pending-run` | provider.test（mock 罐头）+ nlp-smoke（真打 MiMo V2.5，skip 不进 CI） | §7 两层 / phase4-real-llm-evidence.md | — |
| TP4 | 报告受众 = 我自己（非上游 maintainer） | 受众纠偏 | `covered-now` | — | 各 delivery 报告 §0 受众 | — |
| TP5 | 验证环境口径（sandbox / CI 测试在哪算数） | Episode#1 D1/D2 | `covered-now` | CI `test` job（push/PR 跑 vitest run），发版仍只在 v* tag | byok-plan-v2 §7 verification_env | .github/workflows/build.yml |
| TP6 | 子任务 / 移动 / 删子树（父**已存在**） | 树提问 | `covered-now` | apply-core.test（happy + 护栏） | — | phase1-io-contract 协议层 |
| TP7 | 一次性建**新多层树**（新父 + 新子）+ **app 落地** | Episode#2 / 人工 ratify | `covered-now`（核心层 + **wiring**） | apply-core.test「建新树 tempId」+ **taskSlice.test「applyNlpActions」**（单步撤销 + tempId→真 id） | phase2-3-nlp-edit 报告 | phase1-io-contract 协议层 |
| TP8 | diff 预览**必须显父任务名**（防静默错挂） | Episode#2 T2 | `covered-now`（add **+ update re-parent**） | apply-core.test（parentLabel：add+update）+ **NlpEditDialog.test**（预览显父名） | phase1-nlp-core / phase2-3 | phase1-io-contract |
| TP9 | re-parent **环 / 深度守护** | Episode#2 T3 | `covered-now` | apply-core.test（CYCLE：自身/子孙 + 合法反例） | phase1-nlp-core | phase1-io-contract「成环」例 |
| TP10 | priority 与上游对齐（3→**5 级**）+ 单一真相源守护 | Episode#3 上游 v2.2.0 漂移 | `covered-now` | schema.test + **编译期完整性断言**；apply-core MALFORMED 枚举校验（add **+ update**） | byok-plan-v2 §6 | phase1-io-contract「枚举锁死」 |
| TP11 | BYOK **key 永不泄露**（§4 不变量：不进日志/错误信息/请求体/仓库） | Phase2 评审 keyleak lens | `covered-now` | provider.test 对抗 no-leak（脱敏 / 请求体不含 key / NETWORK / clobber 抵抗） | phase2-3 报告 Boundary | provider.ts（key 仅在 Authorization 头，末位写防覆盖） |
| TP12 | OpenAI 兼容网关**变体鲁棒**（arguments 对象 / 多 tool_call 聚合 / 非 JSON） | Phase2 评审 contract lens | `covered-now` | provider.test（对象 args / 聚合不丢 / NO_TOOL_CALL 带名 / BAD_RESPONSE） | phase2-3 报告 | provider.ts 解析层 |

## 闭环说明（Phase 2+3 后更新 · 2026-06-21）

- **TP7/TP8 全闭环**：核心层（add_task tempId 批内引用 + parentLabel）+ **app 落地 wiring** —— `taskSlice.applyNlpActions`：一次 saveSnapshot + 单 setState（**单步撤销**），把批内 tempId 解析成刚建的**真实父 id**。TP8 父名预览已从 add **扩到 update re-parent**（评审 spec lens 抓到的缺口：re-parent 错挂原先逃过父名防线）。core / store / UI 三层测试全绿。
- **TP3 两层就位**：gate = `provider.test` 的 mock 罐头响应断言（进 CI）；evidence = `nlp-smoke.test.ts` 真打 ModelScope 网关（`describe.skipIf(!BYOK_KEY)` → **不进 CI**）。真 LLM 三态截图（TP1/TP2 截图）= 浏览器侧待用户真跑（本机无浏览器驱动 + key 仅在用户 localStorage）。
- **TP11/TP12 新增（来自 Phase 2 对抗评审）**：5 lens（boundary/keyleak/contract/tests/spec）共 25 条 findings，已修真问题——key 脱敏 + Authorization 末位写防覆盖（TP11）；arguments 对象/多 call 聚合/NO_TOOL_CALL 带名/BAD_RESPONSE（TP12）；TP8 扩到 update；空分区 prompt 分支；快照 300 条上限。本批 +36 测试（apply-core/provider/store/UI）。
- **TP9/TP5 维持闭环**：TP9 = CYCLE 守护；TP5 = CI `test` job 为权威 gate，本地 sandbox 辅助。
- **known-gap（明确登记，未忘）**：① TP1 真 LLM 三态截图、② TP3 evidence 层真 run —— 工具均就绪（dev@8088 + Wand2 入口 + nlp-smoke），**仅差用户用自己的 key 真跑**；Phase 4 收口。
- 残留风险（非阻塞，已记 phase2-3 报告 Residual）：temperature:0 + 强制 tool_choice 对个别网关可能被拒；base 缺 `/v1` 仅弱提示；strict structured-output 与 schema 的 `oneOf` 不兼容（当前未启用，apply-core 兜底）。
- 新测试点随人追问 / 外部漂移 / 对抗评审继续入表；本批新增「评审 findings → 修复 + 测试 → 入账本」这一闭环来源。
