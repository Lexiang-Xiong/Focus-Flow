import type { Task, TaskPriority, TaskUrgency } from '../types';

/**
 * Deadline type for task
 */
export type DeadlineType = 'exact' | 'today' | 'tomorrow' | 'week' | 'none';

/**
 * 计算未完成任务的排位分数
 * 返回一个 Map，Key 为任务 ID，Value 为 0~1 的分数（1代表最紧急）
 *
 * 规则：
 * - 只处理有 deadline 且未完成的任务
 * - 按 deadline 从早到晚排序
 * - 越早截止，分数越高
 */
export function calculateRankScores(tasks: Task[]): Record<string, number> {
  // 使用继承后的 deadline 进行排序
  const withDeadline = tasks
    .map(t => ({ ...t, effectiveDeadline: getInheritedDeadline(t, tasks) }))
    .filter(t => !t.completed && t.effectiveDeadline && t.effectiveDeadline > 0)
    .sort((a, b) => (a.effectiveDeadline || 0) - (b.effectiveDeadline || 0));

  const scores: Record<string, number> = {};
  const count = withDeadline.length;

  withDeadline.forEach((task, index) => {
    // 排名越靠前分数越高。如果只有1个任务，分数为 1
    // 分数公式：(count - 1 - index) / (count - 1)
    // 这样最早截止的（index=0）得到最高分 1
    scores[task.id] = count > 1 ? (count - 1 - index) / (count - 1) : 1;
  });

  return scores;
}

/**
 * 将排位分数映射为 Urgency 级别
 * - 前 25% → urgent
 * - 25%-50% → high
 * - 50%-75% → medium
 * - 75%-100% → low
 * - 无 DDL → low (默认)
 */
export function mapRankToUrgency(score: number, hasDeadline: boolean): TaskUrgency {
  if (!hasDeadline || score === 0) return 'low';
  if (score >= 0.75) return 'urgent';
  if (score >= 0.5) return 'high';
  if (score >= 0.25) return 'medium';
  return 'low';
}

/**
 * 根据紧迫程度分数生成 HSL 颜色
 * 0.0 (不紧急) -> 绿色 (120), 1.0 (极度紧急) -> 红色 (0)
 */
export function getUrgencyColor(score: number, isOverdue: boolean = false): string {
  if (isOverdue) return 'hsl(0, 85%, 50%)'; // 逾期直接纯红

  // 限制分值范围
  const clamped = Math.max(0, Math.min(1, score));
  const hue = (1 - clamped) * 120;
  return `hsl(${Math.round(hue)}, 80%, 50%)`;
}

/**
 * 根据绝对 deadline 时间获取紧迫性颜色
 * 7 档位：赤橙黄绿青蓝紫 + 灰（未定义）+ 深红（逾期）
 * - 赤：5小时以内
 * - 橙：12小时以内
 * - 黄：24小时以内
 * - 绿：2天以内
 * - 青：一周以内
 * - 蓝：一个月以内
 * - 紫：一个月以后
 * - 灰：未定义
 * - 深红：已逾期
 *
 * @param deadline 任务的截止时间戳（毫秒）
 * @param isOverdue 是否已逾期
 * @returns 颜色值
 */
export function getAbsoluteUrgencyColor(deadline: number | null, isOverdue: boolean = false): string {
  // 逾期优先显示深红
  if (isOverdue) {
    return 'hsl(0, 80%, 35%)'; // 深红 - 逾期
  }

  // 未定义 deadline 显示灰色
  if (!deadline || deadline <= 0) {
    return 'hsl(0, 0%, 50%)'; // 灰色 - 未定义
  }

  const now = Date.now();
  const diff = deadline - now; // 剩余毫秒数
  const hours = diff / (1000 * 60 * 60); // 转换为小时

  if (hours <= 5) {
    return 'hsl(0, 85%, 50%)'; // 赤 - 5小时以内（红色）
  } else if (hours <= 12) {
    return 'hsl(25, 90%, 50%)'; // 橙 - 12小时以内（橙色）
  } else if (hours <= 24) {
    return 'hsl(50, 90%, 50%)'; // 黄 - 24小时以内（黄色）
  } else if (hours <= 48) {
    return 'hsl(120, 70%, 45%)'; // 绿 - 2天以内（绿色）
  } else if (hours <= 168) { // 7天 = 168小时
    return 'hsl(170, 80%, 45%)'; // 青 - 一周以内（青色）
  } else if (hours <= 720) { // 30天 = 720小时
    return 'hsl(210, 80%, 50%)'; // 蓝 - 一个月以内（蓝色）
  } else {
    return 'hsl(270, 60%, 50%)'; // 紫 - 一个月以后（紫色）
  }
}

/**
 * 获取继承后的截止日期
 * 如果任务本身没有设置截止日期，但父任务有，则返回父任务的截止日期
 * @param task 当前任务
 * @param allTasks 所有任务列表
 * @returns 继承后的截止日期时间戳，如果没有则返回 null
 */
export function getInheritedDeadline(task: Task, allTasks: Task[], visited: Set<string> = new Set()): number | null {
  // 防止循环引用导致无限递归
  if (visited.has(task.id)) {
    return null;
  }
  visited.add(task.id);

  // 如果任务本身有截止日期，直接返回
  if (task.deadline && task.deadline > 0) {
    return task.deadline;
  }

  // 如果没有父任务，返回 null
  if (!task.parentId) {
    return null;
  }

  // 查找父任务
  const parent = allTasks.find(t => t.id === task.parentId);
  if (!parent) {
    return null;
  }

  // 递归获取父任务的截止日期（可能父任务也是继承的）
  return getInheritedDeadline(parent, allTasks, visited);
}

