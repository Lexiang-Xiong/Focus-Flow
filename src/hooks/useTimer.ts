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

    // 在 setState 外部创建定时器
    const newInterval = setInterval(() => {
      setState((prev) => {
        tickCountRef.current++;
        onTick?.(tickCountRef.current);

        if (prev.timeRemaining <= 1) {
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
            // 使用 setTimeout 延迟一下，避免在 setState 中触发其他 setState
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
          };
        }
        return { ...prev, timeRemaining: prev.timeRemaining - 1 };
      });
    }, 1000);

    // 立即赋值给 intervalRef（在 setState 之前）
    intervalRef.current = newInterval;

    // 然后更新状态
    setState({
      mode,
      timeRemaining: duration,
      isRunning: true,
      currentTaskId: taskId,
      currentSessionStartTime: Date.now(),
    });
  }, [workDuration, breakDuration, longBreakDuration, autoStartBreak, completedSessions, playSound, onComplete, onTick]);

  const pause = useCallback(() => {
    // 防御性清除：确保清除 interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState((prev) => ({ ...prev, isRunning: false }));
  }, []);

  const resume = useCallback(() => {
    // 1. 防御性检查：如果已经在运行或处于空闲态，直接返回
    if (state.isRunning || state.mode === 'idle') {
      return;
    }

    // 2. 确保清理旧定时器（防止意外重复）
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 3. 在 setState 外部创建定时器
    const newInterval = setInterval(() => {
      setState((innerPrev) => {
        tickCountRef.current++;
        onTick?.(tickCountRef.current);

        if (innerPrev.timeRemaining <= 1) {
          // 计时完成
          playSound();
          onComplete?.(innerPrev.mode, innerPrev.mode === 'work' ? workDuration : innerPrev.mode === 'break' ? breakDuration : longBreakDuration);

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
          };
        }
        return { ...innerPrev, timeRemaining: innerPrev.timeRemaining - 1 };
      });
    }, 1000);

    // 4. 保存引用
    intervalRef.current = newInterval;

    // 5. 更新状态
    setState((prev) => ({ ...prev, isRunning: true }));
  }, [state.isRunning, state.mode, workDuration, breakDuration, longBreakDuration, playSound, onComplete, onTick]);

  const stop = useCallback(() => {
    clearIntervalSafe();
    setState({
      mode: 'idle',
      timeRemaining: workDuration,
      isRunning: false,
      currentTaskId: null,
      currentSessionStartTime: undefined,
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
      });
    }
  }, [state.mode, completedSessions, workDuration, breakDuration, longBreakDuration, autoStartBreak, start, clearIntervalSafe]);

  const updateTime = useCallback((newTimeInSeconds: number) => {
    setState(prev => ({
      ...prev,
      timeRemaining: newTimeInSeconds,
    }));
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // 设置模式（用于设置面板预览）
  const setMode = useCallback((newMode: TimerMode) => {
    // 如果正在运行，不允许切换模式（保护机制）
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
