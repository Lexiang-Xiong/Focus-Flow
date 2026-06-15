// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: () => {} } }),
}));

import { GlobalView } from './GlobalView';
import type { Task, Zone } from '@/types';

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

afterEach(cleanup);

function makeTask(id: string, zoneId: string, over: Partial<Task> = {}): Task {
  return {
    id, zoneId, parentId: null, title: id, description: '',
    completed: false, priority: 'medium', urgency: 'low', deadline: null,
    deadlineType: 'none', order: 0, createdAt: 0, expanded: false,
    isCollapsed: false, totalWorkTime: 0, ...over,
  } as Task;
}

function makeZone(id: string, name: string): Zone {
  return { id, name, color: '#f00', order: 0, createdAt: 0 };
}

const noop = vi.fn();

function renderGlobalView(props: Partial<React.ComponentProps<typeof GlobalView>> = {}) {
  return render(
    <GlobalView
      zones={[makeZone('z1', 'Zone 1'), makeZone('z2', 'Zone 2')]}
      tasks={[makeTask('t1', 'z1'), makeTask('t2', 'z2')]}
      activeTaskId={null}
      isTimerRunning={false}
      sortConfig={{ mode: 'priority', priorityWeight: 0.6, deadlineWeight: 0.4 }}
      isLeafMode={false}
      onLeafModeChange={noop}
      isGroupByZone={false}
      onGroupByZoneChange={noop}
      onBack={noop}
      onToggleTask={noop}
      onDeleteTask={noop}
      onUpdateTask={noop}
      onToggleExpanded={noop}
      onReorderTasks={noop}
      onSelectTask={noop}
      onSortConfigChange={noop}
      {...props}
    />
  );
}

describe('GlobalView 按工作区分组', () => {
  it('点击分组按钮触发 onGroupByZoneChange(true)', async () => {
    const user = userEvent.setup();
    const onGroupByZoneChange = vi.fn();
    renderGlobalView({ onGroupByZoneChange });

    const button = screen.getByTitle('view.groupByZone');
    await user.click(button);
    expect(onGroupByZoneChange).toHaveBeenCalledWith(true);
  });

  it('isGroupByZone=true 时按 zone 渲染分组标题', () => {
    renderGlobalView({ isGroupByZone: true });
    expect(screen.getByText('Zone 1')).toBeInTheDocument();
    expect(screen.getByText('Zone 2')).toBeInTheDocument();
  });
});
