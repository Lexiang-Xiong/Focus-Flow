import { useAppStore } from '@/store';
import { changeDbPath } from '@/lib/db';
import { toast } from 'sonner';
import { getIsHydrated, setIsSwitching } from './storage-adapter';

const TEST_KEY = 'FOCUS_FLOW_AUTO_TEST_STATE';

interface TestState {
  isRunning: boolean;
  iteration: number;
  maxIterations: number;
  dirA: string;
  dirB: string;
  currentDir: 'A' | 'B';
}

const debugLog = (msg: string, data?: unknown) => {
  console.log(`[AutoTester] ${msg}`, data || '');
};

// 进度 DOM 元素引用
let _progressElement: HTMLElement | null = null;

// 创建进度显示元素
function createProgressElement(): HTMLElement {
  if (_progressElement) return _progressElement;

  const el = document.createElement('div');
  el.id = 'auto-test-progress';
  el.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 16px;
    font-weight: 600;
    z-index: 9999;
    box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
    display: flex;
    align-items: center;
    gap: 12px;
  `;
  document.body.appendChild(el);
  _progressElement = el;
  return el;
}

// 更新进度显示
function updateProgress(current: number, total: number, message: string = '') {
  const el = createProgressElement();
  const percent = Math.round((current / total) * 100);
  el.innerHTML = `
    <span style="font-size: 20px;">🔄</span>
    <span>测试进度: ${current}/${total} (${percent}%)</span>
    <span style="opacity: 0.8; margin-left: 8px;">${message}</span>
  `;
}

// 清除进度显示
export function clearProgress() {
  if (_progressElement) {
    _progressElement.remove();
    _progressElement = null;
  }
}

const AutoTesterObject = {
  // 启动测试
  start: (dirA: string, dirB: string, maxIterations: number = 20) => {
    // 检测当前路径，确定我们已经在哪个目录
    const currentDbPath = localStorage.getItem('FOCUS_FLOW_DB_PATH') || '';
    let currentDir: 'A' | 'B' = 'A';

    // 如果当前路径包含 dirB 的路径，说明已经在 B
    if (currentDbPath.includes(dirB.replace(/\\/g, '/'))) {
      currentDir = 'B';
    }

    console.log('[AutoTester] Detected current path:', currentDbPath);
    console.log('[AutoTester] Detected current directory:', currentDir);

    const state: TestState = {
      isRunning: true,
      iteration: 0,
      maxIterations,
      dirA,
      dirB,
      currentDir: currentDir
    };
    localStorage.setItem(TEST_KEY, JSON.stringify(state));
    debugLog('TEST_START', state);

    // 显示进度条
    updateProgress(0, maxIterations, '正在启动测试...');

    // 立即开始第一次切换
    AutoTesterObject.runCycle();
  },

  // 停止测试
  stop: () => {
    localStorage.removeItem(TEST_KEY);
    debugLog('TEST_STOPPED_BY_USER');
    toast.info("自动化测试已停止");
  },

  // 执行切换循环
  runCycle: async () => {
    const rawState = localStorage.getItem(TEST_KEY);
    if (!rawState) return;

    const state: TestState = JSON.parse(rawState);
    if (!state.isRunning) return;

    // 准备下一次切换
    const nextDirTarget = state.currentDir === 'A' ? 'B' : 'A';
    // 标准化路径格式（统一使用 /）
    const nextPath = (nextDirTarget === 'A' ? state.dirA : state.dirB).replace(/\\/g, '/');

    console.log(`[AutoTester] 🔄 Switching to ${nextDirTarget} (iteration ${state.iteration + 1}/${state.maxIterations})`);
    debugLog('TEST_SWITCHING_TO', { nextDirTarget, nextPath });

    // 更新状态 - 注意：在切换之前更新状态，这样 reload 后可以继续
    state.iteration++;
    state.currentDir = nextDirTarget;
    localStorage.setItem(TEST_KEY, JSON.stringify(state));

    // 更新进度条
    updateProgress(state.iteration, state.maxIterations, `→ 切换到目录${nextDirTarget}`);

    console.log(`[AutoTester] 🚀 About to call changeDbPath to: ${nextPath}`);
    toast.loading(`自动化测试进行中: ${state.iteration}/${state.maxIterations}，页面即将切换...`);

    // 🚨 关键修复：清除保存的路径，强制执行切换
    // 否则 changeDbPath 会检测到相同路径而提前返回
    localStorage.removeItem('FOCUS_FLOW_DB_PATH');

    // 触发切换
    try {
      await changeDbPath(nextPath);

      // 🚨 强制刷新页面以确保状态完全重置
      console.log('[AutoTester] Forcing page reload...');
      window.location.reload();
    } catch (error) {
      console.error('[AutoTester] changeDbPath failed:', error);
      debugLog('TEST_SWITCH_FAILED', String(error));
      // 失败后停止测试
      AutoTesterObject.stop();
    }
  },

  // 每次应用启动时调用此函数
  checkAndRun: async () => {
    // 重要：重置切换锁，防止卡死
    console.log('[AutoTester] Resetting switch lock on resume');
    setIsSwitching(false);

    const rawState = localStorage.getItem(TEST_KEY);
    console.log('[AutoTester] checkAndRun called, rawState:', rawState);
    if (!rawState) {
      console.log('[AutoTester] No test state found, returning');
      return;
    }

    const state: TestState = JSON.parse(rawState);
    console.log('[AutoTester] Parsed state:', state);

    // 如果测试没有在运行，直接返回
    if (!state.isRunning) {
      console.log('[AutoTester] Test not running, returning');
      return;
    }

    // 检查是否刚刚切换过目录（避免无限循环）
    const debugAction = localStorage.getItem('DEBUG_LAST_ACTION');
    console.log('[AutoTester] DEBUG_LAST_ACTION:', debugAction);

    debugLog('TEST_RESUME_CHECK', { iteration: state.iteration, isHydrated: getIsHydrated() });

    console.log(`[AutoTester] ⏳ Waiting for hydration (iteration ${state.iteration})...`);

    // 等待 Zustand Hydration
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('[AutoTester] ✅ Hydration complete, isHydrated:', getIsHydrated());

    const tasks = useAppStore.getState().tasks;
    const zones = useAppStore.getState().zones;
    // 记录当前目录路径用于调试
    const currentPath = localStorage.getItem('focus-flow-db-path');
    debugLog('TEST_DATA_CHECK', { taskCount: tasks.length, zoneCount: zones.length, iteration: state.iteration, currentPath });

    // === 新逻辑：先判断是否需要播种数据 ===

    // 如果还没有任何数据（第一次运行或数据确实丢失），先播种
    if (tasks.length === 0) {
      debugLog('TEST_SEEDING_DATA', { iteration: state.iteration });

      // 如果没有 zone，先创建一个
      if (zones.length === 0) {
        useAppStore.getState().addZone('Test Zone', '#ff0000');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const currentZones = useAppStore.getState().zones;
      if (currentZones.length > 0) {
        useAppStore.getState().addTask(currentZones[0].id, `Test Task ${Date.now()}`, '');
        // 等待保存到存储
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // 播种完成后再检查一次数据
      const tasksAfterSeed = useAppStore.getState().tasks;
      debugLog('TEST_SEEDED_DATA', { taskCount: tasksAfterSeed.length });

      // 如果这是第一次运行（iteration === 0），播种完后直接执行切换
      if (state.iteration === 0) {
        debugLog('TEST_FIRST_RUN_SEEDED');
        // 延迟一下确保数据已保存
        await new Promise(resolve => setTimeout(resolve, 500));
        AutoTesterObject.runCycle();
        return;
      }
    }

    // === 数据检查逻辑 ===
    // 只有在 iteration > 0 且数据为空时才报错
    // 重新获取一次 tasks，因为上面可能播种了数据
    const finalTasks = useAppStore.getState().tasks;
    debugLog('FINAL_DATA_CHECK', { taskCount: finalTasks.length, iteration: state.iteration });

    console.log(`[AutoTester] 📊 Data check: ${finalTasks.length} tasks, iteration: ${state.iteration}`);

    if (finalTasks.length === 0 && state.iteration > 0) {
      // 严重错误：非初次运行，但数据为空！
      debugLog('TEST_FAILURE_DATA_LOST', 'Tasks are empty!');
      alert(`[测试失败] 第 ${state.iteration} 次迭代后数据丢失！请查看控制台日志。`);
      AutoTesterObject.stop();
      return;
    }

    // 2. 检查是否完成
    if (state.iteration >= state.maxIterations) {
      debugLog('TEST_COMPLETE_SUCCESS');
      alert(`[测试通过] 成功完成了 ${state.maxIterations} 次切换，未发现数据丢失。`);
      AutoTesterObject.stop();
      return;
    }

    // 4. 执行切换
    console.log(`[AutoTester] ⏩ Proceeding to next iteration (${state.iteration + 1}/${state.maxIterations})`);
    // 延迟一下确保数据已保存
    await new Promise(resolve => setTimeout(resolve, 500));
    AutoTesterObject.runCycle();
  }
};

// 挂载到 window 上以便在控制台中访问
(window as unknown as { AutoTester: typeof AutoTesterObject }).AutoTester = AutoTesterObject;

export const AutoTester = AutoTesterObject;
