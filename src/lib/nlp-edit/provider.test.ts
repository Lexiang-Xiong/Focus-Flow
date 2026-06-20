import { describe, it, expect, vi } from 'vitest';
import {
  readByokConfig,
  summarizeSnapshot,
  buildSystemPrompt,
  buildRequestBody,
  chatCompletionsUrl,
  createProvider,
  BYOK_STORAGE_KEY,
} from './provider';
import { EDIT_OPS_TOOL_NAME } from './schema';
import { planOps, type Snapshot } from './apply-core';
import type { Task, Zone } from '@/types';

// ---- 构造器 ----
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id, zoneId: 'z1', parentId: null, isCollapsed: false, title: id, description: '',
    completed: false, priority: 'medium', urgency: 'low', deadline: null, deadlineType: 'none',
    order: 0, createdAt: 0, expanded: false, totalWorkTime: 0, ...over,
  };
}
function zone(id: string, over: Partial<Zone> = {}): Zone {
  return { id, color: '#fff', order: 0, createdAt: 0, ...over };
}
function memStorage(map: Record<string, string>): Pick<Storage, 'getItem'> {
  return { getItem: (k: string) => (k in map ? map[k] : null) };
}
const GOOD_CFG = JSON.stringify({ provider: 'modelscope', base: 'https://gw.example/v1', key: 'sk-SECRET-123', model: 'Qwen' });

