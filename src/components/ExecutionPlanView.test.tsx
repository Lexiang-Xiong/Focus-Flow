// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: () => {} } }),
}));

import { ExecutionPlanView } from './ExecutionPlanView';
import type { Task, Zone, PlanGroup } from '@/types';

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

function makePlanGroup(id: string, name: string): PlanGroup {
  return { id, name, startDate: null, endDate: null, order: 0, createdAt: 0 };
}

const noop = vi.fn();

function renderExecutionPlanView(props: Partial<React.ComponentProps<typeof ExecutionPlanView>> = {}) {
  return render(
    <ExecutionPlanView
      planGroups={[makePlanGroup('g1', 'Test Group')]}
      tasks={[makeTask('t1', 'z1', { planGroupIds: ['g1'] })]}
      zones={[makeZone('z1', 'Zone 1')]}
      selectedDate="2026-07-12"
      onDateChange={noop}
      onBack={noop}
      onAddGroup={noop}
      onUpdateGroup={noop}
      onDeleteGroup={noop}
      onToggleTask={noop}
      onNavigateToZone={noop}
      onRemoveTaskFromGroup={noop}
      onRemoveTaskFromDailyPlan={noop}
      onAddTasksToDailyPlan={noop}
      onSetDailyPlanOrder={noop}
      {...props}
    />
  );
}

describe('ExecutionPlanView', () => {
  it('默认显示单日计划视图', () => {
    renderExecutionPlanView();
    expect(screen.getByText('view.dailyPlan')).toBeInTheDocument();
    expect(screen.getByText('view.noTasksForDate')).toBeInTheDocument();
  });

  it('切换到计划组视图显示计划组列表', async () => {
    const user = userEvent.setup();
    renderExecutionPlanView();

    await user.click(screen.getByText('view.planGroups'));
    expect(screen.getByText('Test Group')).toBeInTheDocument();
  });

  it('点击返回调用 onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderExecutionPlanView({ onBack });

    await user.click(screen.getByTitle('common.back'));
    expect(onBack).toHaveBeenCalled();
  });
});
