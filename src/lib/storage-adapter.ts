import type { StateStorage } from 'zustand/middleware';
import { dbGetItem, dbSetItem, dbRemoveItem } from '@/lib/db-legacy';

export const sqliteStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      let sqliteValue = null;
      try {
        sqliteValue = await dbGetItem(name);
      } catch (e) {
        console.warn('[Storage] SQLite read failed, falling back to local', e);
      }

      const localValue = localStorage.getItem(name);

      // 核心修复：如果 SQLite 空了但本地缓存还在（说明上次异常断电），自动恢复数据
      if (!sqliteValue && localValue) {
        console.log('[Storage] Recovered data from LocalStorage backup');
        try {
          await dbSetItem(name, localValue); // 尝试修复回 SQLite
        } catch (e) { /* ignore */ }
        return localValue;
      }

      return sqliteValue || localValue;
    } catch (error) {
      console.error('[Storage] Fatal error loading state:', error);
      return localStorage.getItem(name);
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    // 核心修复：同步强制写入 LocalStorage，确保异常断电或关闭时数据绝对保留
    localStorage.setItem(name, value);
    try {
      // 异步写入 SQLite 作为持久化备份
      await dbSetItem(name, value);
    } catch (error) {
      console.error('[Storage] Error saving to SQLite, ensured in local:', error);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    localStorage.removeItem(name);
    try {
      await dbRemoveItem(name);
    } catch (error) {
      console.error('[Storage] Error removing state:', error);
    }
  },
};
