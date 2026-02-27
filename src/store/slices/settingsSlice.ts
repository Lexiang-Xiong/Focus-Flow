import type { StateCreator } from 'zustand';
import type { Template, SortConfig, ConfigProfile, RecurringTemplate } from '@/types';
import { DEFAULT_SETTINGS, PREDEFINED_TEMPLATES } from '@/types';
import type { ZoneSlice } from './zoneSlice';
import type { TaskSlice } from './taskSlice';

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
    autoSaveEnabled: boolean;
    autoSaveInterval: number;
  };
  customTemplates: Template[];
  configProfiles: ConfigProfile[];
}

export interface SettingsActions {
  updateSettings: (settings: Partial<SettingsState['settings']>) => void;
  saveCustomTemplate: (name: string) => void;
  deleteCustomTemplate: (id: string) => void;
  renameCustomTemplate: (id: string, newName: string) => void;
  applyTemplate: (templateId: string) => void;
  saveConfigProfile: (name: string, globalRules: RecurringTemplate[]) => void;
  applyConfigProfile: (profileId: string) => void;
  deleteConfigProfile: (id: string) => void;
  updateConfigProfile: (id: string, updates: Partial<ConfigProfile>) => void;
  importConfigProfile: (importedData: Partial<ConfigProfile>) => boolean;
}

export type SettingsSlice = SettingsState & SettingsActions;

export const createSettingsSlice: StateCreator<SettingsSlice & ZoneSlice & TaskSlice, [], [], SettingsSlice> = (set, get) => ({
  settings: DEFAULT_SETTINGS,
  customTemplates: [],
  configProfiles: [],

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

  saveConfigProfile: (name, globalRules) => set((state) => {
    const newProfile: ConfigProfile = {
      id: `profile-${Date.now()}`,
      name,
      createdAt: Date.now(),
      settings: JSON.parse(JSON.stringify(state.settings)),
      customTemplates: JSON.parse(JSON.stringify(state.customTemplates)),
      recurringTemplates: JSON.parse(JSON.stringify(globalRules)),
    };
    return { configProfiles: [newProfile, ...(state.configProfiles || [])] };
  }),

  applyConfigProfile: (profileId) => set((state) => {
    const profile = state.configProfiles?.find(p => p.id === profileId);
    if (!profile) return state;

    // 智能回退防崩：如果规则的 zoneId 当前工作区没有，降级到第一个可用分区
    const currentZones = get().zones;
    const fallbackZoneId = currentZones.length > 0 ? currentZones[0].id : '';
    const validRules = profile.recurringTemplates.map(rule => ({
      ...rule,
      zoneId: currentZones.some(z => z.id === rule.zoneId) ? rule.zoneId : fallbackZoneId
    }));

    // 合并逻辑：保留当前的局部规则，替换全局规则为快照中的全局规则
    const allCurrentRules = (state as any).recurringTemplates || [];
    const localRules = allCurrentRules.filter((r: RecurringTemplate) => r.scope === 'workspace');
    const mergedRules = [...localRules, ...validRules];

    return {
      settings: profile.settings,
      customTemplates: profile.customTemplates,
      recurringTemplates: mergedRules,
    } as SettingsState & { recurringTemplates: RecurringTemplate[] };
  }),

  deleteConfigProfile: (id) => set((state) => ({
    configProfiles: (state.configProfiles || []).filter(p => p.id !== id)
  })),

  updateConfigProfile: (id, updates) => set((state) => ({
    configProfiles: (state.configProfiles || []).map(p =>
      p.id === id ? { ...p, ...updates } : p
    )
  })),

  importConfigProfile: (parsed) => {
    try {
      if (!parsed || !parsed.settings) return false;

      const newProfile: ConfigProfile = {
        id: `profile-imported-${Date.now()}`,
        name: parsed.name || `导入配置 ${new Date().toLocaleDateString()}`,
        createdAt: Date.now(),
        settings: parsed.settings,
        customTemplates: parsed.customTemplates || [],
        recurringTemplates: parsed.recurringTemplates || [],
      };

      set((state) => ({
        configProfiles: [newProfile, ...(state.configProfiles || [])]
      }));
      return true;
    } catch {
      return false;
    }
  },
});
