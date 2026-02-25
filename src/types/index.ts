export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskUrgency = 'low' | 'medium' | 'high' | 'urgent';
export type TimerMode = 'work' | 'break' | 'longBreak' | 'idle';
export type GlobalViewSortMode = 'zone' | 'priority' | 'urgency' | 'weighted' | 'workTime' | 'estimatedTime' | 'timeDiff';

export interface SortConfig {
  mode: GlobalViewSortMode;
  priorityWeight: number;
  urgencyWeight: number;
}

// 内部剪贴板数据类型
export interface ClipboardData {
  type: 'task' | 'zone';
  data: Task | { zone: Zone; tasks: Task[] };
  timestamp: number;
}

export interface Task {
  id: string;
  zoneId: string;
  parentId: string | null;  // 父任务ID，null表示顶级任务
  isCollapsed: boolean;      // 是否折叠子任务
  title: string;
  description: string;
  completed: boolean;
  priority: TaskPriority;
  urgency: TaskUrgency;
  order: number;
  createdAt: number;
  completedAt?: number;
  expanded: boolean;
  totalWorkTime: number; // 累计工作时间（秒），包含所有子任务的时间
  ownTime?: number;      // 独立计时时间（秒），仅在该任务上花费的时间，不含子任务
  estimatedTime?: number; // 预期时间（分钟），创建时可填也可后续编辑
}

export interface Zone {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: number;
}

// 历史工作区（替代原来的 Archive）
export interface HistoryWorkspace {
  id: string;
  name: string;
  summary: string;
  createdAt: number;
  lastModified: number;
  zones: Zone[];
  tasks: Task[];
  sessions: PomodoroSession[];
}

// 当前工作区
export interface CurrentWorkspace {
  id: string;
  name: string;
  zones: Zone[];
  tasks: Task[];
  sessions: PomodoroSession[];
  createdAt: number;
  lastModified: number;
  sourceHistoryId?: string; // 来自哪个历史记录（恢复时设置）
}

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  zones: Omit<Zone, 'id' | 'createdAt'>[];
}

export interface PomodoroSession {
  id: string;
  taskId: string;
  startTime: number;
  endTime?: number;
  completed: boolean;
}

export interface AppState {
  currentView: 'zones' | 'global' | 'history' | 'settings';
  activeZoneId: string | null;
  focusedTaskId: string | null; // 从全局视图导航到分区时聚焦的任务ID
  activeHistoryId: string | null; // 当前查看的历史工作区ID
  // 当前工作区
  currentWorkspace: CurrentWorkspace;
  // 历史工作区列表
  historyWorkspaces: HistoryWorkspace[];
  // 自定义模板列表
  customTemplates: Template[];
  // 设置
  settings: {
    workDuration: number;
    breakDuration: number;
    longBreakDuration: number;
    autoStartBreak: boolean;
    soundEnabled: boolean;
    collapsed: boolean;
    collapsePosition: { x: number; y: number };
    globalViewSort: SortConfig;
  };
}

export interface TimerState {
  mode: TimerMode;
  timeRemaining: number;
  isRunning: boolean;
  currentTaskId: string | null;
  currentSessionStartTime?: number; // 当前专注会话开始时间
  pausedTimeRemaining?: number;     // 暂停时的剩余时间（秒）
}

// Predefined templates
export const PREDEFINED_TEMPLATES: Template[] = [
  {
    id: 'general',
    name: '通用',
    description: '基础的工作、生活、学习分区',
    icon: 'LayoutGrid',
    zones: [
      { name: '工作', color: '#3b82f6', order: 0 },
      { name: '学习', color: '#8b5cf6', order: 1 },
      { name: '生活', color: '#22c55e', order: 2 },
    ],
  },
  {
    id: 'project',
    name: '项目管理',
    description: '适合多项目并行管理',
    icon: 'FolderKanban',
    zones: [
      { name: '项目 A', color: '#f59e0b', order: 0 },
      { name: '项目 B', color: '#ec4899', order: 1 },
      { name: '项目 C', color: '#06b6d4', order: 2 },
      { name: '其他', color: '#6b7280', order: 3 },
    ],
  },
  {
    id: 'dev',
    name: '开发工作',
    description: '适合软件开发工作流',
    icon: 'Code',
    zones: [
      { name: '开发', color: '#3b82f6', order: 0 },
      { name: '测试', color: '#22c55e', order: 1 },
      { name: '文档', color: '#f59e0b', order: 2 },
      { name: 'Bug 修复', color: '#ef4444', order: 3 },
    ],
  },
  {
    id: 'blank',
    name: '空白',
    description: '从零开始创建',
    icon: 'FileX',
    zones: [],
  },
];

// Predefined colors for zones
export const ZONE_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // yellow
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#84cc16', // lime
  '#6b7280', // gray
];

// 默认设置
export const DEFAULT_SETTINGS = {
  workDuration: 25 * 60, // 25分钟
  breakDuration: 5 * 60, // 5分钟
  longBreakDuration: 15 * 60, // 15分钟
  autoStartBreak: false,
  soundEnabled: true,
  collapsed: false,
  collapsePosition: { x: 100, y: 100 },
  globalViewSort: {
    mode: 'zone' as GlobalViewSortMode,
    priorityWeight: 0.4,
    urgencyWeight: 0.6,
  },
};

// 格式化时间为可读字符串
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// 格式化时间为详细字符串
export function formatDurationDetailed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}小时 ${mins}分 ${secs}秒`;
  }
  if (mins > 0) {
    return `${mins}分 ${secs}秒`;
  }
  return `${secs}秒`;
}
