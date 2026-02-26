import type { StateCreator } from 'zustand';
import type { Template, SortConfig } from '@/types';
import { DEFAULT_SETTINGS, PREDEFINED_TEMPLATES } from '@/types';
import type { ZoneSlice } from './zoneSlice';

export interface SettingsState {
  settings: {
    workDuration: number;
    breakDuration: number;
    longBreakDuration: number;
    autoStartBreak: boolean;
    soundEnabled: boolean;
    collapsed: boolean;
    collapsePosition: { x: number; y: number };
    globalViewSort: SortConfig;
    globalViewLeafMode: boolean;
  };
  customTemplates: Template[];
}

export interface SettingsActions {
  updateSettings: (settings: Partial<SettingsState['settings']>) => void;
  saveCustomTemplate: (name: string) => void;
  deleteCustomTemplate: (id: string) => void;
  renameCustomTemplate: (id: string, newName: string) => void;
  applyTemplate: (templateId: string) => void;
}

export type SettingsSlice = SettingsState & SettingsActions;

export const createSettingsSlice: StateCreator<SettingsSlice & ZoneSlice, [], [], SettingsSlice> = (set, get) => ({
  settings: DEFAULT_SETTINGS,
  customTemplates: [],

  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),

  saveCustomTemplate: (name) => set((state) => {
    const zones = get().zones.map(z => ({
      name: z.name,
      color: z.color,
      order: z.order,
    }));

    const newTemplate: Template = {
      id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description: `自定义模板 - ${zones.length} 个分区`,
      icon: 'User',
      zones,
    };

    return { customTemplates: [...state.customTemplates, newTemplate] };
  }),

  deleteCustomTemplate: (id) => set((state) => ({
    customTemplates: state.customTemplates.filter(t => t.id !== id)
  })),

  renameCustomTemplate: (id, newName) => set((state) => ({
    customTemplates: state.customTemplates.map(t =>
      t.id === id ? { ...t, name: newName } : t
    )
  })),

  applyTemplate: (templateId) => set((state) => {
    const predefined = PREDEFINED_TEMPLATES.find(t => t.id === templateId);
    const custom = state.customTemplates.find(t => t.id === templateId);
    const template = predefined || custom;

    if (!template) return state;

    const newZones = template.zones.map((z, index) => ({
      id: `zone-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      name: z.name,
      color: z.color,
      order: z.order,
      createdAt: Date.now(),
    }));

    return { zones: newZones, tasks: [] };
  }),
});
