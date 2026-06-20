# Phase 4 · 真 LLM 证据（Episode#2 硬样本，真打网关）

> §7 证据层（evidence，不进 CI）。真 key + 真模型的真实「自然语言 → ops」运行，替代真人冒烟。
> 由 `src/lib/nlp-edit/nlp-smoke.test.ts` 跑出（`describe.skipIf(!BYOK_KEY)`，无 key 自动跳过）。
> 日期 2026-06-21。

## 运行配置（凭据从 env / gitignore 的 `.byok.local.json`，**不入仓**）

| 项 | 值 |
|---|---|
| Provider | Xiaomi MiMo（OpenAI 兼容 function-calling） |
| Base（Token Plan · **中国区集群**） | `https://token-plan-cn.xiaomimimo.com/v1` |
| Model | `mimo-v2.5-pro` |
| Key | `tp-…`（Token Plan key，只从 localStorage/env 读，已脱敏，**不记录**） |

> 端点排查（真测）：tp- key 打 **SGP**（`token-plan-sgp…`）→ `401 Invalid API Key`（token-plan key 是分区/分集群的）；切到**中国区** `token-plan-cn…` → 鉴权通过。

## 输入（具体版硬样本）

```
下午要干三件事：改PPT、写周报、回客户邮件；其中「写周报」下面有三个小点：收集数据、写初稿、改定稿。
```

快照里**故意放一个无关既有任务** `项目A`（id `t-proj`）作为「错挂诱饵」——Episode#2 里模型曾把新子任务静默挂到最近的既有任务上。

## 真模型吐出的 ops（原样）

```json
[
  { "op": "add_task", "zoneId": "z1", "title": "改PPT",   "deadlineType": "today", "tempId": "t1" },
  { "op": "add_task", "zoneId": "z1", "title": "写周报",   "deadlineType": "today", "tempId": "t2" },
  { "op": "add_task", "zoneId": "z1", "title": "收集数据", "parentId": "t2", "deadlineType": "today" },
  { "op": "add_task", "zoneId": "z1", "title": "写初稿",   "parentId": "t2", "deadlineType": "today" },
  { "op": "add_task", "zoneId": "z1", "title": "改定稿",   "parentId": "t2", "deadlineType": "today" },
  { "op": "add_task", "zoneId": "z1", "title": "回客户邮件","deadlineType": "today" }
]
```

## planOps 校验后的 diff（关键证据）

`写周报` 是**批内新建父**（tempId `t2`）；三个小点 `收集数据/写初稿/改定稿` 的 `parentLabel` 全是 **`新建:写周报`** —— 即挂在刚新建的「写周报」下，**没有**任何一个挂到既有诱饵 `项目A`。

```
diff.added:
  改PPT      parentLabel=null（顶级）
  写周报      parentLabel=null（顶级）
  收集数据    parentLabel="新建:写周报"   ← 挂到新建父，非 t-proj
  写初稿      parentLabel="新建:写周报"
  改定稿      parentLabel="新建:写周报"
  回客户邮件  parentLabel=null（顶级）
```

断言全过：`r.kind==='ops'`；无新增任务 `parentId==='t-proj'`（**不静默错挂**）；`added.length>=3`；存在 `parentLabel` 以「新建:」开头的项（**用 tempId 建新树**）。

## 真测抓到的两点（真模型行为，推断不出来）

1. **抽象版硬样本**（a.txt 原文「下午要干三件事，其中第二件下面有三个小点」，**未给具体任务名**）→ MiMo **没有瞎编、没有错挂**，而是返回文本**反问**「三件事分别是什么 / 三个小点是什么」。这是个**好的安全行为**；对话框走 `NO_TOOL_CALL` 分支，把模型的反问原样显示给用户去补充。
2. 由 1 可见 **MiMo 对强制 `tool_choice` 不是硬执行**（信息不足时会回文本而非被强制吐 tool_call）——正是评审 contract lens 预判的「部分兼容网关不强吃 forced tool_choice」。给**具体**输入后，模型正常调用工具、建树正确（上面的证据）。

## 仍待补：UI 三态截图

ops 层证据（本页）已闭环。剩 §7 头条的**真实 UI 三态截图**（①对话框输入 ②diff 预览含父名 ③落地后任务树）——需在浏览器 `localhost:8088`（byok_v1 设在该 origin）由人真跑截，本机无浏览器驱动 + key 仅在用户侧，故待用户补图填进 `phase1-nlp-core.html` / `phase2-3-nlp-edit.html` 的截图槽。
