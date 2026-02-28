import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editMinutes, setEditMinutes] = useState('');
  // 默认收起状态
  const [isCollapsed, setIsCollapsed] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // 鼠标进入时不做任何操作（取消自动展开）
  const handleMouseEnter = () => {};

  // 鼠标离开时只处理编辑状态的取消（取消自动收起）
  const handleMouseLeave = () => {
    if (isEditing) {
      setIsEditing(false);
      setEditMinutes('');
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
        return t('timer.work');
      case 'break':
        return t('timer.break');
      case 'longBreak':
        return t('timer.longBreak');
      default:
        return t('timer.idle');
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

  // 获取进度条颜色（亮色）
  const getProgressColor = () => {
    switch (mode) {
      case 'work':
        return '#60a5fa'; // blue-400
      case 'break':
        return '#4ade80'; // green-400
      case 'longBreak':
        return '#c084fc'; // purple-400
      default:
        return '#d1d5db'; // gray-300
    }
  };

  // 收缩状态下的紧凑视图 - 控制按钮独立侧边栏
  if (isCollapsed) {
    return (
      <div className="timer-collapsed-wrapper">
        {/* 主计时区域 */}
        <div
          className={`timer-collapsed-main bg-gradient-to-r ${getModeColor()}`}
        >
          <button
            className="timer-collapse-btn"
            onClick={() => setIsCollapsed(false)}
            title={t('view.expand') || 'Expand'}
          >
            <ChevronUp size={14} />
          </button>
          {/* 时间显示区域 - 支持点击修改时间 */}
          <div className="timer-collapsed-content" onClick={handleTimeClick}>
            {isEditing ? (
              <div className="flex items-center gap-1">
                <Input
                  ref={inputRef}
                  type="number"
                  value={editMinutes}
                  onChange={(e) => setEditMinutes(e.target.value)}
                  onBlur={handleTimeSubmit}
                  onKeyDown={(e) => e.key === 'Enter' && handleTimeSubmit()}
                  className="w-14 h-6 text-sm font-bold text-center bg-black/20 border-white/20 text-white"
                  min={1}
                  max={120}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-xs text-white/50">min</span>
              </div>
            ) : (
              <>
                {getModeIcon()}
                <span
                  className={`timer-collapsed-time ${!isRunning ? 'cursor-pointer' : ''}`}
                  style={isRunning ? { color: getProgressColor() } : undefined}
                  title={isRunning ? t('timer.runningNoEdit') || 'Cannot edit while running' : t('timer.clickToEdit') || 'Click to edit'}
                >
                  {formattedTime}
                </span>
              </>
            )}
          </div>
        </div>
        {/* 控制按钮区域 */}
        <div className={`timer-collapsed-controls bg-gradient-to-r ${getModeColor()}`}>
          {isRunning ? (
            <button className="timer-collapsed-btn primary" onClick={onPause} title={t('timer.pause')}>
              <Pause size={20} />
            </button>
          ) : mode !== 'idle' ? (
            <button className="timer-collapsed-btn primary" onClick={onResume} title={t('timer.resume')}>
              <Play size={20} />
            </button>
          ) : (
            <button className="timer-collapsed-btn primary" onClick={onStart} title={t('timer.startFocus')}>
              <Play size={20} />
            </button>
          )}
          <button className="timer-collapsed-btn" onClick={onStop} title={t('common.reset')}>
            <Square size={20} />
          </button>
        </div>
        {/* 进度条 */}
        <div className="timer-collapsed-progress">
          <Progress value={progress} className="timer-progress" style={{ backgroundColor: getProgressColor() }} />
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
            title={t('view.collapse') || 'Collapse'}
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
            style={isRunning ? { color: getProgressColor() } : undefined}
            onClick={handleTimeClick}
            title={isRunning ? t('timer.runningNoEdit') || 'Cannot edit while running' : t('timer.clickToEdit') || 'Click to edit'}
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
            title={`${t('timer.work')} ${Math.floor(workDuration / 60)} ${t('settings.workDurationMinutes')}`}
          >
            <Brain size={14} />
            <span>{t('timer.work')}</span>
          </button>
          <button
            className="mode-btn"
            onClick={() => onSetMode('break')}
            title={`${t('timer.break')} ${Math.floor(breakDuration / 60)} ${t('settings.workDurationMinutes')}`}
          >
            <Coffee size={14} />
            <span>{t('timer.break')}</span>
          </button>
          <button
            className="mode-btn"
            onClick={() => onSetMode('longBreak')}
            title={`${t('timer.longBreak')} ${Math.floor(longBreakDuration / 60)} ${t('settings.workDurationMinutes')}`}
          >
            <Coffee size={14} />
            <span>{t('timer.longBreak')}</span>
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="progress-container">
        <Progress
          value={progress}
          className="timer-progress"
          style={{ backgroundColor: getProgressColor() }}
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
            {t('timer.startFocus')}
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
