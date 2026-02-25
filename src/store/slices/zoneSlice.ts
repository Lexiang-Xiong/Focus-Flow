import type { StateCreator } from 'zustand';
import type { Zone } from '@/types';
import type { TaskSlice } from './taskSlice';

export interface ZoneState {
  zones: Zone[];
}

export interface ZoneActions {
  addZone: (name: string, color: string) => void;
  updateZone: (id: string, updates: Partial<Zone>) => void;
  deleteZone: (id: string) => void;
  reorderZones: (newOrder: Zone[]) => void;
  getZoneById: (id: string) => Zone | undefined;
}

export type ZoneSlice = ZoneState & ZoneActions;

// 辅助函数：创建新分区
const createZone = (name: string, color: string, order: number): Zone => ({
  id: `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name,
  color,
  order,
  createdAt: Date.now(),
});

export const createZoneSlice: StateCreator<ZoneSlice & TaskSlice, [], [], ZoneSlice> = (set, get) => ({
  zones: [],

  addZone: (name, color) => set((state) => {
    const maxOrder = state.zones.length > 0 ? Math.max(...state.zones.map(z => z.order)) : -1;
    const newZone = createZone(name, color, maxOrder + 1);
    return { zones: [...state.zones, newZone] };
  }),

  updateZone: (id, updates) => set((state) => ({
    zones: state.zones.map(z => z.id === id ? { ...z, ...updates } : z)
  })),

  deleteZone: (id) => set((state) => {
    // 删除分区时，同时删除该分区下的所有任务
    const tasks = get().tasks.filter(t => t.zoneId !== id);
    return {
      zones: state.zones.filter(z => z.id !== id),
      tasks,
    };
  }),

  reorderZones: (newOrder) => set({ zones: newOrder }),

  getZoneById: (id) => get().zones.find(z => z.id === id),
});
