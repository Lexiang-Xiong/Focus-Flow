import { describe, it, expect, vi } from 'vitest';
import type { Task } from '@/types';

// i18next 未初始化时 t() 行为不确定，这里桩成「返回 key」，让倒计时文案断言稳定。
vi.mock('i18next', () => ({
  default: { t: (key: string) => key },
}));

import {
  calculateRankScores,
  mapRankToUrgency,
  getUrgencyColor,
  getAbsoluteUrgencyColor,
  getInheritedDeadline,
  getDeadlineStatus,
  sortTasks,
  sortTasksByMode,
  convertDeadlineType,
  calculateUrgencyForTask,
} from './urgency-utils';

// ---- 最小任务构造器 ----
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    zoneId: 'z1',
    parentId: null,
    isCollapsed: false,
    title: id,
    description: '',
    completed: false,
    priority: 'medium',
    urgency: 'low',
    deadline: null,
    deadlineType: 'none',
    order: 0,
    createdAt: 0,
    expanded: false,
    totalWorkTime: 0,
    ...over,
  };
}

const HOUR = 60 * 60 * 1000;

// ============ calculateRankScores ============
describe('calculateRankScores（截止日期排名分数）', () => {
  it('越早截止分数越高，最早=1，最晚=0', () => {
    const tasks = [
      task('a', { deadline: 100 }),
      task('b', { deadline: 200 }),
      task('c', { deadline: 300 }),
    ];
    const s = calculateRankScores(tasks);
    expect(s.a).toBe(1);
    expect(s.b).toBe(0.5);
    expect(s.c).toBe(0);
  });

  it('截止日期相同的任务获得相同分数', () => {
    const tasks = [
      task('a', { deadline: 100 }),
      task('b', { deadline: 100 }),
      task('c', { deadline: 300 }),
    ];
    const s = calculateRankScores(tasks);
    expect(s.a).toBe(1);
    expect(s.b).toBe(1);
    expect(s.c).toBe(0);
  });

  it('已完成任务不参与排名', () => {
    const tasks = [
      task('a', { deadline: 100, completed: true }),
      task('b', { deadline: 200 }),
    ];
    const s = calculateRankScores(tasks);
    expect(s.a).toBeUndefined();
    expect(s.b).toBe(1); // 仅剩 1 个有效任务 → 1
  });

  it('无截止日期的任务不出现在结果里', () => {
    const tasks = [task('a'), task('b', { deadline: 200 })];
    const s = calculateRankScores(tasks);
    expect(s.a).toBeUndefined();
    expect(s.b).toBe(1);
  });

  it('单个任务分数为 1，空列表返回空对象', () => {
    expect(calculateRankScores([task('a', { deadline: 100 })])).toEqual({ a: 1 });
    expect(calculateRankScores([])).toEqual({});
  });

  it('子任务继承父任务截止日期后参与排名', () => {
    const tasks = [
      task('parent', { deadline: 100 }),
      task('child', { parentId: 'parent' }), // 无自有 ddl，继承 100
      task('other', { deadline: 300 }),
    ];
    const s = calculateRankScores(tasks);
    // child 继承 100，与 parent 同档（最早）
    expect(s.child).toBe(1);
    expect(s.parent).toBe(1);
    expect(s.other).toBe(0);
  });
});

// ============ mapRankToUrgency ============
describe('mapRankToUrgency（分数→紧急度档位）', () => {
  it('无截止日期或分数为 0 → low', () => {
    expect(mapRankToUrgency(0.9, false)).toBe('low');
    expect(mapRankToUrgency(0, true)).toBe('low');
  });

  it('按阈值映射 urgent/high/medium/low', () => {
    expect(mapRankToUrgency(1, true)).toBe('urgent');
    expect(mapRankToUrgency(0.75, true)).toBe('urgent');
    expect(mapRankToUrgency(0.74, true)).toBe('high');
    expect(mapRankToUrgency(0.5, true)).toBe('high');
    expect(mapRankToUrgency(0.49, true)).toBe('medium');
    expect(mapRankToUrgency(0.25, true)).toBe('medium');
    expect(mapRankToUrgency(0.24, true)).toBe('low');
  });
});