// 假 Response（够 provider 用：ok/status/json/text）
function res(body: unknown, { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok, status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}
function toolCallRes(ops: unknown): Response {
  return res({
    choices: [{ message: { tool_calls: [{ function: { name: EDIT_OPS_TOOL_NAME, arguments: JSON.stringify({ ops }) } }] } }],
  });
}

const snap: Snapshot = { zones: [zone('z1', { name: '工作' })], tasks: [task('t-a', { title: '项目A' })] };

// ============ 配置读取 ============
describe('readByokConfig', () => {
  it('无 byok_v1 → NOT_CONFIGURED', () => {
    const r = readByokConfig(memStorage({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_CONFIGURED');
  });
  it('非法 JSON → BAD_CONFIG', () => {
    const r = readByokConfig(memStorage({ [BYOK_STORAGE_KEY]: '{not json' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BAD_CONFIG');
  });
  it('缺字段 → BAD_CONFIG，且 message 不含 key 值', () => {
    const r = readByokConfig(memStorage({ [BYOK_STORAGE_KEY]: JSON.stringify({ base: 'x', key: 'sk-SECRET' }) }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('BAD_CONFIG');
      expect(r.message).not.toContain('sk-SECRET');
    }
  });
  it('齐全 → ok + 解析 base/key/model', () => {
    const r = readByokConfig(memStorage({ [BYOK_STORAGE_KEY]: GOOD_CFG }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config).toMatchObject({ base: 'https://gw.example/v1', key: 'sk-SECRET-123', model: 'Qwen' });
  });
});

// ============ 纯构造 ============
describe('请求构造（纯函数）', () => {
  it('summarizeSnapshot 含分区与任务真实 id', () => {
    const s = summarizeSnapshot(snap);
    expect(s).toContain('z1');
    expect(s).toContain('[t-a]');
    expect(s).toContain('项目A');
  });
  it('systemPrompt 含 tempId 建新树规则 + 注入日期', () => {
    const p = buildSystemPrompt(snap, Date.UTC(2026, 5, 20));
    expect(p).toContain('tempId');
    expect(p).toContain('2026-06-20');
    expect(p).toMatch(/严禁|无关/); // 防错挂措辞
  });
  it('buildRequestBody 强制单工具调用 + 锁 model + temperature 0', () => {
    const r = readByokConfig(memStorage({ [BYOK_STORAGE_KEY]: GOOD_CFG }));
    if (!r.ok) throw new Error('cfg');
    const body = buildRequestBody(r.config, '加个任务', snap, 0);
    expect(body.model).toBe('Qwen');
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: EDIT_OPS_TOOL_NAME } });
    expect(body.tools[0].function.name).toBe(EDIT_OPS_TOOL_NAME);
    expect(body.temperature).toBe(0);
  });
  it('chatCompletionsUrl 容忍 base 尾斜杠', () => {
    expect(chatCompletionsUrl('https://x/v1')).toBe('https://x/v1/chat/completions');
    expect(chatCompletionsUrl('https://x/v1/')).toBe('https://x/v1/chat/completions');
  });
});

// ============ requestOps（注入 mock fetch） ============
describe('createProvider.requestOps（mock 网关）', () => {
  const storage = memStorage({ [BYOK_STORAGE_KEY]: GOOD_CFG });

  it('未配置 → error NOT_CONFIGURED（不触网）', async () => {
    const fetchFn = vi.fn();
    const p = createProvider({ storage: memStorage({}), fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('NOT_CONFIGURED');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('happy：tool_call.arguments → ops，且喂 planOps 能建新树（gate 全链路）', async () => {
    const ops = [
      { op: 'add_task', zoneId: 'z1', title: '上线', tempId: 't1' },
      { op: 'add_task', zoneId: 'z1', title: '部署', parentId: 't1' },
    ];
    const fetchFn = vi.fn(async () => toolCallRes(ops));
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('加上线，下面有部署', snap);
    expect(r.kind).toBe('ops');
    if (r.kind !== 'ops') return;
    const plan = planOps(snap, r.ops, { invalidPolicy: 'skip' });
    expect(plan.kind).toBe('plan');
    if (plan.kind !== 'plan') return;
    const child = plan.diff.added.find((a) => a.title === '部署');
    expect(child?.parentLabel).toBe('新建:上线'); // 解析 → 校验 → diff 父名，全链路对
  });

  it('注入 resolveEndpoint → 请求改写到代理 url + 带 x-byok-base，且 Authorization 携带 key', async () => {
    const ops: unknown[] = [];
    const fetchFn = vi.fn(async () => toolCallRes(ops));
    const p = createProvider({
      storage,
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveEndpoint: (base) => ({ url: '/__byok/v1/chat/completions', headers: { 'x-byok-base': base } }),
    });
    await p.requestOps('x', snap);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/__byok/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-byok-base']).toBe('https://gw.example/v1');
    expect(headers.Authorization).toBe('Bearer sk-SECRET-123');
  });

  it('模型没调工具（只回文本）→ NO_TOOL_CALL（带回文本供人看）', async () => {
    const fetchFn = vi.fn(async () => res({ choices: [{ message: { content: '你是指哪个项目？' } }] }));
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('模糊请求', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('NO_TOOL_CALL');
      expect(r.error.message).toContain('哪个项目');
    }
  });

  it('HTTP 401 → HTTP_ERROR（带 status），且【绝不泄露 key】', async () => {
    const fetchFn = vi.fn(async () => res('invalid api key', { ok: false, status: 401 }));
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('HTTP_ERROR');
      expect(r.error.status).toBe(401);
      expect(r.error.message).not.toContain('sk-SECRET-123'); // key 安全：错误信息不含凭据
    }
  });

  it('fetch 抛错 → NETWORK', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('NETWORK');
  });

  it('arguments 非合法 JSON → BAD_TOOL_ARGS', async () => {
    const fetchFn = vi.fn(async () =>
      res({ choices: [{ message: { tool_calls: [{ function: { name: EDIT_OPS_TOOL_NAME, arguments: '{bad' } }] } }] }),
    );
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('BAD_TOOL_ARGS');
  });

  it('缺 ops 数组 → BAD_TOOL_ARGS', async () => {
    const fetchFn = vi.fn(async () =>
      res({ choices: [{ message: { tool_calls: [{ function: { name: EDIT_OPS_TOOL_NAME, arguments: '{"nope":1}' } }] } }] }),
    );
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('BAD_TOOL_ARGS');
  });
});

// ============ 评审补强：网关变体 + 凭据安全（§4 不变量） ============
describe('createProvider · 网关变体 + 凭据安全', () => {
  const storage = memStorage({ [BYOK_STORAGE_KEY]: GOOD_CFG });

  it('arguments 为【对象】而非字符串 → 正常解析（Ollama/vLLM/LiteLLM 等）', async () => {
    const fetchFn = vi.fn(async () =>
      res({ choices: [{ message: { tool_calls: [{ function: { name: EDIT_OPS_TOOL_NAME, arguments: { ops: [{ op: 'add_task', zoneId: 'z1', title: 'x' }] } } }] } }] }),
    );
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('ops');
    if (r.kind === 'ops') expect(r.ops).toHaveLength(1);
  });

  it('多个 tool_call、编辑工具不在首位 → 按名选中、聚合其 ops', async () => {
    const fetchFn = vi.fn(async () =>
      res({ choices: [{ message: { tool_calls: [
        { function: { name: 'some_other_tool', arguments: '{"foo":1}' } },
        { function: { name: EDIT_OPS_TOOL_NAME, arguments: JSON.stringify({ ops: [{ op: 'add_task', zoneId: 'z1', title: '被选中' }] }) } },
      ] } }] }),
    );
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('ops');
    if (r.kind === 'ops') {
      expect(r.ops).toHaveLength(1);
      expect((r.ops[0] as { title: string }).title).toBe('被选中');
    }
  });

  it('ops 被拆到多个编辑 tool_call → 聚合不丢', async () => {
    const fetchFn = vi.fn(async () =>
      res({ choices: [{ message: { tool_calls: [
        { function: { name: EDIT_OPS_TOOL_NAME, arguments: JSON.stringify({ ops: [{ op: 'add_task', zoneId: 'z1', title: 'A' }] }) } },
        { function: { name: EDIT_OPS_TOOL_NAME, arguments: JSON.stringify({ ops: [{ op: 'add_task', zoneId: 'z1', title: 'B' }] }) } },
      ] } }] }),
    );
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('ops');
    if (r.kind === 'ops') expect(r.ops).toHaveLength(2);
  });

  it('只调用了别的工具（无编辑工具）→ NO_TOOL_CALL（带工具名）', async () => {
    const fetchFn = vi.fn(async () =>
      res({ choices: [{ message: { tool_calls: [{ function: { name: 'web_search', arguments: '{}' } }] } }] }),
    );
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('NO_TOOL_CALL');
      expect(r.error.message).toContain('web_search');
    }
  });

  it('空 ops 全链路 → kind:ops ops:[] → planOps noop', async () => {
    const fetchFn = vi.fn(async () => toolCallRes([]));
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('ops');
    if (r.kind !== 'ops') return;
    expect(r.ops).toEqual([]);
    expect(planOps(snap, r.ops, { invalidPolicy: 'skip' }).kind).toBe('noop');
  });

  it('非 JSON 200（HTML/流）→ BAD_RESPONSE（区别于 BAD_TOOL_ARGS）', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
      text: async () => '<html>error</html>',
    } as unknown as Response));
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('BAD_RESPONSE');
  });

  it('结构性空响应 {choices:[]} → NO_TOOL_CALL（不抛异常）', async () => {
    const fetchFn = vi.fn(async () => res({ choices: [] }));
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.code).toBe('NO_TOOL_CALL');
  });

  it('网关在 401 体里反射 Authorization → 错误信息脱敏，绝不含 key', async () => {
    const fetchFn = vi.fn(async () => res('401 unauthorized for header: Bearer sk-SECRET-123', { ok: false, status: 401 }));
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.error.message).not.toContain('sk-SECRET-123');
  });

  it('请求体不含 key（key 只在 Authorization 头）', async () => {
    const fetchFn = vi.fn(async () => toolCallRes([]));
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    await p.requestOps('x', snap);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).not.toContain('sk-SECRET-123');
  });

  it('NETWORK：注入 fetch 抛出含 key 的错误 → 信息脱敏', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('failed sending Bearer sk-SECRET-123');
    });
    const p = createProvider({ storage, fetchFn: fetchFn as unknown as typeof fetch });
    const r = await p.requestOps('x', snap);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error.code).toBe('NETWORK');
      expect(r.error.message).not.toContain('sk-SECRET-123');
    }
  });

  it('resolveEndpoint 自带 Authorization → 不能覆盖真 Bearer key', async () => {
    const fetchFn = vi.fn(async () => toolCallRes([]));
    const p = createProvider({
      storage,
      fetchFn: fetchFn as unknown as typeof fetch,
      resolveEndpoint: () => ({ url: '/__byok/chat/completions', headers: { Authorization: 'Bearer CLOBBERED' } }),
    });
    await p.requestOps('x', snap);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-SECRET-123');
  });
});
