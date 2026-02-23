import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Square, SkipForward, Coffee, Brain, Timer, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import type { TimerMode } from '@/types';

interface PomodoroTimerProps {
  mode: TimerMode;
  formattedTime: string;
  timeRemaining: number;
  isRunning: boolean;
  progress: number;
  completedSessions: number;
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkip: () => void;
  onUpdateTime?: (seconds: number, mode: TimerMode) => void;
  onSetMode?: (mode: TimerMode) => void;
}

export function PomodoroTimer({
  mode,
  formattedTime,
  timeRemaining,
  isRunning,
  progress,
  completedSessions,
  workDuration,
  breakDuration,
  longBreakDuration,
  onStart,
  onPause,
  onResume,
  onStop,
  onSkip,
  onUpdateTime,
  onSetMode,
}: PomodoroTimerProps) {
  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editMinutes, setEditMinutes] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 鼠标进入时展开
  const handleMouseEnter = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
  };

  // 鼠标离开时收起（仅在不运行时收起）
  const handleMouseLeave = () => {
    // 如果正在编辑时间，取消编辑
    if (isEditing) {
      setIsEditing(false);
      setEditMinutes('');
    }

    // 收起计时器（仅在不运行时）
    if (!isRunning && !isCollapsed) {
      setIsCollapsed(true);
    }
  };

  // 进入编辑模式
  const handleTimeClick = () => {
    if (isRunning || !onUpdateTime) return;
    const currentMins = Math.floor(timeRemaining / 60);
    setEditMinutes(currentMins.toString());
    setIsEditing(true);
  };

  // 提交修改
  const handleTimeSubmit = () => {
    setIsEditing(false);
    const mins = parseInt(editMinutes);
    if (!isNaN(mins) && mins > 0 && onUpdateTime) {
      // 传递当前模式和对应的秒数
      onUpdateTime(mins * 60, mode === 'idle' ? 'work' : mode);
    }
  };

  // 自动聚焦
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const getModeIcon = () => {
    switch (mode) {
      case 'work':
        return <Brain size={16} className="text-blue-400" />;
      case 'break':
        return <Coffee size={16} className="text-green-400" />;
      case 'longBreak':
        return <Coffee size={16} className="text-purple-400" />;
      default:
        return <Timer size={16} className="text-gray-400" />;
    }
  };

  const getModeText = () => {
    switch (mode) {
      case 'work':
        return '专注中';
      case 'break':
        return '短休息';
      case 'longBreak':
        return '长休息';
      default:
        return '准备开始';
    }
  };

  const getModeColor = () => {
    switch (mode) {
      case 'work':
        return 'from-blue-500/20 to-blue-600/20 border-blue-500/30';
      case 'break':
        return 'from-green-500/20 to-green-600/20 border-green-500/30';
      case 'longBreak':
        return 'from-purple-500/20 to-purple-600/20 border-purple-500/30';
      default:
        return 'from-gray-500/20 to-gray-600/20 border-gray-500/30';
    }
  };

  // 收缩状态下的紧凑视图 - 控制按钮独立侧边栏
  if (isCollapsed) {
    return (
      <div className="timer-collapsed-wrapper">
        {/* 主计时区域 - 鼠标进入时展开 */}
        <div
          className={`timer-collapsed-main bg-gradient-to-r ${getModeColor()}`}
          onMouseEnter={handleMouseEnter}
        >
          <button
            className="timer-collapse-btn"
            onClick={() => setIsCollapsed(false)}
            title="展开"
          >
            <ChevronUp size={14} />
          </button>
          <div className="timer-collapsed-content">
            {getModeIcon()}
            <span className="timer-collapsed-time">{formattedTime}</span>
          </div>
        </div>
        {/* 控制按钮区域 - 固定显示，不触发展开 */}
        <div className={`timer-collapsed-controls bg-gradient-to-r ${getModeColor()}`}>
          {isRunning ? (
            <button className="timer-collapsed-btn primary" onClick={onPause} title="暂停">
              <Pause size={20} />
            </button>
          ) : mode !== 'idle' ? (
            <button className="timer-collapsed-btn primary" onClick={onResume} title="继续">
              <Play size={20} />
            </button>
          ) : (
            <button className="timer-collapsed-btn primary" onClick={onStart} title="开始">
              <Play size={20} />
            </button>
          )}
          <button className="timer-collapsed-btn" onClick={onStop} title="重置">
            <Square size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`timer-container bg-gradient-to-br ${getModeColor()}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div className="timer-header">
        <div className="mode-indicator">
          {getModeIcon()}
          <span className={`mode-text mode-${mode}`}>{getModeText()}</span>
        </div>
        <div className="timer-header-actions">
          <button
            className="timer-collapse-toggle"
            onClick={() => setIsCollapsed(true)}
            title="收缩"
          >
            <ChevronDown size={14} />
          </button>
          <div className="session-count">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className={`session-dot ${i < completedSessions % 4 ? 'active' : ''}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Time display */}
      <div className="time-display">
        {isEditing ? (
          <div className="flex items-center justify-center gap-1">
            <Input
              ref={inputRef}
              type="number"
              value={editMinutes}
              onChange={(e) => setEditMinutes(e.target.value)}
              onBlur={handleTimeSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTimeSubmit()}
              className="w-24 h-12 text-3xl font-bold text-center bg-black/20 border-white/20 text-white"
              min={1}
              max={120}
            />
            <span className="text-xl text-white/50">min</span>
          </div>
        ) : (
          <span
            className={`time-text ${isRunning ? 'running' : ''} ${!isRunning ? 'cursor-pointer hover:scale-105' : ''}`}
            onClick={handleTimeClick}
            title={isRunning ? "计时中无法修改" : "点击修改时间"}
          >
            {formattedTime}
          </span>
        )}
      </div>

      {/* Mode Selector - only show when idle */}
      {mode === 'idle' && onSetMode && (
        <div className="mode-selector">
          <button
            className="mode-btn"
            onClick={() => onSetMode('work')}
            title={`专注 ${Math.floor(workDuration / 60)} 分钟`}
          >
            <Brain size={14} />
            <span>专注</span>
          </button>
          <button
            className="mode-btn"
            onClick={() => onSetMode('break')}
            title={`短休息 ${Math.floor(breakDuration / 60)} 分钟`}
          >
            <Coffee size={14} />
            <span>休息</span>
          </button>
          <button
            className="mode-btn"
            onClick={() => onSetMode('longBreak')}
            title={`长休息 ${Math.floor(longBreakDuration / 60)} 分钟`}
          >
            <Coffee size={14} />
            <span>长休息</span>
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="progress-container">
        <Progress
          value={progress}
          className="timer-progress"
        />
      </div>

      {/* Controls */}
      <div className="timer-controls">
        {mode === 'idle' ? (
          <Button
            size="sm"
            className="control-btn-primary"
            onClick={onStart}
          >
            <Play size={16} className="mr-1" />
            开始专注
          </Button>
        ) : (
          <>
            {isRunning ? (
              <Button
                size="sm"
                variant="outline"
                className="control-btn"
                onClick={onPause}
              >
                <Pause size={16} />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="control-btn"
                onClick={onResume}
              >
                <Play size={16} />
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="control-btn"
              onClick={onStop}
            >
              <Square size={16} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="control-btn"
              onClick={onSkip}
            >
              <SkipForward size={16} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
