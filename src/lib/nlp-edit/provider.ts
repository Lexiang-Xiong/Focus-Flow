// src/lib/nlp-edit/provider.ts
// BYOK NLP 编辑的【LLM 契约层】：自然语言 + 当前任务快照 → OpenAI 兼容 function-calling
// → 经 schema 约束的 ops（喂给 apply-core.planOps）。
//
// 边界规则（byok-plan-v2 §4）：
//   - 本文件是【唯一】允许触网的模块，且 fetch 必须【可注入】（fetchFn）——否则不可单测。
//   - 不碰 fs / sql / store；LLM 输出仅限 schema 约束的 op。
//   - apply-core / schema 保持纯；本文件只构造请求 + 解析响应，校验落地仍归 apply-core / wiring。
//   - 凭据（key）只从 localStorage['byok_v1'] 读，【绝不】写日志 / 错误信息 / 提交入仓。
//
// 凭据来源：浏览器 localStorage['byok_v1'] = JSON { provider, base, key, model }，
//          base 形如 https://.../v1，OpenAI 兼容 /chat/completions，鉴权 Authorization: Bearer <key>。

import type { Zone } from '@/types';
import type { EditOp } from './schema';
import { EDIT_OPS_FUNCTION, EDIT_OPS_TOOL_NAME, PRIORITY_VALUES, DEADLINE_TYPE_VALUES } from './schema';
import type { Snapshot } from './apply-core';

// ============ 配置（来自 localStorage['byok_v1']） ============

export const BYOK_STORAGE_KEY = 'byok_v1';

export interface ByokConfig {
  provider?: string;
  base: string; // 形如 https://.../v1
  key: string;
  model: string;
}

export type ConfigResult =
  | { ok: true; config: ByokConfig }
  | { ok: false; code: 'NOT_CONFIGURED' | 'BAD_CONFIG'; message: string };

// 只读接口，便于单测注入假 storage；真实运行用 window.localStorage。
type ReadableStorage = Pick<Storage, 'getItem'>;

function defaultStorage(): ReadableStorage | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

/**
 * 从 localStorage['byok_v1'] 读取并校验 BYOK 配置。
 * 缺失 → NOT_CONFIGURED（提示用户去填）；格式错 / 缺字段 → BAD_CONFIG。
 * 【绝不】把 key 写进任何返回的 message。
 */
export function readByokConfig(storage: ReadableStorage | undefined = defaultStorage()): ConfigResult {
  if (!storage) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'localStorage 不可用（非浏览器环境？）' };
  }
  const raw = storage.getItem(BYOK_STORAGE_KEY);
  if (!raw) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: `未找到 localStorage['${BYOK_STORAGE_KEY}']，请先填入 BYOK 配置。`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'BAD_CONFIG', message: `localStorage['${BYOK_STORAGE_KEY}'] 不是合法 JSON。` };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, code: 'BAD_CONFIG', message: `byok_v1 不是对象。` };
  }
  const c = parsed as Record<string, unknown>;
  const base = typeof c.base === 'string' ? c.base.trim() : '';
  const key = typeof c.key === 'string' ? c.key.trim() : '';
  const model = typeof c.model === 'string' ? c.model.trim() : '';
  const missing = ([['base', base], ['key', key], ['model', model]] as const)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    // 注意：只报缺哪个字段名，不回显任何值（尤其 key）。
    return { ok: false, code: 'BAD_CONFIG', message: `byok_v1 缺少字段：${missing.join(', ')}。` };
  }
  return {
    ok: true,
    config: { provider: typeof c.provider === 'string' ? c.provider : undefined, base, key, model },
  };
}

// ============ 请求构造（纯函数，可单测） ============

function zoneLabel(z: Zone): string {
  return z.name ?? z.nameKey ?? z.id;
}

// 快照摘要里最多列出的任务条数（防超大工作区把 prompt 撑爆 / 超上下文）。
export const TASK_SUMMARY_CAP = 300;