/**
 * 格式化倒计时文案
 * @param deadline 截止时间戳（毫秒）
 * @returns 格式化后的文本和是否逾期
 */
export function getDeadlineStatus(deadline: number | null | undefined): { text: string; isOverdue: boolean } {
  if (!deadline || deadline <= 0) return { text: '', isOverdue: false };

  const now = Date.now();
  const diff = deadline - now;
  const isOverdue = diff < 0;
  const absDiff = Math.abs(diff);

  const days = Math.floor(absDiff / (24 * 3600 * 1000));
  const hours = Math.floor((absDiff % (24 * 3600 * 1000)) / (3600 * 1000));
  const mins = Math.floor((absDiff % (3600 * 1000)) / (60 * 1000));

  let text = isOverdue ? '已逾期 ' : '剩余 ';
  if (days > 0) text += `${days}天${hours}时`;
  else if (hours > 0) text += `${hours}时${mins}分`;
  else text += `${mins}分`;

  return { text, isOverdue };
}

/**
 * 获取截止日期的友好显示
 * @param deadline 截止时间戳
 * @param deadlineType 截止日期类型
 */
export function getDeadlineDisplay(deadline: number | null | undefined, deadlineType: DeadlineType | undefined): string {
  if (!deadline || deadline <= 0) return '';

  const now = Date.now();
  const isOverdue = deadline < now;

  if (deadlineType === 'today') {
    return isOverdue ? '今天 (已逾期)' : '今天';
  }
  if (deadlineType === 'tomorrow') {
    return isOverdue ? '明天 (已逾期)' : '明天';
  }
  if (deadlineType === 'week') {
    return isOverdue ? '本周 (已逾期)' : '本周';
  }

  // exact 类型
  const date = new Date(deadline);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const min = date.getMinutes();

  return isOverdue
    ? `${month}/${day} ${hour}:${min.toString().padStart(2, '0')} (已逾期)`
    : `${month}/${day} ${hour}:${min.toString().padStart(2, '0')}`;
}

// 优先级分数映射
const PRIORITY_MAP: Record<TaskPriority, number> = {
  high: 1.0,
  medium: 0.5,
  low: 0,
};

/**
 * 加权排序算法
 * @param tasks 待排序任务列表（应传入未完成的任务）
 * @param pWeight 优先级权重
 * @param dWeight 截止日期权重（由排名分数计算得出）
 * @param rankScores 预计算的排名分数
 */
export function sortTasks(
  tasks: Task[],
  pWeight: number,
  dWeight: number,
  rankScores: Record<string, number>
): Task[] {
  // 先将任务分为有 DDL 和无 DDL 两组
  const withDeadline = tasks.filter(t => t.deadline && t.deadline > 0 && !t.completed);
  const withoutDeadline = tasks.filter(t => !t.deadline || t.deadline <= 0 || t.completed);

  // 对有 DDL 的任务进行加权排序
  const sortedWithDeadline = [...withDeadline].sort((a, b) => {
    const rankA = rankScores[a.id] || 0;
    const rankB = rankScores[b.id] || 0;

    const priorityA = PRIORITY_MAP[a.priority];
    const priorityB = PRIORITY_MAP[b.priority];

    const scoreA = (priorityA * pWeight) + (rankA * dWeight);
    const scoreB = (priorityB * pWeight) + (rankB * dWeight);

    if (scoreA !== scoreB) return scoreB - scoreA; // 分数高的排前面
    return (a.deadline || Infinity) - (b.deadline || Infinity); // 同分按 DDL 先后排
  });

  // 无 DDL 的任务排在后面，保持原有顺序
  return [...sortedWithDeadline, ...withoutDeadline];
}

/**
 * 转换快捷设置为实际截止时间戳
 * @param type 'today' | 'tomorrow' | 'week' | 'exact' | 'none'
 * @param customDate 自定义日期（当 type 为 'exact' 时使用）
 */
export function convertDeadlineType(
  type: DeadlineType,
  customDate?: Date
): { deadline: number | null; deadlineType: DeadlineType } {
  const now = new Date();

  switch (type) {
    case 'today': {
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { deadline: endOfToday.getTime(), deadlineType: 'today' };
    }
    case 'tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endOfTomorrow = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59, 999);
      return { deadline: endOfTomorrow.getTime(), deadlineType: 'tomorrow' };
    }
    case 'week': {
      const endOfWeek = new Date(now);
      // 星期天为 0，星期六为 6
      const dayOfWeek = endOfWeek.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
      const endOfWeekDay = new Date(endOfWeek.getFullYear(), endOfWeek.getMonth(), endOfWeek.getDate(), 23, 59, 59, 999);
      return { deadline: endOfWeekDay.getTime(), deadlineType: 'week' };
    }
    case 'exact': {
      if (customDate) {
        return { deadline: customDate.getTime(), deadlineType: 'exact' };
      }
      return { deadline: null, deadlineType: 'none' };
    }
    case 'none':
    default:
      return { deadline: null, deadlineType: 'none' };
  }
}

/**
 * 获取当前任务的 urgency 值（用于显示）
 * 根据 deadline 排名自动计算
 */
export function calculateUrgencyForTask(
  task: Task,
  _allTasks: Task[],
  rankScores: Record<string, number>
): TaskUrgency {
  if (task.completed) return 'low';
  if (!task.deadline || task.deadline <= 0) return 'low';

  const score = rankScores[task.id] || 0;
  return mapRankToUrgency(score, true);
}
