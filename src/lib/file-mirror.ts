// src/lib/file-mirror.ts
// 任务的本地 JSON 镜像层（Step 1）—— wiring 层：把真实依赖注入 engine。
// ------------------------------------------------------------------
// 目标：把 tasks/zones 双向镜像到一个本地 JSON 文件，让 Claude Code 等外部
//       工具能直接编辑任务文件、app 自动拾取；同时给数据一份人类可读、可恢复
//       的副本（缓解 SQLite-in-WebView 的数据丢失问题）。
//
// 分层：
//   - file-mirror-core.ts   纯逻辑（序列化 / canonical 回声锁 / 对账决策），单测锁住
//   - file-mirror-engine.ts 编排状态机（依赖注入、无副作用），单测锁住
//   - file-mirror.ts (本文件) 只负责：注入真实 Tauri/store 依赖 + 启动订阅与轮询 + gate
//
// 要点：
//   1. 不替换 SQLite：SQLite 仍是主存，本文件是【附加的】双向镜像。
//   2. 不动 storage-adapter 的防御锁：只读它的 hydration / switch 状态做 gate。
//   3. 读用【轮询】（readTextFile），不用原生 watch（当前 capability 未授予 fs:allow-watch）。
//   4. 只在 main 窗口运行，避免 float 窗口成为第二个写者。
// ------------------------------------------------------------------

import { appDataDir, join } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Task, Zone, PlanGroup } from '@/types';
import { useAppStore } from '@/store';
import { computeAllTaskTimes } from '@/store/slices/taskSlice';
import { getIsHydrated, getIsSwitching, getIsReloadingForSwitch } from '@/lib/storage-adapter';
import { persistentLog } from '@/lib/persistent-log';
import { createMirrorEngine } from '@/lib/file-mirror-engine';

const MIRROR_FILENAME = 'focus-flow-tasks.json';
const POLL_INTERVAL_MS = 1500;
const EXPORT_DEBOUNCE_MS = 600;

let _started = false;
let _exportTimer: ReturnType<typeof setTimeout> | null = null;
let _mirrorPath: string | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// gate：只有水合完成、且不在目录切换中，才允许镜像读写
function isReady(): boolean {
  return getIsHydrated() && !getIsSwitching() && !getIsReloadingForSwitch();
}

async function getMirrorPath(): Promise<string> {
  if (_mirrorPath) return _mirrorPath;
  const dir = await appDataDir();
  _mirrorPath = await join(dir, MIRROR_FILENAME);
  return _mirrorPath;
}

// 注入真实依赖：Tauri 文件读写 + store 读写 + 时间 + 日志
const engine = createMirrorEngine({
  readRaw: async () => {
    const path = await getMirrorPath();
    if (!(await exists(path))) return null;
    return await readTextFile(path);
  },
  writeRaw: async (content) => {
    const path = await getMirrorPath();
    await writeTextFile(path, content);
  },
  getSnapshot: () => {
    const state = useAppStore.getState();
    return {
      zones: (state.zones || []) as Zone[],
      tasks: (state.tasks || []) as Task[],
      planGroups: (state.planGroups || []) as PlanGroup[],
    };
  },
  applySnapshot: (zones, tasks, planGroups) => {
    useAppStore.setState({ tasks, zones, planGroups, taskComputedTimes: computeAllTaskTimes(tasks) });
  },
  now: () => Date.now(),
  log: (level, message, data) => persistentLog('FileMirror', message, level, data),
});

function scheduleExport(): void {
  if (_exportTimer) clearTimeout(_exportTimer);
  _exportTimer = setTimeout(() => {
    if (!isTauri() || !isReady()) return;
    void engine.handleStoreChange();
  }, EXPORT_DEBOUNCE_MS);
}

async function tick(): Promise<void> {
  if (!isTauri() || !isReady()) return;
  await engine.pollOnce();
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
    if (state.tasks !== prev.tasks || state.zones !== prev.zones || state.planGroups !== prev.planGroups) {
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
