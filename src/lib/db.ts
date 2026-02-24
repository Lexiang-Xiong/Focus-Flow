import Database from '@tauri-apps/plugin-sql';

const DB_NAME = 'focus_flow.db';

// 单例模式保持数据库连接
let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  try {
    // 加载数据库
    dbInstance = await Database.load(`sqlite:${DB_NAME}`);

    // 初始化表结构：我们使用一个简单的 Key-Value 表来存储 Zustand 的快照
    await dbInstance.execute(`
      CREATE TABLE IF NOT EXISTS store_snapshots (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );
    `);

    // 预留：未来做附件功能时，会在这里创建 attachments 表
    // await dbInstance.execute(`CREATE TABLE IF NOT EXISTS attachments ...`);

    return dbInstance;
  } catch (error) {
    console.error('Failed to load database:', error);
    throw error;
  }
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