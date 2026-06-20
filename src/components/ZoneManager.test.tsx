// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// 组件用 react-i18next 的 useTranslation；桩成「键名原样返回」，断言用键名即可。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: () => {} } }),
}));

import { ZoneManager } from './ZoneManager';
import type { Zone, Task } from '@/types';

// jsdom 没有 ResizeObserver（radix ScrollArea 需要），补个空实现。
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

afterEach(cleanup);

function baseProps() {
  return {
    zones: [] as Zone[],
    tasks: [] as Task[],
    activeZoneId: null as string | null,
    templates: [],
    customTemplates: [],
    onNlpApply: vi.fn(),
    onSelectZone: vi.fn(),
    onAddZone: vi.fn(),
    onUpdateZone: vi.fn(),
    onDeleteZone: vi.fn(),
    onApplyTemplate: vi.fn(),
    onViewChange: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenSettings: vi.fn(),
  };
}

describe('ZoneManager（T03 渲染层：点击→回调）', () => {
  it('展开添加表单 → 输入名称 → 提交，调用 onAddZone(name, color)', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<ZoneManager {...props} />);

    await user.click(screen.getByTitle('zone.addZone'));        // 点 + 展开
    await user.type(screen.getByPlaceholderText('zone.zoneName'), '测试分区B');
    await user.click(screen.getByText('common.add'));            // 点“添加”

    expect(props.onAddZone).toHaveBeenCalledTimes(1);
    expect(props.onAddZone).toHaveBeenCalledWith('测试分区B', expect.any(String));
  });

  it('名称为空时“添加”按钮禁用，不触发 onAddZone', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<ZoneManager {...props} />);

    await user.click(screen.getByTitle('zone.addZone'));
    const addBtn = screen.getByText('common.add').closest('button')!;
    expect(addBtn).toBeDisabled();
  });

  it('渲染已有分区，点击触发 onSelectZone(zoneId)', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    const zone: Zone = { id: 'z1', name: '测试分区A', color: '#22c55e', order: 0, createdAt: 1 };
    render(<ZoneManager {...props} zones={[zone]} />);

    expect(screen.getByText('测试分区A')).toBeInTheDocument();
    await user.click(screen.getByText('测试分区A'));
    expect(props.onSelectZone).toHaveBeenCalledWith('z1');
  });
});
