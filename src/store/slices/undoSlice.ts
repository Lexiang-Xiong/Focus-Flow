import type { StateCreator } from 'zustand';
import type { Task, Zone, PlanGroup, DailyPlanSpan } from '@/types';
import type { TaskSlice } from './taskSlice';
import type { ZoneSlice } from './zoneSlice';
import type { ExecutionPlanSlice } from './executionPlanSlice';

// 定义快照的数据结构
interface Snapshot {
  tasks: Task[];
  zones: Zone[];
  planGroups: PlanGroup[];
  dailyPlanSpans: DailyPlanSpan[];
}

export interface UndoState {
  past: Snapshot[];
  future: Snapshot[];
}

export interface UndoActions {
  saveSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

export type UndoSlice = UndoState & UndoActions;

export const createUndoSlice: StateCreator<
  UndoSlice & TaskSlice & ZoneSlice & ExecutionPlanSlice,
  [],
  [],
  UndoSlice
> = (set, get) => ({
  past: [],
  future: [],

  // 在执行破坏性操作前调用此方法
  saveSnapshot: () => {
    const { tasks, zones, planGroups, dailyPlanSpans } = get();
    // 深拷贝当前状态（防御性：某些测试切片组合可能缺失 zones/tasks）
    const currentSnapshot: Snapshot = {
      tasks: JSON.parse(JSON.stringify(tasks || [])),
      zones: JSON.parse(JSON.stringify(zones || [])),
      planGroups: JSON.parse(JSON.stringify(planGroups || [])),
      dailyPlanSpans: JSON.parse(JSON.stringify(dailyPlanSpans || [])),
    };

    set((state) => ({
      past: [...state.past, currentSnapshot].slice(-20), // 限制最多撤销 20 步，防止内存溢出
      future: [], // 新操作清空重做栈
    }));
  },

  undo: () => {
    const { past, future, tasks, zones, planGroups, dailyPlanSpans } = get();
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    // 保存当前状态到 future
    const currentSnapshot: Snapshot = { tasks, zones, planGroups, dailyPlanSpans };

    set({
      past: newPast,
      future: [currentSnapshot, ...future],
      tasks: previous.tasks,
      zones: previous.zones,
      planGroups: previous.planGroups,
      dailyPlanSpans: previous.dailyPlanSpans,
    });
  },

  redo: () => {
    const { past, future, tasks, zones, planGroups, dailyPlanSpans } = get();
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    // 保存当前状态到 past
    const currentSnapshot: Snapshot = { tasks, zones, planGroups, dailyPlanSpans };

    set({
      past: [...past, currentSnapshot],
      future: newFuture,
      tasks: next.tasks,
      zones: next.zones,
      planGroups: next.planGroups,
      dailyPlanSpans: next.dailyPlanSpans,
    });
  },

  clearHistory: () => set({ past: [], future: [] }),
});
