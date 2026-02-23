import { useState, useCallback, useEffect, useRef } from 'react';
import { FloatWindow } from '@/components/FloatWindow';
import { PomodoroTimer } from '@/components/PomodoroTimer';
import { ZoneManager } from '@/components/ZoneManager';
import { TaskList } from '@/components/TaskList';
import { GlobalView } from '@/components/GlobalView';
import { HistoryManager } from '@/components/HistoryManager';
import { SettingsPanel } from '@/components/SettingsPanel';
import { CollapseButton } from '@/components/CollapseButton';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useStorage } from '@/hooks/useStorage';
import { useZones } from '@/hooks/useZones';
import { useTasks } from '@/hooks/useTasks';
import { useTimer } from '@/hooks/useTimer';
import { useClipboard } from '@/hooks/useClipboard';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import type { TimerMode } from '@/types';
import './App.css';

function App() {
  const {
    data,
    isLoaded,
    updateZones,
    updateTasks,
    updateSettings,
    setCurrentView,
    setActiveZoneId,

    archiveCurrentWorkspace,
    restoreFromHistory,
    createNewWorkspace,
    deleteHistoryWorkspace,
    renameHistoryWorkspace,
    updateHistorySummary,
  } = useStorage();

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // 使用ref存储activeTaskId和tasks，确保计时器回调中能获取最新值
  const activeTaskIdRef = useRef<string | null>(null);
  const tasksRef = useRef<typeof data.currentWorkspace.tasks>([]);
  const timerRef = useRef<{ isRunning: boolean; mode: string }>({ isRunning: false, mode: 'idle' });

  // 使用当前工作区的数据
  const {
    zones,
    addZone,
    updateZone,
    deleteZone,
    applyTemplate,
    getZoneById,
    templates,
  } = useZones(
    data.currentWorkspace.zones,
    data.currentWorkspace.tasks,
    updateZones,
    updateTasks
  );

  const {
    tasks,
    getTasksByZone,
    addTask,
    toggleTask,
    deleteTask,
    updateTask,
    toggleExpanded,
    toggleSubtasksCollapsed,
    reorderTasks,
    clearCompleted,
    stats,
  } = useTasks(data.currentWorkspace.tasks, updateTasks);

  // 同步ref和state（在tasks声明之后）
  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // 处理计时器滴答，累计任务时间
  const handleTimerTick = useCallback(() => {
    // 使用ref获取最新的activeTaskId、tasks和timer状态，避免闭包问题
    const currentActiveTaskId = activeTaskIdRef.current;
    const currentTasks = tasksRef.current;
    const currentTimer = timerRef.current;

    if (currentActiveTaskId && currentTimer.isRunning && currentTimer.mode === 'work') {
      const task = currentTasks.find(t => t.id === currentActiveTaskId);
      if (task) {
        updateTask(currentActiveTaskId, {
          totalWorkTime: (task.totalWorkTime || 0) + 1
        });
      }
    }
  }, [updateTask]);

  const handleTimerComplete = useCallback((mode: TimerMode, _duration: number) => {
    if (mode === 'work' && activeTaskId) {
      const task = tasks.find(t => t.id === activeTaskId);
      if (task) {
        toast.success('专注完成！', {
          description: `任务 "${task.title}" 累计工作 ${Math.floor((task.totalWorkTime || 0) / 60)} 分钟`,
        });
      }
    } else if (mode === 'break' || mode === 'longBreak') {
      toast.info('休息结束', {
        description: '准备好开始新的专注了吗？',
      });
    }
  }, [activeTaskId, tasks]);

  const timer = useTimer({
    workDuration: data.settings.workDuration,
    breakDuration: data.settings.breakDuration,
    longBreakDuration: data.settings.longBreakDuration,
    autoStartBreak: data.settings.autoStartBreak,
    soundEnabled: data.settings.soundEnabled,
    onComplete: handleTimerComplete,
    onTick: handleTimerTick,
  });

  // 剪贴板功能
  const {
    copyTask,
    copyZone,
    pasteTask,
    pasteZone,
    hasTask,
    hasZone,
  } = useClipboard();

  // 同步timerRef（在timer声明之后）
  useEffect(() => {
    timerRef.current = { isRunning: timer.isRunning, mode: timer.mode };
  }, [timer.isRunning, timer.mode]);

  // 使用 ref 追踪当前模式，避免无限循环
  const currentModeRef = useRef<TimerMode>('work');
  useEffect(() => {
    currentModeRef.current = timer.mode;
  }, [timer.mode]);

  // 监听 settings 变化，当 timer 在 idle 状态时同步更新时间，保持当前模式
  useEffect(() => {
    if (timer.mode === 'idle' && !timer.isRunning) {
      // 根据当前模式选择对应的时长
      const targetDuration = currentModeRef.current === 'break'
        ? data.settings.breakDuration
        : currentModeRef.current === 'longBreak'
        ? data.settings.longBreakDuration
        : data.settings.workDuration;

      if (timer.timeRemaining !== targetDuration) {
        timer.updateTime(targetDuration);
      }
    }
  }, [data.settings.workDuration, data.settings.breakDuration, data.settings.longBreakDuration]);

  // 键盘快捷键监听（Ctrl+C / Ctrl+V）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略在输入框中的快捷键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 获取当前选中的工作区
      const currentZone = getZoneById(data.activeZoneId || '') || null;

      // Ctrl+C - 复制
      if (e.ctrlKey && e.key === 'c') {
        // 优先复制任务（如果选中了任务）
        if (activeTaskId) {
          const task = tasks.find(t => t.id === activeTaskId);
          if (task) {
            copyTask(task);
            toast.success('任务已复制');
            return;
          }
        }
        // 否则复制工作区
        if (currentZone) {
          const zoneTasks = tasks.filter(t => t.zoneId === currentZone.id);
          if (zoneTasks.length > 0) {
            copyZone(currentZone, zoneTasks);
            toast.success(`工作区 "${currentZone.name}" 已复制`);
          }
        }
      }

      // Ctrl+V - 粘贴
      if (e.ctrlKey && e.key === 'v') {
        // 优先粘贴工作区
        if (hasZone && currentZone) {
          const result = pasteZone(zones);
          if (result) {
            updateZones([...zones, result.zone]);
            updateTasks([...tasks, ...result.tasks]);
            toast.success(`已粘贴工作区 "${result.zone.name}"`);
          }
        } else if (hasTask && currentZone) {
          const newTask = pasteTask(currentZone.id);
          if (newTask) {
            updateTasks([...tasks, newTask]);
            toast.success('任务已粘贴');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTaskId, tasks, zones, getZoneById, data.activeZoneId, copyTask, copyZone, pasteTask, pasteZone, hasTask, hasZone, updateZones, updateTasks]);

  const handleStartTimer = useCallback(() => {
    const incompleteTasksList = tasks.filter((t) => !t.completed);
    if (incompleteTasksList.length > 0 && !activeTaskId) {
      setActiveTaskId(incompleteTasksList[0].id);
      timer.start('work', incompleteTasksList[0].id);
    } else {
      timer.start('work', activeTaskId);
    }
  }, [timer, tasks, activeTaskId]);

  const handleSelectTask = useCallback((taskId: string) => {
    setActiveTaskId(taskId);
    if (timer.mode === 'idle') {
      const task = tasks.find(t => t.id === taskId);
      toast.info('已选择任务', {
        description: task ? `点击"开始专注"为 "${task.title}" 计时` : '点击"开始专注"开始计时',
      });
    }
  }, [timer.mode, tasks]);

  // 窗口尺寸常量
  const NORMAL_SIZE = { width: 750, height: 650 };
  const COLLAPSED_SIZE = { width: 280, height: 40 };

  const handleToggleCollapse = useCallback(async () => {
    const willCollapse = !data.settings.collapsed;

    try {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();

      if (willCollapse) {
        // 收起时：调整窗口大小
        await win.setSize(new LogicalSize(COLLAPSED_SIZE.width, COLLAPSED_SIZE.height));
      } else {
        // 展开时：恢复窗口大小
        await win.setSize(new LogicalSize(NORMAL_SIZE.width, NORMAL_SIZE.height));
        await win.setFocus();
      }
    } catch (e) {
      console.error('调整窗口大小失败:', e);
    }

    updateSettings({ collapsed: willCollapse });
  }, [data.settings.collapsed, updateSettings]);

  const handleArchiveCurrent = useCallback((name: string, summary: string) => {
    const id = archiveCurrentWorkspace(name, summary);
    toast.success('已存入历史', {
      description: `工作区 "${name}" 已保存到历史记录`,
    });
    return id;
  }, [archiveCurrentWorkspace]);

  const handleCreateNewWorkspace = useCallback((name?: string, templateId?: string) => {
    createNewWorkspace(name, templateId);
    toast.success('新工作区已创建', {
      description: templateId ? '使用模板创建了新工作区' : '创建了空白工作区',
    });
  }, [createNewWorkspace]);

  const handleRestoreFromHistory = useCallback((historyId: string) => {
    restoreFromHistory(historyId);
    toast.success('已恢复历史工作区');
  }, [restoreFromHistory]);

  // Update timer when active task changes
  useEffect(() => {
    if (timer.currentTaskId && timer.currentTaskId !== activeTaskId) {
      setActiveTaskId(timer.currentTaskId);
    }
  }, [timer.currentTaskId, activeTaskId]);

  if (!isLoaded) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <span>加载中...</span>
      </div>
    );
  }

  // Show collapse button when collapsed
  if (data.settings.collapsed) {
    const activeTask = tasks.find(t => t.id === activeTaskId);

    return (
      <>
        <CollapseButton
          pendingTasks={stats.pending}
          isTimerRunning={timer.isRunning}
          timerMode={timer.mode}
          formattedTime={timer.formattedTime}
          activeTaskId={activeTaskId}
          taskTitle={activeTask?.title || '未选择任务'}
          progress={timer.progress}
          onStart={() => timer.start('work', activeTaskId)}
          onPause={timer.pause}
          onResume={timer.resume}
          onExpand={handleToggleCollapse}
        />
        <Toaster position="top-center" />
      </>
    );
  }

  const activeZone = getZoneById(data.activeZoneId || '') || null;
  const currentZoneTasks = activeZone ? getTasksByZone(activeZone.id) : [];

  return (
    <>
      <FloatWindow
        onCollapse={handleToggleCollapse}
      >
        <div className="app-container">
          {/* Timer Section */}
          <PomodoroTimer
            mode={timer.mode}
            formattedTime={timer.formattedTime}
            timeRemaining={timer.timeRemaining}
            isRunning={timer.isRunning}
            progress={timer.progress}
            completedSessions={timer.completedSessions}
            workDuration={data.settings.workDuration}
            breakDuration={data.settings.breakDuration}
            longBreakDuration={data.settings.longBreakDuration}
            onStart={handleStartTimer}
            onPause={timer.pause}
            onResume={timer.resume}
            onStop={timer.stop}
            onSkip={timer.skip}
            onUpdateTime={(seconds, mode) => {
              // 手动修改时间时，同步更新到 settings
              if (mode === 'work') {
                updateSettings({ workDuration: seconds });
              } else if (mode === 'break') {
                updateSettings({ breakDuration: seconds });
              } else if (mode === 'longBreak') {
                updateSettings({ longBreakDuration: seconds });
              }
              timer.updateTime(seconds);
            }}
            onSetMode={(newMode) => {
              // 切换模式时，使用 setMode 同时设置模式和对应的时间
              timer.setMode(newMode);
            }}
          />

          {/* Divider */}
          <div className="section-divider" />

          {/* Main Content - 可调节面板 */}
          <ResizablePanelGroup direction="horizontal" className="main-content">
            {/* Zone Manager Sidebar */}
            <ResizablePanel defaultSize="40%" minSize="5%" maxSize="95%">
              <ZoneManager
                zones={zones}
                activeZoneId={data.activeZoneId}
                templates={templates}
                onSelectZone={(zoneId) => {
                  setActiveZoneId(zoneId);
                  setCurrentView(zoneId === null ? 'global' : 'zones');
                }}
                onAddZone={addZone}
                onUpdateZone={updateZone}
                onDeleteZone={deleteZone}
                onApplyTemplate={applyTemplate}
                onViewChange={(view) => {
                  setCurrentView(view);
                  if (view === 'global') setActiveZoneId(null);
                }}
                onOpenHistory={() => setCurrentView('history')}
                onOpenSettings={() => setCurrentView('settings')}
              />
            </ResizablePanel>

            {/* 分隔条 */}
            <ResizableHandle className="resize-handle" withHandle />

            {/* Content Area */}
            <ResizablePanel defaultSize="60%" minSize="5%">
              <div className="content-area">
                {data.currentView === 'history' ? (
                  <HistoryManager
                    historyWorkspaces={data.historyWorkspaces}
                    templates={templates}
                    onBack={() => setCurrentView('zones')}
                    onRestore={handleRestoreFromHistory}
                    onDelete={deleteHistoryWorkspace}
                    onRename={renameHistoryWorkspace}
                    onUpdateSummary={updateHistorySummary}
                    onCreateNewWorkspace={handleCreateNewWorkspace}
                    onArchiveCurrent={handleArchiveCurrent}
                  />
                ) : data.currentView === 'settings' ? (
                  <SettingsPanel
                    settings={data.settings}
                    onBack={() => setCurrentView('zones')}
                    onUpdateSettings={updateSettings}
                    onPreviewMode={timer.setMode}
                  />
                ) : data.currentView === 'global' ? (
                  <GlobalView
                    zones={zones}
                    tasks={tasks}
                    activeTaskId={activeTaskId}
                    isTimerRunning={timer.isRunning}
                    sortConfig={data.settings.globalViewSort}
                    onBack={() => {
                      setCurrentView('zones');
                      if (zones.length > 0) {
                        setActiveZoneId(zones[0].id);
                      }
                    }}
                    onToggleTask={toggleTask}
                    onDeleteTask={deleteTask}
                    onUpdateTask={updateTask}
                    onToggleExpanded={toggleExpanded}
                    onToggleSubtasksCollapsed={toggleSubtasksCollapsed}
                    onReorderTasks={reorderTasks}
                    onSelectTask={handleSelectTask}
                    onSortConfigChange={(config) => updateSettings({ globalViewSort: config })}
                  />
                ) : (
                  <TaskList
                    zone={activeZone}
                    zones={zones}
                    tasks={currentZoneTasks}
                    activeTaskId={activeTaskId}
                    isTimerRunning={timer.isRunning}
                    onAddTask={addTask}
                    onToggleTask={toggleTask}
                    onDeleteTask={deleteTask}
                    onUpdateTask={updateTask}
                    onToggleExpanded={toggleExpanded}
                    onToggleSubtasksCollapsed={toggleSubtasksCollapsed}
                    onReorderTasks={reorderTasks}
                    onSelectTask={handleSelectTask}
                    onClearCompleted={clearCompleted}
                  />
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </FloatWindow>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'rgba(30, 30, 40, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
          },
        }}
      />
    </>
  );
}

export default App;