/** 把当前快照压成 LLM 可读的分区 + 任务树文本，让模型能引用真实 id、且看清既有结构（防错挂）。 */
export function summarizeSnapshot(snapshot: Snapshot): string {
  const lines: string[] = [];
  lines.push('【现有分区 zones】');
  if (snapshot.zones.length === 0) {
    lines.push('（暂无分区）');
  } else {
    for (const z of snapshot.zones) lines.push(`- ${z.id} = "${zoneLabel(z)}"`);
  }
  lines.push('【现有任务 tasks（缩进 = 父子层级，[id] 为真实任务 id）】');
  if (snapshot.tasks.length === 0) {
    lines.push('（暂无任务）');
    return lines.join('\n');
  }
  const byParent = new Map<string | null, typeof snapshot.tasks>();
  for (const t of snapshot.tasks) {
    const k = t.parentId ?? null;
    const arr = byParent.get(k);
    if (arr) arr.push(t);
    else byParent.set(k, [t]);
  }
  // 上限护栏：超大工作区不让 prompt 无界膨胀；截断后明确告诉模型不要引用未列出的任务。
  let rendered = 0;
  let truncated = false;
  const walk = (parentId: string | null, depth: number): void => {
    const children = [...(byParent.get(parentId) ?? [])].sort((a, b) => a.order - b.order);
    for (const t of children) {
      if (rendered >= TASK_SUMMARY_CAP) {
        truncated = true;
        return;
      }
      const zoneTag = depth === 0 ? ` (zone ${t.zoneId})` : '';
      lines.push(`${'  '.repeat(depth)}- [${t.id}] "${t.title}"${zoneTag}`);
      rendered++;
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  if (truncated) {
    lines.push(`…（任务过多，仅列出前 ${TASK_SUMMARY_CAP} 个；请勿引用未列出的任务 id）`);
  }
  return lines.join('\n');
}

/**
 * 系统提示词：这是防 Episode#2「静默错挂」的关键杠杆——明确教会模型用 tempId 批内引用建新树，
 * 而不是把新子任务挂到最近的某个已存在任务上。
 */
export function buildSystemPrompt(snapshot: Snapshot, now: number): string {
  const today = new Date(now);
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  const hasZones = snapshot.zones.length > 0;
  const defaultZoneId = snapshot.zones[0]?.id ?? '（无可用分区）';
  const rule1 = hasZones
    ? `1. zoneId 必须是上面列出的真实分区 id。用户没指定分区时，默认用第一个分区：${defaultZoneId}。`
    : '1. 当前没有任何分区，而 add_task 需要 zoneId → 不要输出 add_task；只能 update_task / delete_task 现有任务。';
  return [
    '你是任务管理应用 Focus-Flow 的编辑助手。把用户的自然语言请求翻译成一组结构化的任务编辑操作，',
    `并且【只能】通过调用工具 ${EDIT_OPS_TOOL_NAME} 输出，不要用普通文本回答。`,
    '',
    `今天的日期是 ${dateStr}（用于推断 deadline / deadlineType，如「今天/明天/本周」）。`,
    '',
    summarizeSnapshot(snapshot),
    '',
    '【硬性规则】',
    rule1,
    '2. parentId / 要更新或删除的 id，必须是上面列出的真实任务 id，或你在【同一批】里更早用 tempId 新建的任务。绝不要编造 id。',
    '3. ★ 建【新的多层任务树】（新父任务 + 它的新子任务，二者当前都还不存在）时：',
    '   先用 add_task 创建父任务并给它一个 tempId（如 "t1"），',
    '   再用 add_task 创建每个子任务、把它的 parentId 设为那个 tempId。',
    '   【严禁】把新子任务挂到某个无关的已存在任务下——那会造成数据错挂。',
    '4. 给【已存在】的任务加子任务时，子任务的 parentId 用那个已存在任务的真实 [id]。',
    '5. 若用户描述的父任务在上面列表里找不到，应当【新建】它（用 tempId），而不是硬塞到某个现有任务下。',
    `6. priority 只能取：${PRIORITY_VALUES.join(' / ')}；deadlineType 只能取：${DEADLINE_TYPE_VALUES.join(' / ')}。`,
    '7. 只输出与用户请求相关的最小操作集，不要顺手改其它任务。',
    '',
    '【建新树示例】用户：「加个『上线』任务，下面有部署、回归测试两步」→',
    '  add_task{ title:"上线", tempId:"t1", zoneId:"<某真实分区>" }',
    '  add_task{ title:"部署", parentId:"t1", zoneId:"<同上>" }',
    '  add_task{ title:"回归测试", parentId:"t1", zoneId:"<同上>" }',
  ].join('\n');
}

export interface ChatRequestBody {
  model: string;
  messages: { role: 'system' | 'user'; content: string }[];
  tools: { type: 'function'; function: typeof EDIT_OPS_FUNCTION }[];
  tool_choice: { type: 'function'; function: { name: string } };
  temperature: number;
}

/** 构造 OpenAI 兼容 /chat/completions 的请求体（强制单工具调用）。纯函数。 */
export function buildRequestBody(config: ByokConfig, userText: string, snapshot: Snapshot, now: number): ChatRequestBody {
  return {
    model: config.model,
    messages: [
      { role: 'system', content: buildSystemPrompt(snapshot, now) },
      { role: 'user', content: userText },
    ],
    tools: [{ type: 'function', function: EDIT_OPS_FUNCTION }],
    tool_choice: { type: 'function', function: { name: EDIT_OPS_TOOL_NAME } },
    temperature: 0,
  };
}

/** 拼出 chat/completions 端点（容忍 base 结尾是否带斜杠）。 */
export function chatCompletionsUrl(base: string): string {
  return `${base.replace(/\/+$/, '')}/chat/completions`;
}

// ============ Provider（注入 fetch / storage / now / endpoint，可单测） ============

export type ProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'BAD_CONFIG'
  | 'NETWORK'
  | 'HTTP_ERROR'
  | 'BAD_RESPONSE' // 200 但响应体不是合法 JSON（HTML 错误页 / 流式 SSE）：传输层问题，区别于 tool-args 解析
  | 'NO_TOOL_CALL'
  | 'BAD_TOOL_ARGS';

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  status?: number;
}

export type RequestOpsResult =
  | { kind: 'ops'; ops: EditOp[]; rawArguments: string }
  | { kind: 'error'; error: ProviderError };

export interface CreateProviderOptions {
  /** 可注入的 fetch（单测喂 mock；真实运行传 window.fetch 或 Tauri/代理适配版）。默认全局 fetch。 */
  fetchFn?: typeof fetch;
  /** 可注入的只读 storage；默认 window.localStorage。 */
  storage?: ReadableStorage;
  /** 可注入的当前时间（毫秒），用于日期上下文；默认 Date.now。 */
  now?: () => number;
  /**
   * 端点解析钩子：给定规范 base，返回实际要打的 url + 额外请求头。
   * 默认直连 `${base}/chat/completions`；浏览器 dev 适配器据此把请求改写到本地代理以绕过 CORS。
   */
  resolveEndpoint?: (base: string) => { url: string; headers?: Record<string, string> };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export interface NlpProvider {
  readConfig: () => ConfigResult;
  requestOps: (userText: string, snapshot: Snapshot) => Promise<RequestOpsResult>;
}

export function createProvider(opts: CreateProviderOptions = {}): NlpProvider {
  const fetchFn = opts.fetchFn ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);
  const nowFn = opts.now ?? (() => Date.now());
  const resolveEndpoint: NonNullable<CreateProviderOptions['resolveEndpoint']> =
    opts.resolveEndpoint ?? ((base) => ({ url: chatCompletionsUrl(base) }));

  const readConfig = () => readByokConfig(opts.storage);

  const requestOps = async (userText: string, snapshot: Snapshot): Promise<RequestOpsResult> => {
    const cfg = readConfig();
    if (!cfg.ok) {
      return { kind: 'error', error: { code: cfg.code, message: cfg.message } };
    }
    if (!fetchFn) {
      return { kind: 'error', error: { code: 'NETWORK', message: 'fetch 不可用（无注入且无全局 fetch）。' } };
    }
    const { config } = cfg;
    // 凭据脱敏：任何要回流进 error.message 的外部文本，先抹掉 key（防网关把 Authorization 反射进错误体）。
    const redact = (s: string): string => (config.key ? s.split(config.key).join('[REDACTED]') : s);
    const body = buildRequestBody(config, userText, snapshot, nowFn());
    const ep = resolveEndpoint(config.base);

    let res: Response;
    try {
      res = await fetchFn(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ep.headers ?? {}),
          // Authorization 放最后：唯一用到 key 的地方，且不可被 resolveEndpoint 的 header 覆盖；绝不进日志/错误信息。
          Authorization: `Bearer ${config.key}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return {
        kind: 'error',
        error: { code: 'NETWORK', message: redact(`网络请求失败：${e instanceof Error ? e.message : String(e)}`) },
      };
    }

    if (!res.ok) {
      let detail = '';
      try {
        detail = redact(truncate(await res.text(), 300));
      } catch {
        /* 忽略读 body 失败 */
      }
      return {
        kind: 'error',
        error: { code: 'HTTP_ERROR', message: `网关返回 ${res.status}${detail ? `：${detail}` : ''}`, status: res.status },
      };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return {
        kind: 'error',
        error: { code: 'BAD_RESPONSE', message: '网关响应不是合法 JSON（可能是 HTML 错误页或流式响应）。' },
      };
    }

    const msg = (data as { choices?: { message?: Record<string, unknown> }[] })?.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls as
      | { function?: { name?: string; arguments?: unknown } }[]
      | undefined;

    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      const content = typeof msg?.content === 'string' ? msg.content : '';
      return {
        kind: 'error',
        error: {
          code: 'NO_TOOL_CALL',
          message: `模型没有调用编辑工具${content ? `，而是回了文本：${redact(truncate(content, 300))}` : '（也没有返回内容）'}。`,
        },
      };
    }

    // 只认调用了本工具的 call，并【聚合】所有这类 call 的 ops（防网关把 ops 拆到多个 call 里静默丢失）。
    const editCalls = toolCalls.filter((c) => c?.function?.name === EDIT_OPS_TOOL_NAME);
    if (editCalls.length === 0) {
      const names = toolCalls.map((c) => c?.function?.name).filter(Boolean).join(', ');
      return {
        kind: 'error',
        error: { code: 'NO_TOOL_CALL', message: `模型调用了其它工具${names ? `：${names}` : ''}，未调用编辑工具。` },
      };
    }

    const allOps: unknown[] = [];
    const rawParts: string[] = [];
    for (const c of editCalls) {
      const argRaw = c.function?.arguments;
      let argObj: unknown;
      if (typeof argRaw === 'string') {
        try {
          argObj = JSON.parse(argRaw);
        } catch {
          return { kind: 'error', error: { code: 'BAD_TOOL_ARGS', message: 'tool_call.arguments 不是合法 JSON。' } };
        }
        rawParts.push(argRaw);
      } else if (argRaw !== null && typeof argRaw === 'object') {
        // 部分 OpenAI 兼容网关（Ollama /v1、部分 vLLM / LiteLLM）直接给已解析的对象，而非 JSON 字符串。
        argObj = argRaw;
        rawParts.push(JSON.stringify(argRaw));
      } else {
        return { kind: 'error', error: { code: 'BAD_TOOL_ARGS', message: 'tool_call.arguments 缺失。' } };
      }
      const ops = (argObj as { ops?: unknown })?.ops;
      if (!Array.isArray(ops)) {
        return { kind: 'error', error: { code: 'BAD_TOOL_ARGS', message: '返回缺少 ops 数组。' } };
      }
      allOps.push(...ops);
    }

    // ⚠ 这些 ops 是【未校验】的 LLM 原始输出，仅保证是数组。调用方【必须】先经 apply-core.planOps
    //   校验，才能落地 store —— 不要绕过 planOps 直接改库（绕过 = 绕掉全部 schema 护栏）。
    return { kind: 'ops', ops: allOps as EditOp[], rawArguments: rawParts.join('\n') };
  };

  return { readConfig, requestOps };
}
