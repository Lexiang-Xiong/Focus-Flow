import { Clock, Play, Pause, ChevronUp } from 'lucide-react';

interface CollapseButtonProps {
  pendingTasks: number;
  isTimerRunning: boolean;
  timerMode: 'work' | 'break' | 'longBreak' | 'idle';
  formattedTime: string;
  activeTaskId: string | null;
  taskTitle: string;
  progress: number;
  onStart: () => void;
  onPause: () => void;
  onResume?: () => void;
  onExpand: () => void;
}

// 获取进度条颜色
const getProgressColor = (mode: string): string => {
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

export function CollapseButton({
  pendingTasks,
  isTimerRunning,
  timerMode,
  formattedTime,
  activeTaskId: _activeTaskId,
  taskTitle,
  progress,
  onStart,
  onPause,
  onResume,
  onExpand,
}: CollapseButtonProps) {
  void _activeTaskId; // 预留参数
  const getModeColor = () => {
    if (isTimerRunning) {
      switch (timerMode) {
        case 'work':
          return '#3b82f6';
        case 'break':
          return '#22c55e';
        case 'longBreak':
          return '#8b5cf6';
        default:
          return '#6366f1';
      }
    }
    return '#6366f1';
  };

  const handleTimerAction = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isTimerRunning) {
      onPause();
    } else if (timerMode !== 'idle' && onResume) {
      onResume();
    } else {
      onStart();
    }
  };

  return (
    <div
      className="collapse-float"
      data-tauri-drag-region
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        left: 0,
        top: 0,
        transform: 'none',
        '--accent-color': getModeColor(),
      } as React.CSSProperties}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onExpand();
      }}
    >
      {/* 展开提示 */}
      <div className="float-expand-hint" onClick={(e) => { e.stopPropagation(); onExpand(); }} style={{ cursor: 'pointer' }}>
        <ChevronUp size={12} />
      </div>

      {/* 左侧：任务信息 */}
      <div className="float-task-info" style={{ pointerEvents: 'none' }}>
        <span className="float-task-title" title={taskTitle}>
          {taskTitle}
        </span>
        {pendingTasks > 0 && (
          <span className="float-task-badge">{pendingTasks}</span>
        )}
      </div>

      {/* 中间：计时器 */}
      <div className="float-timer" style={{ pointerEvents: 'none' }}>
        <Clock size={14} className="float-timer-icon" />
        <span className="float-timer-text">{formattedTime}</span>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="float-action-area">
        <button
          className={`float-action-btn ${isTimerRunning ? 'running' : ''}`}
          onClick={handleTimerAction}
          title={isTimerRunning ? '暂停' : '开始'}
        >
          {isTimerRunning ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          className="float-action-btn expand"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          title="展开"
        >
          <ChevronUp size={16} />
        </button>
      </div>

      {/* 底部进度条 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '2px',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: getProgressColor(timerMode),
            transition: 'width 0.3s ease, background-color 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}
