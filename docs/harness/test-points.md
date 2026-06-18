# Focus-Flow · BYOK NLP 编辑 — 测试点账本（Test-Point Ledger）

> 人拥有的、活的账本（方法论见 Obsidian「Development Workflow Harness · 测试点账本」）。
> 每条 = 人在开发全程提出的一个验收点 / hard case / 需求。**强制流向 test + report + 架构边界**；known-gap 三处可见。
> 状态：`covered-now` / `deferred-phaseN` / `known-gap` / `won't-do`。
> 闭环对账：验收阶段每条必须是 covered 或明确 won't-do，不许 deferred 被忘掉。

| ID | 测试点 | 来源 | 状态 | → test | → report | → 架构边界 |
|---|---|---|---|---|---|---|
| TP1 | 验收证据 = 真 LLM→todo 三态截图（非 mock），针对新功能 | 受众/证据讨论 | `deferred-Phase4` | Phase4 真 LLM 截图 | byok-plan-v2 §7/§8 | — |
| TP2 | 人类报告 = HTML + 实测截图 | 报告格式讨论 | `covered-now`（HTML）/ 截图 `deferred-Phase3/4` | — | phase1-nlp-core.html | — |
| TP3 | mock 只做 gate；集成证据必须真跑 | mock-vs-real 争论 | `covered-now`（原则）；真 LLM 证据 `deferred-Phase4` | Phase4 | §7 两层 | — |
| TP4 | 报告受众 = 我自己（非上游 maintainer） | 受众纠偏 | `covered-now` | — | phase1-nlp-core §0 受众 / §8 | — |
| TP5 | 验证环境口径（sandbox / CI 测试在哪算数） | Episode#1 D1/D2 | `known-gap` | CI 当前**无** vitest 步 | byok-plan-v2 §7 待补 verification_env | — |
| TP6 | 子任务 / 移动 / 删子树（父**已存在**） | 树提问 | `covered-now` | apply-core.test（happy + 护栏，已有） | — | phase1-io-contract 协议层 |
| TP7 | 一次性建**新多层树**（新父 + 新子） | Episode#2 | `known-gap` | apply-core.test 新增「已知缺口」块（钉当前 UNKNOWN_PARENT_ID）+ `it.todo` T1 | phase1-nlp-core 已知限制 | phase1-io-contract 边界缺口 |
| TP8 | diff 预览**必须显父任务名**（防静默错挂） | Episode#2 T2 | `known-gap`（**必做，与建树无关**） | `it.todo` T2 | phase1-nlp-core 已知限制 | phase1-io-contract 边界缺口 |
| TP9 | re-parent **环 / 深度守护** | Episode#2 T3 | `known-gap` | `it.todo` T3 | — | phase1-io-contract 边界缺口 |

## 闭环说明

- **TP7/TP8/TP9** 是本轮 worked-example：已在 test（known-gap 块 + todo）、report（已知限制）、架构边界（io-contract 缺口标注）三处落地，作为「人指定测试点 → 三处可见」的可复制样板。
- **TP8 最优先**：无论建新树这条做不做，diff 显父名都得做——它是防 LLM 静默错挂（把新子任务挂到错父、护栏放行）的最后防线。
- **TP5** 待并入 byok-plan-v2 §0/§7（verification_env 口径）。
- 新测试点随人追问继续往表里加。
