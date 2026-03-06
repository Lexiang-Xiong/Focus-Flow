import Database from '@tauri-apps/plugin-sql';
import { getDbPath } from './db';

// 使用单例 Promise 防止并发冲突
let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      const dbPath = await getDbPath();
      const db = await Database.load(`sqlite:${dbPath}`);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS store_snapshots (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at INTEGER
        );
      `);

      return db;
    } catch (error) {
      console.error('Failed to load legacy database:', error);
      dbPromise = null;
      throw error;
    }
  })();

  return dbPromise;
}

// 核心 API：保存键值对
export async function dbSetItem(key: string, value: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  // upsert 逻辑：如果存在则更新，不存在则插入
  await db.execute(
    `INSERT INTO store_snapshots (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now]
  );
}

// 核心 API：读取键值对
export async function dbGetItem(key: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.select<{ value: string }[]>(
    `SELECT value FROM store_snapshots WHERE key = $1`,
    [key]
  );
  return result.length > 0 ? result[0].value : null;
}

// 核心 API：删除键值对
export async function dbRemoveItem(key: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM store_snapshots WHERE key = $1`, [key]);
}
