// src/lib/file-mirror-engine.ts
// file-mirror 的【编排逻辑】，依赖注入、无副作用——可单测（见 file-mirror-engine.test.ts）。
// 真实依赖（Tauri 文件读写 / store 读写 / 时间）在 file-mirror.ts 注入；测试注入假依赖。
// 它持有同步状态机：baseline（回声锁基线）、didBoot（启动对账完成）、polling（防重入）。

import type { Task, Zone, PlanGroup } from '@/types';
import {
  MIRROR_VERSION,
  canonical,
  parseMirror,
  decideBootAction,
  decidePollAction,
  type MirrorFile,
  type Snapshot,
} from '@/lib/file-mirror-core';

export type MirrorLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface MirrorEngineDeps {
  readRaw: () => Promise<string | null>;          // 读镜像文件原文，缺失返回 null
  writeRaw: (content: string) => Promise<void>;   // 写镜像文件
  getSnapshot: () => Snapshot;                     // 当前 store {zones, tasks, planGroups}
  applySnapshot: (zones: Zone[], tasks: Task[], planGroups: PlanGroup[]) => void;  // 把文件数据导入 store
  now?: () => number;                              // exportedAt 时间戳（测试可注入）
  log?: (level: MirrorLogLevel, message: string, data?: unknown) => void;
}

export interface MirrorEngine {
  bootReconcile: () => Promise<void>;
  pollOnce: () => Promise<void>;
  handleStoreChange: () => Promise<void>;
  readonly didBoot: boolean;
  readonly baseline: string | null;
}

export function createMirrorEngine(deps: MirrorEngineDeps): MirrorEngine {
  const now = deps.now ?? (() => 0);
  const log = deps.log ?? (() => {});

  let baseline: string | null = null;
  let didBoot = false;
  let polling = false;

  function serialize(zones: Zone[], tasks: Task[], planGroups: PlanGroup[]): string {
    const payload: MirrorFile = { version: MIRROR_VERSION, exportedAt: now(), zones, tasks, planGroups };
    return JSON.stringify(payload, null, 2);
  }

  async function writeMirror(zones: Zone[], tasks: Task[], planGroups: PlanGroup[]): Promise<void> {
    await deps.writeRaw(serialize(zones, tasks, planGroups));
    baseline = canonical(zones, tasks, planGroups);
  }

  async function readMirror(): Promise<MirrorFile | null> {
    const raw = await deps.readRaw();
    if (raw == null) return null;
    return parseMirror(raw);
  }

  function doImport(zones: Zone[], tasks: Task[], planGroups: PlanGroup[]): void {
    // 先更新基线再导入：导入触发的 store 变化在 handleStoreChange 里会因 canonical 相等而跳过，
    // 不会把刚导入的数据又回写文件（避免回声死循环）。
    baseline = canonical(zones, tasks, planGroups);
    deps.applySnapshot(zones, tasks, planGroups);
  }

  async function bootReconcile(): Promise<void> {
    const store = deps.getSnapshot();
    let file: MirrorFile | null = null;
    try {
      file = await readMirror();
    } catch (e) {
      log('WARN', 'boot read failed', e);
    }

    const action = decideBootAction(store, file);
    didBoot = true;

    if (action.kind === 'import') {
      doImport(action.zones, action.tasks, action.planGroups ?? []);
      log('INFO', 'boot: imported from file', { tasks: action.tasks.length, zones: action.zones.length, planGroups: action.planGroups?.length ?? 0 });
    } else if (action.kind === 'export') {
      await writeMirror(store.zones, store.tasks, store.planGroups);   // 无条件写：文件缺失 / 空 → 用 store 初始化或修复
      log('INFO', 'boot: initialized/healed mirror file');
    } else {
      baseline = canonical(store.zones, store.tasks, store.planGroups);
    }
  }

  async function pollOnce(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      if (!didBoot) {
        await bootReconcile();
        return;
      }
      const file = await readMirror();
      const action = decidePollAction(file, baseline);
      if (action.kind === 'import') {
        doImport(action.zones, action.tasks, action.planGroups ?? []);
        log('INFO', 'poll: imported from file', { tasks: action.tasks.length, zones: action.zones.length, planGroups: action.planGroups?.length ?? 0 });
      }
    } catch (e) {
      log('WARN', 'poll failed', e);
    } finally {
      polling = false;
    }
  }

  async function handleStoreChange(): Promise<void> {
    if (!didBoot) return;                                  // 启动对账前的变化丢弃（boot 会写当前 store）
    const { zones, tasks, planGroups } = deps.getSnapshot();
    if (canonical(zones, tasks, planGroups) === baseline) return;      // 无实质变化（回声锁）
    try {
      await writeMirror(zones, tasks, planGroups);
      log('DEBUG', 'exported to file', { tasks: tasks.length, zones: zones.length, planGroups: planGroups.length });
    } catch (e) {
      log('WARN', 'export failed', e);
    }
  }

  return {
    bootReconcile,
    pollOnce,
    handleStoreChange,
    get didBoot() { return didBoot; },
    get baseline() { return baseline; },
  };
}