// ============ getUrgencyColor ============
describe('getUrgencyColor（分数→HSL 渐变色）', () => {
  it('逾期固定纯红', () => {
    expect(getUrgencyColor(0, true)).toBe('hsl(0, 85%, 50%)');
  });

  it('0 分绿色(120)，1 分红色(0)，0.5 居中(60)', () => {
    expect(getUrgencyColor(0)).toBe('hsl(120, 80%, 50%)');
    expect(getUrgencyColor(1)).toBe('hsl(0, 80%, 50%)');
    expect(getUrgencyColor(0.5)).toBe('hsl(60, 80%, 50%)');
  });

  it('超出 [0,1] 的分数会被夹紧', () => {
    expect(getUrgencyColor(2)).toBe('hsl(0, 80%, 50%)');
    expect(getUrgencyColor(-1)).toBe('hsl(120, 80%, 50%)');
  });
});

// ============ getAbsoluteUrgencyColor ============
describe('getAbsoluteUrgencyColor（按绝对剩余时间分档）', () => {
  it('逾期 → 深红，未定义 → 灰', () => {
    expect(getAbsoluteUrgencyColor(123, true)).toBe('hsl(0, 80%, 35%)');
    expect(getAbsoluteUrgencyColor(null)).toBe('hsl(0, 0%, 50%)');
    expect(getAbsoluteUrgencyColor(0)).toBe('hsl(0, 0%, 50%)');
  });

  it('按剩余小时数命中各档颜色', () => {
    const now = Date.now();
    expect(getAbsoluteUrgencyColor(now + 2 * HOUR)).toBe('hsl(0, 85%, 50%)');    // 赤 <=5h
    expect(getAbsoluteUrgencyColor(now + 8 * HOUR)).toBe('hsl(25, 90%, 50%)');   // 橙 <=12h
    expect(getAbsoluteUrgencyColor(now + 20 * HOUR)).toBe('hsl(50, 90%, 50%)');  // 黄 <=24h
    expect(getAbsoluteUrgencyColor(now + 40 * HOUR)).toBe('hsl(120, 70%, 45%)'); // 绿 <=48h
    expect(getAbsoluteUrgencyColor(now + 100 * HOUR)).toBe('hsl(170, 80%, 45%)');// 青 <=168h
    expect(getAbsoluteUrgencyColor(now + 500 * HOUR)).toBe('hsl(210, 80%, 50%)');// 蓝 <=720h
    expect(getAbsoluteUrgencyColor(now + 1000 * HOUR)).toBe('hsl(270, 60%, 50%)');// 紫 >720h
  });
});

// ============ getInheritedDeadline ============
describe('getInheritedDeadline（截止日期继承）', () => {
  it('自身有截止日期直接返回自身', () => {
    const t = task('a', { deadline: 500 });
    expect(getInheritedDeadline(t, [t])).toBe(500);
  });

  it('自身无截止日期则向上继承父任务', () => {
    const parent = task('p', { deadline: 800 });
    const child = task('c', { parentId: 'p' });
    expect(getInheritedDeadline(child, [parent, child])).toBe(800);
  });

  it('多级继承：祖父有截止日期', () => {
    const gp = task('gp', { deadline: 900 });
    const p = task('p', { parentId: 'gp' });
    const c = task('c', { parentId: 'p' });
    expect(getInheritedDeadline(c, [gp, p, c])).toBe(900);
  });

  it('无父任务且自身无截止日期 → null', () => {
    const t = task('a');
    expect(getInheritedDeadline(t, [t])).toBeNull();
  });

  it('循环引用不会无限递归，返回 null', () => {
    const a = task('a', { parentId: 'b' });
    const b = task('b', { parentId: 'a' });
    expect(getInheritedDeadline(a, [a, b])).toBeNull();
  });
});

