// src/lib/file-mirror.ts
// 任务的本地 JSON 镜像层（Step 1）—— IO / 副作用层。
// ------------------------------------------------------------------
// 目标：把 tasks/zones 双向镜像到一个本地 JSON 文件，让 Claude Code 等外部
//       工具能直接编辑任务文件、app 自动拾取；同时给数据一份人类可读、可恢复
//       的副本（缓解 SQLite-in-WebView 的数据丢失问题）。
//
// 设计要点：
//   1. 不替换 SQLite：SQLite 仍是主存，本文件是【附加的】双向镜像。
//   2. 不动 storage-adapter 的防御锁：只读它的 hydration / switch 状态做 gate。
//   3. 读用【轮询】（readTextFile），不用原生 watch —— 当前 capability 未授予
//      fs:allow-watch，轮询零依赖、对 atomic-save 更鲁棒，自用 todo 完全够。
//   4. 回声锁：维护一个 canonical 基线，导出 / 导入都更新它，两个方向互不触发
//      死循环。纯逻辑（canonical / 对账决策）抽在 file-mirror-core.ts，已被单测锁住。
//   5. 只在 main 窗口运行，避免 float 窗口成为第二个写者。
// ------------------------------------------------------------------

import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Task, Zone } from '@/types';
import { useAppStore } from '@/store';
import { computeAllTaskTimes } from '@/store/slices/taskSlice';
import { getIsHydrated, getIsSwitching, getIsReloadingForSwitch } from '@/lib/storage-adapter';
import { persistentLog } from '@/lib/persistent-log';
import {
  MIRROR_VERSION,
  canonical,
  parseMirror,
  decideBootAction,
  decidePollAction,
  type MirrorFile,
} from '@/lib/file-mirror-core';

const MIRROR_FILENAME = 'focus-flow-tasks.json';
const POLL_INTERVAL_MS = 1500;
const EXPORT_DEBOUNCE_MS = 600;

let _started = false;
let _baseline: string | null = null;   // canonical(zones, tasks) 基线，回声锁用
let _didBootReconcile = false;          // 启动对账是否已完成
let _polling = false;                   // 防止 tick 重入
let _exportTimer: ReturnType<typeof setTimeout> | null = null;
let _mirrorPath: string | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function getMirrorPath(): Promise<string> {
  if (_mirrorPath) return _mirrorPath;
  const dir = await appDataDir();
  _mirrorPath = await join(dir, MIRROR_FILENAME);
  return _mirrorPath;
}

function readStoreSnapshot(): { zones: Zone[]; tasks: Task[] } {
  const state = useAppStore.getState();
  return { zones: (state.zones || []) as Zone[], tasks: (state.tasks || []) as Task[] };
}

// ---------------- 导出：store -> 文件 ----------------

// 无条件写文件 + 更新基线（启动初始化 / 修复用）
async function writeMirror(zones: Zone[], tasks: Task[]): Promise<void> {
  const payload: MirrorFile = { version: MIRROR_VERSION, exportedAt: Date.now(), zones, tasks };
  const path = await getMirrorPath();
  await writeTextFile(path, JSON.stringify(payload, null, 2));
  _baseline = canonical(zones, tasks);
}

function scheduleExport(): void {
  if (_exportTimer) clearTimeout(_exportTimer);
  _exportTimer = setTimeout(() => { void exportIfChanged(); }, EXPORT_DEBOUNCE_MS);
}

async function exportIfChanged(): Promise<void> {
  if (!isTauri()) return;
  // 未水合 / 启动对账未完成前不导出，避免初始空状态覆盖文件里的好数据
  if (!getIsHydrated() || !_didBootReconcile) return;
  if (getIsSwitching() || getIsReloadingForSwitch()) return;

  const { zones, tasks } = readStoreSnapshot();
  if (canonical(zones, tasks) === _baseline) return;  // 无实质变化（回声锁）

  try {
    await writeMirror(zones, tasks);
    persistentLog('FileMirror', 'exported to file', 'DEBUG', { tasks: tasks.length, zones: zones.length });
  } catch (e) {
    persistentLog('FileMirror', 'export failed', 'WARN', String(e));
  }
}

// ---------------- 导入：文件 -> store ----------------

async function readMirror(): Promise<MirrorFile | null> {
  const path = await getMirrorPath();
  if (!(await exists(path))) return null;
  const raw = await readTextFile(path);
  return parseMirror(raw);
}

function applySnapshot(zones: Zone[], tasks: Task[]): void {
  // 先更新基线，再 setState：这样 setState 触发的订阅导出会因 canonical 相等而跳过，
  // 不会把刚导入的文件又原样回写一遍（也避免回声死循环）。
  _baseline = canonical(zones, tasks);
  useAppStore.setState({ tasks, zones, taskComputedTimes: computeAllTaskTimes(tasks) });
  persistentLog('FileMirror', 'imported from file', 'INFO', { tasks: tasks.length, zones: zones.length });
}

// 启动对账：只跑一次，由纯函数 decideBootAction 决定文件 / store 谁为准
async function bootReconcile(): Promise<void> {
  const store = readStoreSnapshot();
  let file: MirrorFile | null = null;
  try {
    file = await readMirror();
  } catch (e) {
    persistentLog('FileMirror', 'boot read failed', 'WARN', String(e));
  }

  const action = decideBootAction(store, file);
  _didBootReconcile = true;

  if (action.kind === 'import') {
    applySnapshot(action.zones, action.tasks);          // 文件较新 → 导入
  } else if (action.kind === 'export') {
    await writeMirror(store.zones, store.tasks);          // 文件缺失 / 空 → 用 store 修复（无条件写）
    persistentLog('FileMirror', 'boot: initialized/healed mirror file', 'INFO');
  } else {
    _baseline = canonical(store.zones, store.tasks);     // 一致
  }
}

async function tick(): Promise<void> {
  if (_polling || !isTauri()) return;
  if (!getIsHydrated()) return;                          // 等水合完成
  if (getIsSwitching() || getIsReloadingForSwitch()) return;
  _polling = true;
  try {
    if (!_didBootReconcile) {
      await bootReconcile();
      return;
    }
    const file = await readMirror();
    const action = decidePollAction(file, _baseline);
    if (action.kind === 'import') {
      applySnapshot(action.zones, action.tasks);
    }
  } catch (e) {
    persistentLog('FileMirror', 'poll tick failed', 'WARN', String(e));
  } finally {
    _polling = false;
  }
}

export function initFileMirror(): void {
  if (_started || !isTauri()) return;
  // 只在 main 窗口运行，避免 float 窗口成为第二个写者
  try {
    if (getCurrentWindow().label !== 'main') return;
  } catch {
    return;
  }
  _started = true;

  // 导出：监听 tasks / zones 引用变化（防抖）
  useAppStore.subscribe((state, prev) => {
    if (state.tasks !== prev.tasks || state.zones !== prev.zones) {
      scheduleExport();
    }
  });

  // 导入：轮询文件
  setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
  void tick();  // 尽快尝试一次（水合后即对账）

  persistentLog('FileMirror', 'initialized', 'INFO', { interval: POLL_INTERVAL_MS });

  // 暴露给控制台调试：查看镜像文件路径
  (window as unknown as Record<string, unknown>).getMirrorPath = getMirrorPath;
}
