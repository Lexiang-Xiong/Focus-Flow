import type { StateStorage } from 'zustand/middleware';
import { dbGetItem, dbSetItem, dbRemoveItem } from '@/lib/db';

export const sqliteStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      console.log(`[SQLite] Loading state for key: ${name}`);

      // 1. 尝试从 SQLite 读取
      const value = await dbGetItem(name);

      if (value) {
        return value;
      }

      // 2. [迁移逻辑] 如果 SQLite 为空，检查 LocalStorage 是否有旧数据
      const legacyData = localStorage.getItem(name);
      if (legacyData) {
        console.log('[SQLite] Migrating data from LocalStorage...');
        // 将旧数据写入 SQLite
        await dbSetItem(name, legacyData);
        // 可选：迁移后清除旧数据，或者保留作为备份
        // localStorage.removeItem(name);
        return legacyData;
      }

      return null;
    } catch (error) {
      console.error('[SQLite] Error loading state:', error);
      // 降级回退：如果数据库挂了，尝试读 LocalStorage 防止白屏
      return localStorage.getItem(name);
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      // 写入 SQLite
      await dbSetItem(name, value);
    } catch (error) {
      console.error('[SQLite] Error saving state:', error);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await dbRemoveItem(name);
    } catch (error) {
      console.error('[SQLite] Error removing state:', error);
    }
  },
};
