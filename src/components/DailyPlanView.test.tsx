// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: () => {} } }),
}));

import { DailyPlanView } from './DailyPlanView';
import type { Task, Zone, PlanGroup, DailyPlanSpan } from '@/types';

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

function makePlanGroup(id: string, name: string, startDate?: string, endDate?: string): PlanGroup {
  return { id, name, startDate: startDate ?? null, endDate: endDate ?? null, order: 0, createdAt: 0 };
}

function makeSpan(id: string, date: string, startHour: number, endHour: number): DailyPlanSpan {
  return { id, date, startHour, endHour, createdAt: 0 };
}

const noop = vi.fn();

function renderDailyPlanView(props: Partial<React.ComponentProps<typeof DailyPlanView>> = {}) {
  return render(
    <DailyPlanView
      planGroups={[makePlanGroup('g1', 'Week Plan', '2026-07-11', '2026-07-15')]}
      tasks={[
        makeTask('t1', 'z1', { plannedDates: ['2026-07-12'], planGroupIds: ['g1'] }),
        makeTask('t2', 'z1', { plannedDates: ['2026-07-13'] }),
        makeTask('t3', 'z2', { planGroupIds: ['g1'] }),
      ]}
      zones={[makeZone('z1', 'Zone 1'), makeZone('z2', 'Zone 2')]}
      selectedDate="2026-07-12"
      onDateChange={noop}
      onToggleTask={noop}
      onNavigateToZone={noop}
      onRemoveTaskFromDailyPlan={noop}
      onAddTasksToDailyPlan={noop}
      onSetDailyPlanOrder={noop}
      onMoveTaskToSpan={noop}
      onMoveTaskOutOfSpan={noop}
      onSetDailyPlanSpanOrder={noop}
      onCreateSpan={noop}
      onUpdateSpan={noop}
      onDeleteSpan={noop}
      spans={[]}
      {...props}
    />
  );
}

describe('DailyPlanView', () => {
  it('显示选中日期与该日期任务，不显示其他日期任务', () => {
    renderDailyPlanView();
    expect(screen.getByText('t1')).toBeInTheDocument();
    expect(screen.queryByText('t2')).not.toBeInTheDocument();
    expect(screen.queryByText('t3')).not.toBeInTheDocument();
  });

  it('点击任务标题触发导航', async () => {
    const user = userEvent.setup();
    const onNavigateToZone = vi.fn();
    renderDailyPlanView({ onNavigateToZone });

    await user.click(screen.getByText('t1'));
    expect(onNavigateToZone).toHaveBeenCalledWith('z1', 't1');
  });

  it('点击移除按钮触发 onRemoveTaskFromDailyPlan', async () => {
    const user = userEvent.setup();
    const onRemoveTaskFromDailyPlan = vi.fn();
    renderDailyPlanView({ onRemoveTaskFromDailyPlan });

    const removeBtn = screen.getByTitle('task.removeFromPlan');
    await user.click(removeBtn);
    expect(onRemoveTaskFromDailyPlan).toHaveBeenCalledWith('t1', '2026-07-12');
  });

  it('打开"从计划组添加"对话框', async () => {
    const user = userEvent.setup();
    renderDailyPlanView();

    const addBtn = screen.getAllByText('view.addFromPlanGroup').find(el => el.tagName === 'BUTTON');
    expect(addBtn).toBeTruthy();
    await user.click(addBtn!);
    // 对话框中列出覆盖 2026-07-12 的计划组
    expect(screen.getByText('Week Plan')).toBeInTheDocument();
  });

  it('按 dailyPlanOrder 排序任务', () => {
    renderDailyPlanView({
      tasks: [
        makeTask('t1', 'z1', { plannedDates: ['2026-07-12'], dailyPlanOrder: { '2026-07-12': 2 } }),
        makeTask('t2', 'z1', { plannedDates: ['2026-07-12'], dailyPlanOrder: { '2026-07-12': 1 } }),
      ],
    });
    const items = screen.getAllByText(/t[12]/);
    expect(items[0]).toHaveTextContent('t2');
    expect(items[1]).toHaveTextContent('t1');
  });

  it('属于 span 的任务仍显示在单日任务栏', () => {
    renderDailyPlanView({
      tasks: [
        makeTask('t1', 'z1', {
          plannedDates: ['2026-07-12'],
          dailyPlanSpanIds: { '2026-07-12': ['s1'] },
        }),
        makeTask('t2', 'z1', { plannedDates: ['2026-07-12'] }),
      ],
      spans: [makeSpan('s1', '2026-07-12', 9, 11)],
    });
    expect(screen.getByText((content) => content.includes('view.dailyTasks'))).toBeInTheDocument();
    expect(screen.getByText('t1')).toBeInTheDocument();
    expect(screen.getByText('t2')).toBeInTheDocument();
  });

  it('点击创建时间块按钮打开弹窗', async () => {
    const user = userEvent.setup();
    renderDailyPlanView({
      tasks: [makeTask('t1', 'z1', { plannedDates: ['2026-07-12'] })],
    });

    const createBtn = screen.getByRole('button', { name: /view\.createSpan/i });
    expect(createBtn).toBeInTheDocument();
    await user.click(createBtn);
    expect(screen.getByRole('heading', { name: /view\.createSpan/i })).toBeInTheDocument();
  });

  it('可收起和展开单日任务栏与日程区域，日程默认收起', async () => {
    const user = userEvent.setup();
    renderDailyPlanView({
      tasks: [makeTask('t1', 'z1', { plannedDates: ['2026-07-12'] })],
    });

    // 默认：单日任务栏展开，日程收起
    expect(screen.getByText('t1')).toBeInTheDocument();
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();

    // 展开日程
    const expandSchedule = screen.getAllByTitle('common.expand')[0];
    await user.click(expandSchedule);
    expect(screen.getByText('00:00')).toBeInTheDocument();

    // 收起日程（此时有两个 collapse 按钮，取最后一个即日程的）
    const collapseSchedule = screen.getAllByTitle('common.collapse').at(-1);
    await user.click(collapseSchedule!);
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();

    // 收起单日任务栏
    const collapseBacklog = screen.getAllByTitle('common.collapse')[0];
    await user.click(collapseBacklog);
    expect(screen.queryByText('t1')).not.toBeInTheDocument();

    // 展开单日任务栏
    const expandBacklog = screen.getAllByTitle('common.expand')[0];
    await user.click(expandBacklog);
    expect(screen.getByText('t1')).toBeInTheDocument();
  });
});
