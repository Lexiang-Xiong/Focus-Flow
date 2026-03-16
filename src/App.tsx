import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FloatWindow } from '@/components/FloatWindow';
import { PomodoroTimer } from '@/components/PomodoroTimer';
import { ZoneManager } from '@/components/ZoneManager';
import { TaskList } from '@/components/TaskList';
import { GlobalView } from '@/components/GlobalView';
import { HistoryManager } from '@/components/HistoryManager';
import { SettingsPanel } from '@/components/SettingsPanel';
import { CollapseButton } from '@/components/CollapseButton';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useAppStore } from '@/store';
import { useTimer } from '@/hooks/useTimer';
import { useClipboard } from '@/hooks/useClipboard';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import type { TimerMode } from '@/types';
import { PREDEFINED_TEMPLATES } from '@/types';
import { useTranslation } from 'react-i18next';
import { AutoTester } from '@/lib/auto-tester';
import { startDataMonitor, stopDataMonitor } from '@/lib/db-monitor';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

function App() {
  const {
    currentWorkspace,
    settings,
    currentView,
    activeZoneId,
    focusedTaskId,
    historyWorkspaces,
    zones,
    tasks,
    setCurrentView,
    setActiveZoneId,
    setFocusedTaskId,
    updateSettings,
    getZoneById,
    getTasksByZone,
    toggleTask,
    deleteTask,
    updateTask,
    reorderTasks,
    toggleExpanded,
    toggleSubtasksCollapsed,
    clearCompleted,
    archiveCurrentWorkspace,
    quickArchiveCurrentWorkspace,
    autoSaveSnapshot,
    overwriteHistoryWorkspace,
    restoreFromHistory,
    createNewWorkspace,
    deleteHistoryWorkspace,
    renameHistoryWorkspace,
    updateHistorySummary,
    exportHistoryToJson,
    exportAllHistoryToJson,
    importHistoryFromJson,
    importAllHistoryFromJson,
    customTemplates,
    saveCustomTemplate,
    deleteCustomTemplate,
    getStats,
    addWorkTime,
    getTotalWorkTime,
    getEstimatedTime,
    addZone,
    hasUnsavedChanges,
    undo,
    redo,
    checkRecurringTasks,
    recurringTemplates,
    addRecurringTemplate,
    updateRecurringTemplate,
    deleteRecurringTemplate,
  } = useAppStore();
  const { t, i18n } = useTranslation();

  // 启动数据变化监控（用于调试数据丢失问题）
  useEffect(() => {
    // import.meta.env.DEV 是 Vite 提供的环境变量，仅在开发环境下为 true
    if (import.meta.env.DEV) {
      startDataMonitor();
      return () => stopDataMonitor();
    }
  }, []);

  // 同步 i18n 和 settings.language
  useEffect(() => {
    if (settings.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings.language, i18n]);

  // 预计算所有任务时间（避免渲染时递归计算）
  const taskComputedTimes = useMemo(() => {
    const computed: Record<string, { totalWorkTime: number; estimatedTime: number }> = {};
    if (!tasks || tasks.length === 0) return computed;

    // 计算 estimatedTime（自底向上）
    const computeEstimated = (taskId: string): number => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return 0;

      if (task.estimatedTime !== undefined && task.estimatedTime > 0) {
        computed[taskId] = computed[taskId] || { totalWorkTime: 0, estimatedTime: 0 };
        computed[taskId].estimatedTime = task.estimatedTime;
        return task.estimatedTime;
      }

      const children = tasks.filter(t => t.parentId === taskId);
      const childrenEst = children.reduce((sum, child) => sum + computeEstimated(child.id), 0);

      computed[taskId] = computed[taskId] || { totalWorkTime: 0, estimatedTime: 0 };
      computed[taskId].estimatedTime = childrenEst;
      return childrenEst;
    };

    // 计算 totalWorkTime（自底向上）
    const computeTotalWorkTime = (taskId: string): number => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return 0;

      const children = tasks.filter(t => t.parentId === taskId);
      const childrenTotal = children.reduce((sum, child) => sum + computeTotalWorkTime(child.id), 0);

      const total = (task.ownTime || 0) + childrenTotal;

      if (!computed[taskId]) {
        computed[taskId] = { totalWorkTime: 0, estimatedTime: 0 };
      }
      computed[taskId].totalWorkTime = total;

      return total;
    };

    const rootTasks = tasks.filter(t => !t.parentId);
    rootTasks.forEach(t => {
      computeEstimated(t.id);
      computeTotalWorkTime(t.id);
    });

    return computed;
  }, [tasks]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const collapsedPositionRef = useRef<{x: number, y: number} | null>(null);

  // 使用ref存储activeTaskId和tasks，确保计时器回调中能获取最新值
  const activeTaskIdRef = useRef<string | null>(null);
  const tasksRef = useRef<typeof tasks>([]);
  const timerRef = useRef<{ isRunning: boolean; mode: string }>({ isRunning: false, mode: 'idle' });
  const sessionWorkTimeRef = useRef(0);

  // 同步ref和state
  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // 使用 ref 保持 addWorkTime 稳定，避免计时器回调重复创建
  const addWorkTimeRef = useRef(addWorkTime);
  addWorkTimeRef.current = addWorkTime;

  const syncWorkTime = useCallback(() => {
      const currentActiveTaskId = activeTaskIdRef.current;
      if (currentActiveTaskId && sessionWorkTimeRef.current > 0) {
        // 将内存中累积的秒数一次性写入 Store
        addWorkTimeRef.current(currentActiveTaskId, sessionWorkTimeRef.current);
        // 写入后清空内存累积
        sessionWorkTimeRef.current = 0;
      }
    }, []);

  // 处理计时器滴答，累计任务时间
  // const handleTimerTick = useCallback(() => {
  //   const currentActiveTaskId = activeTaskIdRef.current;
  //   const currentTimer = timerRef.current;

  //   if (currentActiveTaskId && currentTimer.isRunning && currentTimer.mode === 'work') {
  //     // 使用 addWorkTime 累加时间：当前任务增加 ownTime
  //     addWorkTimeRef.current(currentActiveTaskId, 1);
  //   }
  // }, []);

  const handleTimerTick = useCallback(() => {
    const currentTimer = timerRef.current;

    if (activeTaskIdRef.current && currentTimer.isRunning && currentTimer.mode === 'work') {
      // 每秒只加内存里的变量，不操作 Store
      sessionWorkTimeRef.current += 1;

      // 每 60 秒同步一次，防止程序意外崩溃导致一整条番茄钟数据丢失
      if (sessionWorkTimeRef.current >= 60) {
        syncWorkTime();
      }
    }
  }, [syncWorkTime]);

  const handleTimerComplete = useCallback((mode: TimerMode) => {
    syncWorkTime(); // 专注结束时，立刻把剩余的秒数存入 Store
    if (mode === 'work' && activeTaskId) {
      const task = tasks.find(t => t.id === activeTaskId);
      if (task) {
        const minutes = Math.floor((task.totalWorkTime || 0) / 60);
        toast.success(t('toast.focusComplete'), {
          description: t('toast.taskAccumulated', { title: task.title, minutes }),
        });
      }
    } else if (mode === 'break' || mode === 'longBreak') {
      toast.info(t('toast.breakEnd'), {
        description: t('toast.readyForNext'),
      });
    }
  }, [activeTaskId, tasks, t]);

  const timer = useTimer({
    workDuration: settings.workDuration,
    breakDuration: settings.breakDuration,
    longBreakDuration: settings.longBreakDuration,
    autoStartBreak: settings.autoStartBreak,
    soundEnabled: settings.soundEnabled,
    onComplete: handleTimerComplete,
    onTick: handleTimerTick,
  });

  // 剪贴板功能
  const {
    copyTask,
    copyZone,
    pasteTask,
    pasteZone,
    getOriginalParentId,
    hasTask,
    hasZone,
  } = useClipboard();

  // 同步timerRef
  useEffect(() => {
    timerRef.current = { isRunning: timer.isRunning, mode: timer.mode };
  }, [timer.isRunning, timer.mode]);

  // 使用 ref 追踪当前模式
  const currentModeRef = useRef<TimerMode>('work');
  useEffect(() => {
    currentModeRef.current = timer.mode;
  }, [timer.mode]);

  // 监听 settings 变化
  useEffect(() => {
    if (timer.mode === 'idle' && !timer.isRunning) {
      const targetDuration = currentModeRef.current === 'break'
        ? settings.breakDuration
        : currentModeRef.current === 'longBreak'
        ? settings.longBreakDuration
        : settings.workDuration;

      if (timer.timeRemaining !== targetDuration) {
        timer.updateTime(targetDuration);
      }
    }
  }, [settings.workDuration, settings.breakDuration, settings.longBreakDuration, timer]);

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl+Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        toast.info(t('toast.undo'));
        return;
      }

      // Ctrl+Shift+Z 或 Ctrl+Y 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        toast.info(t('toast.redo'));
        return;
      }

      // 尝试获取当前操作的区域上下文
      let currentZone = getZoneById(activeZoneId || '') || null;

      // 如果没有选中分区，尝试通过"选中任务"或"当前聚焦的任务"来推断分区
      if (!currentZone) {
        const contextTaskId = activeTaskId || focusedTaskId;
        if (contextTaskId) {
          const contextTask = tasks.find(t => t.id === contextTaskId);
          if (contextTask) {
            currentZone = getZoneById(contextTask.zoneId) || null;
          }
        }
      }

      if (e.ctrlKey && e.key === 'c') {
        if (activeTaskId) {
          const task = tasks.find(t => t.id === activeTaskId);
          if (task) {
            copyTask(task);
            toast.success(t('toast.taskCopied'));
            return;
          }
        }
        if (currentZone) {
          const zoneTasks = tasks.filter(t => t.zoneId === currentZone.id);
          if (zoneTasks.length > 0) {
            copyZone(currentZone, zoneTasks);
            toast.success(t('toast.zoneCopied', { name: currentZone.name }));
          }
        }
      }

      if (e.ctrlKey && e.key === 'v') {
        if (hasZone && currentZone) {
          const result = pasteZone(zones);
          if (result) {
            // 直接更新 store
            result.zone.id = `zone-${Date.now()}`;
            addZone(result.zone.name || t('common.unnamed'), result.zone.color);
            const newTasks = result.tasks.map(t => ({ ...t, id: `task-${Date.now()}-${Math.random()}`, zoneId: result.zone.id }));
            newTasks.forEach(t => {
              useAppStore.getState().addTask(t.zoneId, t.title, t.description, t.priority, t.urgency, t.deadline || null, t.deadlineType || 'none', t.parentId);
            });
            toast.success(t('toast.zonePasted', { name: result.zone.name || t('common.unnamed') }));
          }
        } else if (hasTask && currentZone) {
          const newTask = pasteTask(currentZone.id);
          if (newTask) {
            let targetZoneId = currentZone.id;
            let parentId: string | null = null;

            if (currentView === 'global') {
              // 1. 全局模式下：无视当前的聚焦路径，直接粘贴在被复制者的同一层级
              parentId = getOriginalParentId();
              if (parentId) {
                const parentTask = tasks.find(t => t.id === parentId);
                if (parentTask) {
                  targetZoneId = parentTask.zoneId;
                }
              }
            } else if (focusedTaskId) {
              // 2. 分区模式且有聚焦（面包屑路径）：粘贴为当前所处路径（文件夹）的子任务，与选中的 activeTaskId 无关
              const focusedTask = tasks.find(t => t.id === focusedTaskId);
              if (focusedTask) {
                parentId = focusedTaskId;
                targetZoneId = focusedTask.zoneId;
              }
            } else {
              // 3. 普通分区视图，无聚焦：粘贴为根级任务
              parentId = null;
            }

            useAppStore.getState().addTask(
              targetZoneId,
              newTask.title,
              newTask.description,
              newTask.priority,
              newTask.urgency,
              newTask.deadline || null,
              newTask.deadlineType || 'none',
              parentId
            );
            toast.success(parentId ? t('toast.subtaskPasted') : t('toast.taskPasted'));
          }
        }
      }

      // Delete 键删除选中的任务
      if (e.key === 'Delete' && activeTaskId) {
        const task = tasks.find(t => t.id === activeTaskId);
        if (task) {
          deleteTask(activeTaskId);
          toast.success(t('toast.taskDeleted'));
          setActiveTaskId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTaskId, tasks, zones, getZoneById, activeZoneId, focusedTaskId, currentView, copyTask, copyZone, pasteTask, pasteZone, getOriginalParentId, hasTask, hasZone, addZone, deleteTask]);

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
      toast.info(t('toast.taskSelected'), {
        description: task ? t('toast.clickToStartTimer', { title: task.title }) : t('toast.clickToStart'),
      });
    }
  }, [timer.mode, tasks, t]);

  // 窗口尺寸常量
  const NORMAL_SIZE = { width: 750, height: 650 };
  const COLLAPSED_SIZE = { width: 280, height: 40 };

  const handleToggleCollapse = useCallback(async () => {
    const willCollapse = !settings.collapsed;

    try {
      const { getCurrentWindow, LogicalSize, LogicalPosition, availableMonitors} = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();

      if (willCollapse) {
        await win.setSize(new LogicalSize(COLLAPSED_SIZE.width, COLLAPSED_SIZE.height));

        if (collapsedPositionRef.current) {
          const { x, y } = collapsedPositionRef.current;
          await win.setPosition(new LogicalPosition(x, y));
        }
      } else {
        await win.setSize(new LogicalSize(NORMAL_SIZE.width, NORMAL_SIZE.height));
        // ===== 新增：展开时居中到屏幕 =====
        // 获取所有显示器，并找到包含窗口当前位置的那个
        const monitors = await availableMonitors();
        const currentPos = await win.outerPosition();
        
        // 简单方案：使用第一个显示器（通常是主屏）或者包含当前坐标的显示器
        const currentMonitor = monitors.find(m => {
          const { position, size } = m;
          return (
            currentPos.x >= position.x &&
            currentPos.x <= position.x + size.width &&
            currentPos.y >= position.y &&
            currentPos.y <= position.y + size.height
          );
        }) || monitors[0]; // 默认使用主显示器
        
        if (currentMonitor) {
        const sf = currentMonitor.scaleFactor;
        collapsedPositionRef.current = {
          x: currentPos.x / sf,
          y: currentPos.y / sf
        };
        
        // 注意：所有计算都要除以 scaleFactor 转换为逻辑像素
        const x = currentMonitor.position.x / sf + (currentMonitor.size.width / sf - NORMAL_SIZE.width) / 2;
        const y = currentMonitor.position.y / sf + (currentMonitor.size.height / sf - NORMAL_SIZE.height) / 2;
        
        await win.setPosition(new LogicalPosition(x, y));
      }
        // ==================================
        await win.setFocus();
      }
    } catch (e) {
      console.error('调整窗口大小失败:', e);
    }

    updateSettings({ collapsed: willCollapse });
  }, [settings.collapsed, updateSettings]);

  const handleArchiveCurrent = useCallback((name: string, summary: string) => {
    const id = archiveCurrentWorkspace(name, summary);
    toast.success(t('toast.archived'), {
      description: t('toast.archiveSuccessDesc', { name }),
    });
    return id;
  }, [archiveCurrentWorkspace, t]);

  const handleCreateNewWorkspace = useCallback((name?: string, templateId?: string) => {
    createNewWorkspace(name, templateId);
    if (templateId) {
      toast.success(t('toast.workspaceCreatedTemplate'));
    } else {
      toast.success(t('toast.workspaceCreatedBlank'));
    }
  }, [createNewWorkspace, t]);

  const handleRestoreFromHistory = useCallback((historyId: string) => {
    restoreFromHistory(historyId);
    toast.success(t('messages.workspaceRestored'));
  }, [restoreFromHistory]);

  // Update timer when active task changes
  useEffect(() => {
    if (timer.currentTaskId && timer.currentTaskId !== activeTaskId) {
      setActiveTaskId(timer.currentTaskId);
    }
  }, [timer.currentTaskId, activeTaskId]);

  // 自动保存历史
  useEffect(() => {
    if (!settings.autoSaveEnabled) return;

    const interval = settings.autoSaveInterval * 1000; // 转换为毫秒
    const intervalId = setInterval(() => {
      if (hasUnsavedChanges()) {
        autoSaveSnapshot();
        toast.success(t('toast.autoSaved'));
      }
    }, interval);

    return () => clearInterval(intervalId);
  }, [settings.autoSaveEnabled, settings.autoSaveInterval, hasUnsavedChanges, autoSaveSnapshot, t]);

  // --- 在此处插入以下代码 ---
  // 💾 自动全量容灾备份逻辑 (每 10 分钟执行一次)
  useEffect(() => {
    const BACKUP_INTERVAL = 10 * 60 * 1000;
    const backupTimer = setInterval(async () => {
      try {
        // const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const { dirname, join } = await import('@tauri-apps/api/path');
        const { getDbPath } = await import('@/lib/db'); 
        
        // 1. 获取数据库所在目录
        const dbPath = await getDbPath();
        const dbDir = await dirname(dbPath);
        const backupPath = await join(dbDir, 'focus_flow_backup.json');

        // 2. 导出核心数据快照
        const state = useAppStore.getState();
        // 将当前工作区伪装成历史记录，连同现有的历史记录一起导出为数组
        const currentWork = {
          ...state.currentWorkspace,
          name: `${state.currentWorkspace.name} (${t('workspace.archive')})`,
          zones: state.zones,
          tasks: state.tasks,
          lastModified: Date.now()
        };
        
        // 核心：直接导出为数组格式
        const backupData = JSON.stringify([currentWork, ...state.historyWorkspaces], null, 2);

        await invoke('save_backup', { 
          path: backupPath, 
          data: backupData 
        });

        console.log('[AutoBackup] 备份成功，格式已对齐导入标准');
      } catch (error) {
        console.error('[AutoBackup] 自动备份失败:', error);
      }
    }, BACKUP_INTERVAL);
    return () => clearInterval(backupTimer);
  }, [t]); // 记得添加 t 依赖项

  // 定时任务心跳 - 每分钟检查一次
  useEffect(() => {
    // 首次加载检查一次
    checkRecurringTasks();

    const interval = setInterval(() => {
      checkRecurringTasks();
    }, 60000); // 60秒

    return () => clearInterval(interval);
  }, [checkRecurringTasks]);

  // Loading state
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    // 短暂延迟确保 store 已初始化
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // 🚨 自动化测试检测：应用启动时检查是否需要继续测试
  useEffect(() => {
    if (isLoaded) {
      // 延迟一点确保 Zustand hydration 完成
      setTimeout(() => {
        AutoTester.checkAndRun();
      }, 500);
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  // 悬浮条模式
  if (settings.collapsed) {
    const activeTask = tasks.find(t => t.id === activeTaskId);
    const stats = getStats();

    return (
      <>
        <CollapseButton
          pendingTasks={stats.pending}
          isTimerRunning={timer.isRunning}
          timerMode={timer.mode}
          formattedTime={timer.formattedTime}
          activeTaskId={activeTaskId}
          taskTitle={activeTask?.title || t('timer.noTaskSelected')}
          progress={timer.progress}
          onStart={() => timer.start('work', activeTaskId)}
          onPause={() => { timer.pause(); syncWorkTime(); }}
          onResume={timer.resume}
          onExpand={handleToggleCollapse}
        />
        <Toaster position="top-center" />
      </>
    );
  }

  const activeZone = getZoneById(activeZoneId || '') || null;
  const currentZoneTasks = activeZone ? getTasksByZone(activeZone.id) : [];

  return (
    <>
      <FloatWindow onCollapse={handleToggleCollapse}>
        <div className="app-container">
          {/* Timer Section */}
          <PomodoroTimer
            mode={timer.mode}
            formattedTime={timer.formattedTime}
            timeRemaining={timer.timeRemaining}
            isRunning={timer.isRunning}
            progress={timer.progress}
            completedSessions={timer.completedSessions}
            workDuration={settings.workDuration}
            breakDuration={settings.breakDuration}
            longBreakDuration={settings.longBreakDuration}
            onStart={handleStartTimer}
            onPause={timer.pause}
            onResume={timer.resume}
            onStop={timer.stop}
            onSkip={timer.skip}
            onUpdateTime={(seconds, mode) => {
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
              timer.setMode(newMode);
            }}
          />

          {/* Divider */}
          <div className="section-divider" />

          {/* Main Content */}
          <ResizablePanelGroup direction="horizontal" className="main-content">
            <ResizablePanel defaultSize="40%" minSize="5%" maxSize="95%">
              <ZoneManager
                zones={zones}
                activeZoneId={activeZoneId}
                templates={PREDEFINED_TEMPLATES}
                customTemplates={customTemplates}
                onSelectZone={(zoneId) => {
                  setActiveZoneId(zoneId);
                  setCurrentView(zoneId === null ? 'global' : 'zones');
                }}
                onAddZone={addZone}
                onUpdateZone={useAppStore.getState().updateZone}
                onDeleteZone={useAppStore.getState().deleteZone}
                onReorderZones={useAppStore.getState().reorderZones}
                onApplyTemplate={(templateId) => {
                  // 应用模板前先自动保存当前工作区
                  if (currentWorkspace.tasks.length > 0) {
                    archiveCurrentWorkspace();
                  }
                  useAppStore.getState().applyTemplate(templateId);
                }}
                onViewChange={(view) => {
                  setCurrentView(view);
                  if (view === 'global') setActiveZoneId(null);
                }}
                onOpenHistory={() => setCurrentView('history')}
                onOpenSettings={() => setCurrentView('settings')}
                onSaveAsTemplate={saveCustomTemplate}
                onDeleteCustomTemplate={deleteCustomTemplate}
              />
            </ResizablePanel>

            <ResizableHandle className="resize-handle" withHandle />

            <ResizablePanel defaultSize="60%" minSize="5%">
              <div className="content-area">
                {currentView === 'history' ? (
                  <HistoryManager
                    historyWorkspaces={historyWorkspaces}
                    templates={PREDEFINED_TEMPLATES}
                    currentSourceHistoryId={currentWorkspace.sourceHistoryId}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onBack={() => setCurrentView('zones')}
                    onRestore={handleRestoreFromHistory}
                    onDelete={deleteHistoryWorkspace}
                    onRename={renameHistoryWorkspace}
                    onUpdateSummary={updateHistorySummary}
                    onCreateNewWorkspace={handleCreateNewWorkspace}
                    onArchiveCurrent={handleArchiveCurrent}
                    onQuickArchive={quickArchiveCurrentWorkspace}
                    onOverwriteHistory={overwriteHistoryWorkspace}
                    onExportHistory={exportHistoryToJson}
                    onExportAllHistory={exportAllHistoryToJson}
                    onImportHistory={importHistoryFromJson}
                    onImportAllHistory={importAllHistoryFromJson}
                    customTemplates={customTemplates}
                    onSaveCustomTemplate={saveCustomTemplate}
                    onDeleteCustomTemplate={deleteCustomTemplate}
                  />
                ) : currentView === 'settings' ? (
                  <SettingsPanel
                    settings={settings}
                    zones={zones}
                    recurringTemplates={recurringTemplates}
                    onAddRecurringTemplate={addRecurringTemplate}
                    onUpdateRecurringTemplate={updateRecurringTemplate}
                    onDeleteRecurringTemplate={deleteRecurringTemplate}
                    onBack={() => setCurrentView('zones')}
                    onUpdateSettings={updateSettings}
                    onPreviewMode={timer.setMode}
                  />
                ) : currentView === 'global' ? (
                  <GlobalView
                    zones={zones}
                    tasks={tasks}
                    activeTaskId={activeTaskId}
                    isTimerRunning={timer.isRunning}
                    sortConfig={settings.globalViewSort}
                    isLeafMode={settings.globalViewLeafMode}
                    onLeafModeChange={(isLeaf) => updateSettings({ globalViewLeafMode: isLeaf })}
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
                    onNavigateToZone={(zoneId, taskId) => {
                      setActiveZoneId(zoneId);
                      setFocusedTaskId(taskId);
                      setCurrentView('zones');
                    }}
                    getTotalWorkTime={getTotalWorkTime}
                    getEstimatedTime={getEstimatedTime}
                    taskComputedTimes={taskComputedTimes}
                  />
                ) : (
                  <TaskList
                    zone={activeZone}
                    zones={zones}
                    tasks={currentZoneTasks}
                    activeTaskId={activeTaskId}
                    isTimerRunning={timer.isRunning}
                    focusedTaskId={focusedTaskId}
                    onSetFocusedTaskId={setFocusedTaskId}
                    onAddTask={useAppStore.getState().addTask}
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
