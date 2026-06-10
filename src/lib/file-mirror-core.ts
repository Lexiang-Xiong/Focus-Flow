// src/lib/file-mirror-core.ts
// file-mirror 的【纯逻辑】：序列化 / 解析 / 对账决策。
// 不依赖 Tauri、不依赖 store → 可单测、可被测试锁住（见 file-mirror-core.test.ts）。
// 副作用 / IO（读写文件、订阅 store、轮询）留在 file-mirror.ts。

import type { Task, Zone } from '@/types';

export const MIRROR_VERSION = 1;

export interface MirrorFile {
  version: number;
  exportedAt?: number;
  zones: Zone[];
  tasks: Task[];
}

export interface Snapshot {
  zones: Zone[];
  tasks: Task[];
}

// 启动 / 轮询对账的决策结果
export type SyncAction =
  | { kind: 'export' }                                // 用 store 修复 / 初始化文件
  | { kind: 'import'; zones: Zone[]; tasks: Task[] }  // 文件为准，导入 store
  | { kind: 'noop' };                                 // 一致，什么都不做

// 稳定序列化：深度排序对象键，使比较对【格式 / 键序】不敏感
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      return Object.keys(obj).sort().reduce((acc, k) => {
        acc[k] = obj[k];
        return acc;
      }, {} as Record<string, unknown>);
    }
    return v;
  });
}

export function sortById<T extends { id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// canonical：按 id 排序数组 + 深度排序键 → 只认真正的数据变化（忽略格式 / 顺序）。
// 这是回声锁的核心不变量：导出 / 导入都用它做基线比较，防止写→触发→再写的死循环。
export function canonical(zones: Zone[], tasks: Task[]): string {
  return stableStringify({ zones: sortById(zones), tasks: sortById(tasks) });
}

// 解析镜像文件：非法 JSON / 缺数组 → 返回 null（拒绝把损坏数据导入 store）
export function parseMirror(raw: string): MirrorFile | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tasks) || !Array.isArray(parsed?.zones)) return null;
    return { version: parsed.version ?? MIRROR_VERSION, zones: parsed.zones, tasks: parsed.tasks };
  } catch {
    return null;
  }
}

// 启动对账决策：文件 vs store 谁为准
export function decideBootAction(store: Snapshot, file: MirrorFile | null): SyncAction {
  // 文件缺失 / 损坏 → 用 store 数据初始化或修复文件
  if (!file) return { kind: 'export' };
  // 安全护栏：文件任务为空但 store 有任务 → 不让空 / 损坏文件覆盖好数据（用 store 修复）。
  // 代价：想"清空所有任务"得在 app 内做，离线清空文件不会生效——这是有意的防误删取舍。
  if (file.tasks.length === 0 && store.tasks.length > 0) return { kind: 'export' };
  // 文件与 store 不一致（含 app 关闭期间的外部编辑）→ 文件为准导入
  if (canonical(file.zones, file.tasks) !== canonical(store.zones, store.tasks)) {
    return { kind: 'import', zones: file.zones, tasks: file.tasks };
  }
  return { kind: 'noop' };
}

// 轮询对账决策：文件与基线比，决定是否导入
export function decidePollAction(file: MirrorFile | null, baseline: string | null): SyncAction {
  if (!file) return { kind: 'noop' };                       // 文件暂不可读 / 无效，跳过
  if (canonical(file.zones, file.tasks) !== baseline) {
    return { kind: 'import', zones: file.zones, tasks: file.tasks };
  }
  return { kind: 'noop' };
}
