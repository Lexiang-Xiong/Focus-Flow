// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ByokSettingsSection } from './ByokSettingsSection';
import { BYOK_STORAGE_KEY } from '@/lib/nlp-edit/provider';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('ByokSettingsSection', () => {
  it('填写保存 → 写入 byok_v1 + 状态变已配置 + 出现清除按钮', async () => {
    const user = userEvent.setup();
    render(<ByokSettingsSection />);
    expect(screen.queryByTestId('byok-clear')).not.toBeInTheDocument(); // 未配置时无「清除」
    await user.type(screen.getByTestId('byok-set-base'), 'https://x/v1');
    await user.type(screen.getByTestId('byok-set-key'), 'sk-abc');
    await user.type(screen.getByTestId('byok-set-model'), 'm');
    await user.click(screen.getByTestId('byok-save'));
    const stored = JSON.parse(localStorage.getItem(BYOK_STORAGE_KEY)!);
    expect(stored).toMatchObject({ base: 'https://x/v1', key: 'sk-abc', model: 'm' });
    expect(screen.getByTestId('byok-clear')).toBeInTheDocument();
  });

  it('已配置时预填字段 + 清除 → 移除 byok_v1', async () => {
    localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify({ base: 'https://y/v1', key: 'k', model: 'mm' }));
    const user = userEvent.setup();
    render(<ByokSettingsSection />);
    expect(screen.getByTestId('byok-set-base')).toHaveValue('https://y/v1'); // 预填现有配置
    await user.click(screen.getByTestId('byok-clear'));
    expect(localStorage.getItem(BYOK_STORAGE_KEY)).toBeNull();
    expect(screen.queryByTestId('byok-clear')).not.toBeInTheDocument();
  });

  it('字段不全 → 不写入', async () => {
    const user = userEvent.setup();
    render(<ByokSettingsSection />);
    await user.type(screen.getByTestId('byok-set-base'), 'https://x/v1'); // 缺 key/model
    await user.click(screen.getByTestId('byok-save'));
    expect(localStorage.getItem(BYOK_STORAGE_KEY)).toBeNull();
  });
});
