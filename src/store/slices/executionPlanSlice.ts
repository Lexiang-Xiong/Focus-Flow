import type { StateCreator } from 'zustand';
import type { PlanGroup } from '@/types';
import type { TaskSlice } from './taskSlice';

export interface ExecutionPlanState {
  planGroups: PlanGroup[];
}

export interface ExecutionPlanActions {
  addPlanGroup: (name: string, startDate?: string | null, endDate?: string | null) => string;
  updatePlanGroup: (id: string, updates: Partial<Omit<PlanGroup, 'id'>>) => void;
  deletePlanGroup: (id: string) => void;
  reorderPlanGroups: (newOrder: PlanGroup[]) => void;
  getPlanGroupById: (id: string) => PlanGroup | undefined;
}

export type ExecutionPlanSlice = ExecutionPlanState & ExecutionPlanActions;

// 辅助函数：获取今天的本地日期字符串 YYYY-MM-DD
export function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// 辅助函数：判断计划组是否已过期
export function isPlanGroupExpired(group: PlanGroup, today: string = getTodayString()): boolean {
  return group.endDate !== null && group.endDate !== undefined && group.endDate < today;
}

// 辅助函数：判断某个日期是否落在计划组时间范围内
export function isDateInPlanGroupRange(group: PlanGroup, date: string): boolean {
  if (isPlanGroupExpired(group, date)) return false;
  if (!group.startDate && !group.endDate) return true; // 无时间组
  if (group.startDate && date < group.startDate) return false;
  if (group.endDate && date > group.endDate) return false;
  return true;
}

const createPlanGroup = (
  name: string,
  order: number,
  startDate?: string | null,
  endDate?: string | null
): PlanGroup => ({
  id: `plan-group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name,
  startDate: startDate ?? null,
  endDate: endDate ?? null,
  order,
  createdAt: Date.now(),
});

export const createExecutionPlanSlice: StateCreator<
  ExecutionPlanSlice & TaskSlice & { saveSnapshot?: () => void },
  [],
  [],
  ExecutionPlanSlice
> = (set, get) => ({
  planGroups: [],

  addPlanGroup: (name, startDate, endDate) => {
    get().saveSnapshot?.();

    let finalStartDate = startDate ?? null;
    let finalEndDate = endDate ?? null;

    // 保证 startDate <= endDate
    if (finalStartDate && finalEndDate && finalStartDate > finalEndDate) {
      const tmp = finalStartDate;
      finalStartDate = finalEndDate;
      finalEndDate = tmp;
    }

    const maxOrder = get().planGroups.length > 0
      ? Math.max(...get().planGroups.map(g => g.order))
      : -1;
    const newGroup = createPlanGroup(name, maxOrder + 1, finalStartDate, finalEndDate);

    set((state) => ({ planGroups: [...state.planGroups, newGroup] }));
    return newGroup.id;
  },

  updatePlanGroup: (id, updates) => {
    set((state) => {
      const existing = state.planGroups.find(g => g.id === id);
      if (!existing) return state;

      let merged = { ...existing, ...updates };
      // 保证 startDate <= endDate
      if (merged.startDate && merged.endDate && merged.startDate > merged.endDate) {
        const tmp = merged.startDate;
        merged.startDate = merged.endDate;
        merged.endDate = tmp;
      }

      return {
        planGroups: state.planGroups.map(g => g.id === id ? merged : g),
      };
    });
  },

  deletePlanGroup: (id) => {
    get().saveSnapshot?.();

    set((state) => {
      // 删除计划组时，清理所有任务对该计划组的引用
      const tasks = get().tasks.map(t => {
        if (!t.planGroupIds?.includes(id)) return t;
        return {
          ...t,
          planGroupIds: t.planGroupIds.filter(groupId => groupId !== id),
        };
      });

      return {
        planGroups: state.planGroups.filter(g => g.id !== id),
        tasks,
      };
    });
  },

  reorderPlanGroups: (newOrder) => set({ planGroups: newOrder }),

  getPlanGroupById: (id) => get().planGroups.find(g => g.id === id),
});
