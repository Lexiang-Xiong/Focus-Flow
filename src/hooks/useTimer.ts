import { useState, useEffect, useCallback, useRef } from 'react';
import type { TimerMode, TimerState } from '@/types';

interface UseTimerProps {
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  autoStartBreak: boolean;
  soundEnabled: boolean;
  onComplete?: (mode: TimerMode, duration: number) => void;
  onTick?: (elapsedSeconds: number) => void;
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

  // 关键修复 1: 使用 Ref 追踪最新的 state，打破闭包限制
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearIntervalSafe = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

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

  useEffect(() => {
    return () => clearIntervalSafe();
  }, [clearIntervalSafe]);

  // 关键修复 2: 抽离通用的 Tick 逻辑
  // 这个函数负责：计算时间 -> 执行副作用(onTick) -> 更新UI(setState)
  const runTick = useCallback((startTime: number, initialTimeRemaining: number, currentDuration: number) => {
    const now = Date.now();
    const elapsed = Math.floor((now - startTime) / 1000);
    const newTimeRemaining = Math.max(0, initialTimeRemaining - elapsed);

    // ✅ 副作用放在这里，而不是 setState 内部
    tickCountRef.current++;
    onTick?.(tickCountRef.current);

    if (newTimeRemaining <= 0) {
      // 计时结束逻辑
      playSound();
      clearIntervalSafe();

      const currentState = stateRef.current; // 读取最新状态
      const completedMode = currentState.mode;

      if (completedMode === 'work') {
        setCompletedSessions((s) => s + 1);
      }

      onComplete?.(completedMode, currentDuration);

      if (completedMode === 'work' && autoStartBreak) {
        setTimeout(() => {
          const nextMode = (completedSessions + 1) % 4 === 0 ? 'longBreak' : 'break';
          // 这里的 start 需要能够访问到
          startTimerInternal(nextMode, null);
        }, 0);
      }

      setState(prev => ({
        ...prev,
        mode: 'idle',
        timeRemaining: workDuration, // 重置为工作时长
        isRunning: false,
        currentTaskId: null,
        currentSessionStartTime: undefined,
        pausedTimeRemaining: undefined,
      }));
    } else {
      // 仅更新 UI 时间
      setState(prev => ({ ...prev, timeRemaining: newTimeRemaining }));
    }
  }, [onTick, playSound, clearIntervalSafe, onComplete, autoStartBreak, completedSessions, workDuration]);

  // 内部启动函数，解决闭包调用问题
  const startTimerInternal = useCallback((mode: TimerMode, taskId: string | null) => {
    clearIntervalSafe();
    const duration = mode === 'work' ? workDuration : mode === 'break' ? breakDuration : longBreakDuration;
    tickCountRef.current = 0;
    const startTime = Date.now();

    setState({
      mode,
      timeRemaining: duration,
      isRunning: true,
      currentTaskId: taskId,
      currentSessionStartTime: startTime,
      pausedTimeRemaining: duration,
    });

    intervalRef.current = setInterval(() => {
      // 在 interval 中调用抽离的逻辑
      // 注意：这里我们传递当时的 startTime 和 duration，保证计算准确
      runTick(startTime, duration, duration);
    }, 1000);
  }, [workDuration, breakDuration, longBreakDuration, clearIntervalSafe, runTick]);

  const start = useCallback((mode: TimerMode = 'work', taskId: string | null = null) => {
    startTimerInternal(mode, taskId);
  }, [startTimerInternal]);

  const pause = useCallback(() => {
    clearIntervalSafe();
    setState((prev) => ({
      ...prev,
      isRunning: false,
      pausedTimeRemaining: prev.timeRemaining,
      currentSessionStartTime: undefined,
    }));
  }, [clearIntervalSafe]);

  const resume = useCallback(() => {
    const current = stateRef.current;
    if (current.isRunning || current.mode === 'idle') return;

    clearIntervalSafe();
    const resumeStartTime = Date.now();
    const currentPausedTime = current.pausedTimeRemaining || 0;

    // 重新获取当前模式的总时长，用于 onComplete 回调
    const duration = current.mode === 'work' ? workDuration
      : current.mode === 'break' ? breakDuration
      : longBreakDuration;

    intervalRef.current = setInterval(() => {
      // 这里的逻辑稍有不同，因为是从暂停处继续
      // 基准时间是 pausedTimeRemaining
      runTick(resumeStartTime, currentPausedTime, duration);
    }, 1000);

    setState((prev) => ({
      ...prev,
      isRunning: true,
      currentSessionStartTime: resumeStartTime,
    }));
  }, [clearIntervalSafe, runTick, workDuration, breakDuration, longBreakDuration]);

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
    const current = stateRef.current;

    if (current.mode === 'work') {
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
        startTimerInternal(nextMode, null);
      }
    } else {
      stop();
    }
  }, [completedSessions, workDuration, breakDuration, longBreakDuration, autoStartBreak, startTimerInternal, clearIntervalSafe, stop]);

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

  // 设置模式预览
  const setMode = useCallback((newMode: TimerMode) => {
    if (stateRef.current.isRunning) return;
    clearIntervalSafe();
    const duration = newMode === 'work' ? workDuration
      : newMode === 'break' ? breakDuration
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
  }, [workDuration, breakDuration, longBreakDuration, clearIntervalSafe]);

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