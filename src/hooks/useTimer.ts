import { useState, useEffect, useCallback, useRef } from 'react';
import type { TimerMode, TimerState } from '@/types';

interface UseTimerProps {
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  autoStartBreak: boolean;
  soundEnabled: boolean;
  onComplete?: (mode: TimerMode, duration: number) => void;
  onTick?: (elapsedSeconds: number) => void; // 每秒回调，用于累计时间
}

export function useTimer({
  workDuration,
  breakDuration,
  longBreakDuration,
  autoStartBreak,
  soundEnabled,
  onComplete,
  onTick,
}: UseTimerProps) {
  const [state, setState] = useState<TimerState>({
    mode: 'idle',
    timeRemaining: workDuration,
    isRunning: false,
    currentTaskId: null,
  });

  const [completedSessions, setCompletedSessions] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickCountRef = useRef(0);

  // 辅助函数：安全清除定时器
  const clearIntervalSafe = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Play notification sound using Web Audio API
  const playSound = useCallback(() => {
    if (!soundEnabled) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.error('Failed to play sound:', error);
    }
  }, [soundEnabled]);

  // Clear interval on unmount
  useEffect(() => {
    return () => clearIntervalSafe();
  }, [clearIntervalSafe]);

  const start = useCallback((mode: TimerMode = 'work', taskId: string | null = null) => {
    // 防御性清除：先清除可能存在的旧定时器
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const duration = mode === 'work' ? workDuration : mode === 'break' ? breakDuration : longBreakDuration;
    tickCountRef.current = 0;
    const startTime = Date.now();

    // 先更新状态，确保在定时器创建前状态已更新
    setState({
      mode,
      timeRemaining: duration,
      isRunning: true,
      currentTaskId: taskId,
      currentSessionStartTime: startTime,
      pausedTimeRemaining: duration, // 开始时，pausedTimeRemaining = 初始时长
    });

    // 然后创建定时器（确保状态已更新后再启动定时器）
    const newInterval = setInterval(() => {
      setState((prev) => {
        if (!prev.currentSessionStartTime || !prev.isRunning) {
          return prev;
        }

        // 计算从开始到现在的秒数
        const now = Date.now();
        const elapsed = Math.floor((now - prev.currentSessionStartTime) / 1000);
        // 从 pausedTimeRemaining 减去经过的秒数
        const newTimeRemaining = Math.max(0, (prev.pausedTimeRemaining || duration) - elapsed);

        tickCountRef.current++;
        onTick?.(tickCountRef.current);

        if (newTimeRemaining <= 1) {
          // 计时完成
          playSound();

          // 清除定时器，防止僵尸定时器
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          const completedMode = prev.mode;

          if (prev.mode === 'work') {
            setCompletedSessions((s) => s + 1);
          }

          onComplete?.(prev.mode, duration);

          // 处理 autoStartBreak：直接在定时器外部启动，不嵌套
          if (completedMode === 'work' && autoStartBreak) {
            setTimeout(() => {
              const nextMode = (completedSessions + 1) % 4 === 0 ? 'longBreak' : 'break';
              start(nextMode, null);
            }, 0);
          }

          return {
            ...prev,
            mode: 'idle',
            timeRemaining: workDuration,
            isRunning: false,
            currentTaskId: null,
            currentSessionStartTime: undefined,
            pausedTimeRemaining: undefined,
          };
        }
        return { ...prev, timeRemaining: newTimeRemaining };
      });
    }, 1000);

    // 立即赋值给 intervalRef
    intervalRef.current = newInterval;
  }, [workDuration, breakDuration, longBreakDuration, autoStartBreak, completedSessions, playSound, onComplete, onTick]);

  const pause = useCallback(() => {
    // 防御性清除：确保清除 interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // 记录暂停时的剩余时间，清除 sessionStartTime
    setState((prev) => ({
      ...prev,
      isRunning: false,
      pausedTimeRemaining: prev.timeRemaining, // 保存当前剩余时间
      currentSessionStartTime: undefined, // 清除开始时间
    }));
  }, []);

  const resume = useCallback(() => {
    // 1. 防御性检查：如果已经在运行或处于空闲态，直接返回
    if (state.isRunning || state.mode === 'idle') {
      return;
    }

    // 2. 确保清理旧定时器
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // pausedTimeRemaining 保持不变（是暂停时保存的值）
    const resumeStartTime = Date.now();

    // 3. 创建新的定时器
    const newInterval = setInterval(() => {
      setState((innerPrev) => {
        if (!innerPrev.currentSessionStartTime || !innerPrev.isRunning) {
          return innerPrev;
        }

        const now = Date.now();
        const elapsed = Math.floor((now - innerPrev.currentSessionStartTime) / 1000);
        const newTimeRemaining = Math.max(0, (innerPrev.pausedTimeRemaining || 0) - elapsed);

        tickCountRef.current++;
        onTick?.(tickCountRef.current);

        if (newTimeRemaining <= 1) {
          // 计时完成
          playSound();
          const duration = innerPrev.mode === 'work' ? workDuration
            : innerPrev.mode === 'break' ? breakDuration
            : longBreakDuration;
          onComplete?.(innerPrev.mode, duration);

          // 清除定时器
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          if (innerPrev.mode === 'work') {
            setCompletedSessions((s) => s + 1);
          }

          return {
            ...innerPrev,
            mode: 'idle',
            timeRemaining: workDuration,
            isRunning: false,
            currentTaskId: null,
            currentSessionStartTime: undefined,
            pausedTimeRemaining: undefined,
          };
        }
        return { ...innerPrev, timeRemaining: newTimeRemaining };
      });
    }, 1000);

    // 4. 保存引用
    intervalRef.current = newInterval;

    // 5. 更新状态 - 设置新的开始时间，pausedTimeRemaining 保持不变
    setState((prev) => ({
      ...prev,
      isRunning: true,
      currentSessionStartTime: resumeStartTime,
      // pausedTimeRemaining 保持不变（暂停时保存的值）
    }));
  }, [state.isRunning, state.mode, state.pausedTimeRemaining, workDuration, breakDuration, longBreakDuration, playSound, onComplete, onTick]);

  const stop = useCallback(() => {
    clearIntervalSafe();
    setState({
      mode: 'idle',
      timeRemaining: workDuration,
      isRunning: false,
      currentTaskId: null,
      currentSessionStartTime: undefined,
      pausedTimeRemaining: undefined,
    });
    tickCountRef.current = 0;
  }, [workDuration, clearIntervalSafe]);

  const reset = useCallback(() => {
    stop();
    setCompletedSessions(0);
  }, [stop]);

  const skip = useCallback(() => {
    clearIntervalSafe();

    if (state.mode === 'work') {
      const nextMode = (completedSessions + 1) % 4 === 0 ? 'longBreak' : 'break';
      const nextDuration = nextMode === 'longBreak' ? longBreakDuration : breakDuration;
      tickCountRef.current = 0;
      setState({
        mode: nextMode,
        timeRemaining: nextDuration,
        isRunning: autoStartBreak,
        currentTaskId: null,
        currentSessionStartTime: autoStartBreak ? Date.now() : undefined,
        pausedTimeRemaining: autoStartBreak ? nextDuration : undefined,
      });
      if (autoStartBreak) {
        start(nextMode);
      }
    } else {
      setState({
        mode: 'idle',
        timeRemaining: workDuration,
        isRunning: false,
        currentTaskId: null,
        currentSessionStartTime: undefined,
        pausedTimeRemaining: undefined,
      });
    }
  }, [state.mode, completedSessions, workDuration, breakDuration, longBreakDuration, autoStartBreak, start, clearIntervalSafe]);

  const updateTime = useCallback((newTimeInSeconds: number) => {
    setState(prev => ({
      ...prev,
      timeRemaining: newTimeInSeconds,
      pausedTimeRemaining: prev.isRunning ? prev.pausedTimeRemaining : newTimeInSeconds,
    }));
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // 设置模式（用于设置面板预览）
  const setMode = useCallback((newMode: TimerMode) => {
    // 如果正在运行，不允许切换模式
    if (state.isRunning) return;

    // 清除可能存在的定时器
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 根据模式获取对应的时长
    const duration = newMode === 'work'
      ? workDuration
      : newMode === 'break'
      ? breakDuration
      : longBreakDuration;

    tickCountRef.current = 0;

    setState({
      mode: newMode,
      timeRemaining: duration,
      isRunning: false,
      currentTaskId: null,
      currentSessionStartTime: undefined,
      pausedTimeRemaining: duration,
    });
  }, [state.isRunning, workDuration, breakDuration, longBreakDuration]);

  return {
    ...state,
    formattedTime: formatTime(state.timeRemaining),
    completedSessions,
    start,
    pause,
    resume,
    stop,
    reset,
    skip,
    updateTime,
    setMode,
    progress: state.mode === 'work'
      ? ((workDuration - state.timeRemaining) / workDuration) * 100
      : state.mode === 'break'
      ? ((breakDuration - state.timeRemaining) / breakDuration) * 100
      : state.mode === 'longBreak'
      ? ((longBreakDuration - state.timeRemaining) / longBreakDuration) * 100
      : 0,
  };
}
