// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// i18n 桩：返回键名；带插值时拼上值，便于断言父任务名等动态内容。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k}:${Object.values(opts).join(',')}` : k,
    i18n: { changeLanguage: () => {} },
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { NlpEditDialog } from './NlpEditDialog';
import type { NlpProvider, RequestOpsResult, ByokConfig } from '@/lib/nlp-edit/provider';
import type { Task, Zone } from '@/types';

// jsdom 缺的几个 DOM API（radix Dialog/ScrollArea/Checkbox 需要），补桩。
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

afterEach(cleanup);

function zone(id: string): Zone {
  return { id, name: id, color: '#fff', order: 0, createdAt: 0 };
}
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id, zoneId: 'z1', parentId: null, isCollapsed: false, title: id, description: '',
    completed: false, priority: 'medium', urgency: 'low', deadline: null, deadlineType: 'none',
    order: 0, createdAt: 0, expanded: false, totalWorkTime: 0, ...over,
  };
}
function makeProvider(result: RequestOpsResult, configured = true): NlpProvider {
  return {
    readConfig: () =>
      configured
        ? { ok: true, config: { base: 'https://x/v1', key: 'k', model: 'm' } }
        : { ok: false, code: 'NOT_CONFIGURED', message: 'x' },
    requestOps: async () => result,
  };
}

describe('NlpEditDialog', () => {
  it('生成 → 预览显示父任务名（TP8 防错挂）→ Apply 回调 actions', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const provider = makeProvider({
      kind: 'ops',
      rawArguments: '',
      ops: [
        { op: 'add_task', zoneId: 'z1', title: '上线', tempId: 't1' },
        { op: 'add_task', zoneId: 'z1', title: '部署', parentId: 't1' },
      ],
    });
    render(<NlpEditDialog zones={[zone('z1')]} tasks={[]} onApply={onApply} providerFactory={() => provider} />);

    await user.click(screen.getByTestId('nlp-trigger'));
    await user.type(screen.getByTestId('nlp-input'), '加上线，下面有部署');
    await user.click(screen.getByTestId('nlp-generate'));

    const added = await screen.findAllByTestId('nlp-added');
    const text = added.map((a) => a.textContent).join('|');
    expect(text).toContain('部署');
    expect(text).toContain('新建:上线'); // TP8：看得出挂到刚新建的「上线」下，而非静默错挂

    await user.click(screen.getByTestId('nlp-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toHaveLength(2);
  });

  it('含删除 → Apply 先禁用，勾选确认后才可应用', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const provider = makeProvider({ kind: 'ops', rawArguments: '', ops: [{ op: 'delete_task', id: 'a' }] });
    render(
      <NlpEditDialog zones={[zone('z1')]} tasks={[task('a', { title: '旧任务' })]} onApply={onApply} providerFactory={() => provider} />,
    );

    await user.click(screen.getByTestId('nlp-trigger'));
    await user.type(screen.getByTestId('nlp-input'), '删除旧任务');
    await user.click(screen.getByTestId('nlp-generate'));

    const apply = await screen.findByTestId('nlp-apply');
    expect(apply).toBeDisabled(); // 删除未确认
    await user.click(screen.getByTestId('nlp-delete-confirm'));
    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('未配置 → 显示配置表单；填写保存 → 调 saveConfig 并进入输入态', async () => {
    const user = userEvent.setup();
    let configured = false;
    const saveConfig = vi.fn<(c: ByokConfig) => void>(() => {
      configured = true;
    });
    const provider: NlpProvider = {
      readConfig: () =>
        configured
          ? { ok: true, config: { base: 'https://x/v1', key: 'k', model: 'm' } }
          : { ok: false, code: 'NOT_CONFIGURED', message: 'x' },
      requestOps: async () => ({ kind: 'ops', ops: [], rawArguments: '' }),
    };
    render(
      <NlpEditDialog zones={[zone('z1')]} tasks={[]} onApply={vi.fn()} providerFactory={() => provider} saveConfig={saveConfig} />,
    );

    await user.click(screen.getByTestId('nlp-trigger'));
    // 未配置 → 配置表单出现（不再是只读提示），普通用户可在应用内填，不必开 DevTools
    expect(await screen.findByTestId('nlp-config')).toBeInTheDocument();
    await user.type(screen.getByTestId('cfg-base'), 'https://x/v1');
    await user.type(screen.getByTestId('cfg-key'), 'sk-abc');
    await user.type(screen.getByTestId('cfg-model'), 'm');
    await user.click(screen.getByTestId('cfg-save'));

    expect(saveConfig).toHaveBeenCalledTimes(1);
    expect(saveConfig.mock.calls[0][0]).toMatchObject({ base: 'https://x/v1', key: 'sk-abc', model: 'm' });
    // 保存后配置变 ok → 自动进入输入态（表单消失、textarea 出现）
    expect(await screen.findByTestId('nlp-input')).toBeInTheDocument();
    expect(screen.queryByTestId('nlp-config')).not.toBeInTheDocument();
  });

  it('配置表单字段不全 → 提示且不调 saveConfig', async () => {
    const user = userEvent.setup();
    const saveConfig = vi.fn();
    const provider: NlpProvider = {
      readConfig: () => ({ ok: false, code: 'NOT_CONFIGURED', message: 'x' }),
      requestOps: async () => ({ kind: 'ops', ops: [], rawArguments: '' }),
    };
    render(
      <NlpEditDialog zones={[zone('z1')]} tasks={[]} onApply={vi.fn()} providerFactory={() => provider} saveConfig={saveConfig} />,
    );
    await user.click(screen.getByTestId('nlp-trigger'));
    await screen.findByTestId('nlp-config');
    await user.type(screen.getByTestId('cfg-base'), 'https://x/v1'); // 缺 key/model
    await user.click(screen.getByTestId('cfg-save'));
    expect(saveConfig).not.toHaveBeenCalled();
    expect(screen.getByTestId('nlp-error')).toHaveTextContent('nlp.cfgIncomplete');
  });

  it('provider 报错 → 显示错误信息（不进预览态）', async () => {
    const user = userEvent.setup();
    const provider = makeProvider({ kind: 'error', error: { code: 'HTTP_ERROR', message: '网关返回 401', status: 401 } });
    render(<NlpEditDialog zones={[zone('z1')]} tasks={[]} onApply={vi.fn()} providerFactory={() => provider} />);

    await user.click(screen.getByTestId('nlp-trigger'));
    await user.type(screen.getByTestId('nlp-input'), 'x');
    await user.click(screen.getByTestId('nlp-generate'));

    expect(await screen.findByTestId('nlp-error')).toHaveTextContent('401');
    expect(screen.queryByTestId('nlp-apply')).not.toBeInTheDocument();
  });
});