// ============ getDeadlineStatus ============
describe('getDeadlineStatus（倒计时与逾期标记）', () => {
  it('空/非法截止日期返回空文案、未逾期', () => {
    expect(getDeadlineStatus(null)).toEqual({ text: '', isOverdue: false });
    expect(getDeadlineStatus(0)).toEqual({ text: '', isOverdue: false });
  });

  it('未来时间未逾期', () => {
    const r = getDeadlineStatus(Date.now() + 3 * HOUR);
    expect(r.isOverdue).toBe(false);
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('过去时间标记为逾期', () => {
    const r = getDeadlineStatus(Date.now() - 3 * HOUR);
    expect(r.isOverdue).toBe(true);
  });
});

// ============ sortTasks ============
describe('sortTasks（加权排序）', () => {
  it('截止日期权重主导时，排名高的排前面', () => {
    const tasks = [
      task('late', { deadline: 200 }),
      task('early', { deadline: 100 }),
    ];
    const ranks = calculateRankScores(tasks);
    const sorted = sortTasks(tasks, 0.5, 0.5, ranks);
    expect(sorted.map(t => t.id)).toEqual(['early', 'late']);
  });

  it('优先级权重主导时，高优先级排前面（同截止日期）', () => {
    const tasks = [
      task('lowP', { deadline: 100, priority: 'low' }),
      task('highP', { deadline: 100, priority: 'high' }),
    ];
    const ranks = calculateRankScores(tasks);
    const sorted = sortTasks(tasks, 1, 0, ranks);
    expect(sorted[0].id).toBe('highP');
  });

  it('无截止日期/已完成的任务排在最后', () => {
    const tasks = [
      task('noDdl'),
      task('done', { deadline: 100, completed: true }),
      task('active', { deadline: 200 }),
    ];
    const ranks = calculateRankScores(tasks);
    const sorted = sortTasks(tasks, 0.5, 0.5, ranks);
    expect(sorted[0].id).toBe('active');
    expect(sorted.slice(1).map(t => t.id).sort()).toEqual(['done', 'noDdl']);
  });
});

// ============ convertDeadlineType ============
describe('convertDeadlineType（快捷类型→时间戳）', () => {
  it('today 返回今天 23:59 且类型为 today', () => {
    const { deadline, deadlineType } = convertDeadlineType('today');
    expect(deadlineType).toBe('today');
    const d = new Date(deadline!);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });

  it('tomorrow 晚于 today', () => {
    const today = convertDeadlineType('today').deadline!;
    const tomorrow = convertDeadlineType('tomorrow').deadline!;
    expect(tomorrow).toBeGreaterThan(today);
    expect(convertDeadlineType('tomorrow').deadlineType).toBe('tomorrow');
  });

  it('week 不早于 today，类型为 week', () => {
    const today = convertDeadlineType('today').deadline!;
    const week = convertDeadlineType('week');
    expect(week.deadline!).toBeGreaterThanOrEqual(today);
    expect(week.deadlineType).toBe('week');
  });

  it('exact 带自定义日期返回该时间戳', () => {
    const custom = new Date(2030, 0, 1, 12, 0, 0);
    const r = convertDeadlineType('exact', custom);
    expect(r.deadline).toBe(custom.getTime());
    expect(r.deadlineType).toBe('exact');
  });

  it('exact 无日期 / none → null + none', () => {
    expect(convertDeadlineType('exact')).toEqual({ deadline: null, deadlineType: 'none' });
    expect(convertDeadlineType('none')).toEqual({ deadline: null, deadlineType: 'none' });
  });
});

// ============ calculateUrgencyForTask ============
describe('calculateUrgencyForTask（任务显示用紧急度）', () => {
  it('已完成 → low', () => {
    const t = task('a', { deadline: 100, completed: true });
    expect(calculateUrgencyForTask(t, [t], { a: 1 })).toBe('low');
  });

  it('无截止日期 → low', () => {
    const t = task('a');
    expect(calculateUrgencyForTask(t, [t], {})).toBe('low');
  });

  it('依据排名分数映射档位', () => {
    const t = task('a', { deadline: 100 });
    expect(calculateUrgencyForTask(t, [t], { a: 1 })).toBe('urgent');
    expect(calculateUrgencyForTask(t, [t], { a: 0.5 })).toBe('high');
  });
});

// ============ T10：各排序模式 sortTasksByMode ============
describe('sortTasksByMode（按模式排序）', () => {
  const ids = (arr: Task[]) => arr.map(t => t.id);

  it('priority：critical > heavy > high > medium > low', () => {
    const list = [
      task('low', { priority: 'low' }),
      task('high', { priority: 'high' }),
      task('mid', { priority: 'medium' }),
      task('heavy', { priority: 'heavy' }),
      task('critical', { priority: 'critical' }),
    ];
    expect(ids(sortTasksByMode(list, 'priority', list))).toEqual(['critical', 'heavy', 'high', 'mid', 'low']);
  });

  it('urgency：截止越早越前，无截止排最后', () => {
    const now = 1_000_000;
    const list = [
      task('none'),
      task('late', { deadline: now + 5 * HOUR }),
      task('soon', { deadline: now + 1 * HOUR }),
    ];
    expect(ids(sortTasksByMode(list, 'urgency', list))).toEqual(['soon', 'late', 'none']);
  });

  it('urgency：子任务继承父任务截止日期参与排序', () => {
    const parent = task('p', { deadline: 1000 });
    const child = task('c', { parentId: 'p' });          // 无自有截止，继承 1000
    const other = task('o', { deadline: 5000 });
    const all = [parent, child, other];
    // 只排 child 与 other：child 继承 1000 < other 5000 → child 在前
    expect(ids(sortTasksByMode([other, child], 'urgency', all))).toEqual(['c', 'o']);
  });

  it('workTime：累计工时降序', () => {
    const list = [
      task('a', { totalWorkTime: 10 }),
      task('b', { totalWorkTime: 100 }),
      task('c', { totalWorkTime: 50 }),
    ];
    expect(ids(sortTasksByMode(list, 'workTime', list))).toEqual(['b', 'c', 'a']);
  });

  it('estimatedTime：预估时间降序', () => {
    const list = [
      task('a', { estimatedTime: 5 }),
      task('b', { estimatedTime: 60 }),
      task('c', { estimatedTime: 30 }),
    ];
    expect(ids(sortTasksByMode(list, 'estimatedTime', list))).toEqual(['b', 'c', 'a']);
  });

  it('weighted：优先级与截止综合分数降序', () => {
    const now = 1_000_000;
    // highSoon：高优先级 + 最近截止 → 综合分最高
    const list = [
      task('lowLate', { priority: 'low', deadline: now + 10 * HOUR }),
      task('highSoon', { priority: 'high', deadline: now + 1 * HOUR }),
    ];
    expect(ids(sortTasksByMode(list, 'weighted', list))[0]).toBe('highSoon');
  });

  it('weighted：critical 优先级得分高于 heavy/high/medium/low', () => {
    const now = 1_000_000;
    // 同截止情况下，critical 应排最前
    const list = [
      task('low', { priority: 'low', deadline: now + 1 * HOUR }),
      task('medium', { priority: 'medium', deadline: now + 1 * HOUR }),
      task('high', { priority: 'high', deadline: now + 1 * HOUR }),
      task('heavy', { priority: 'heavy', deadline: now + 1 * HOUR }),
      task('critical', { priority: 'critical', deadline: now + 1 * HOUR }),
    ];
    expect(ids(sortTasksByMode(list, 'weighted', list))).toEqual(['critical', 'heavy', 'high', 'medium', 'low']);
  });

  it('manual / 未覆盖模式：保持传入顺序', () => {
    const list = [task('b', { priority: 'low' }), task('a', { priority: 'high' })];
    expect(ids(sortTasksByMode(list, 'manual', list))).toEqual(['b', 'a']);
    expect(ids(sortTasksByMode(list, 'zone', list))).toEqual(['b', 'a']);
  });

  it('就地排序并返回同一引用（语义同 Array.sort）', () => {
    const list = [task('b', { priority: 'low' }), task('a', { priority: 'high' })];
    const ret = sortTasksByMode(list, 'priority', list);
    expect(ret).toBe(list);
    expect(ids(list)).toEqual(['a', 'b']);
  });
});
