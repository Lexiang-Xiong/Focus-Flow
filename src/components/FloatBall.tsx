import { useState, useCallback } from 'react';
import { Clock, Play, Pause, ChevronUp } from 'lucide-react';

interface FloatBallProps {
  pendingTasks: number;
  isTimerRunning: boolean;
  timerMode: 'work' | 'break' | 'longBreak' | 'idle';
  formattedTime: string;
  activeTaskId: string | null;
  taskTitle: string;
  onStart: () => void;
  onPause: () => void;
  onExpand: () => void;
}

// Tauri API wrapper
const tauriWindow = {
  startDraggingWithMove: (startX: number, startY: number) => {
    const moveHandler = async (e: MouseEvent) => {
      try {
        const { getCurrentWindow, PhysicalPosition } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const deltaX = e.screenX - startX;
        const deltaY = e.screenY - startY;
        const position = await win.outerPosition();
        await win.setPosition(new PhysicalPosition(position.x + deltaX, position.y + deltaY));
      } catch {
        // 忽略错误
      }
    };

    const upHandler = () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  },
  hide: async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().hide();
    } catch {
      // Browser mode
    }
  },
  show: async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().show();
    } catch {
      // Browser mode
    }
  },
  setFocus: async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFocus();
    } catch {
      // Browser mode
    }
  },
};

export function FloatBall({
  pendingTasks,
  isTimerRunning,
  timerMode,
  formattedTime,
  activeTaskId,
  taskTitle,
  onStart,
  onPause,
  onExpand,
}: FloatBallProps) {
  const [, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 如果点击的是按钮区域，不触发拖动
    if ((e.target as HTMLElement).closest('.float-action-area')) {
      return;
    }

    setIsDragging(true);
    tauriWindow.startDraggingWithMove(e.screenX, e.screenY);

    // 短暂延迟后重置拖动状态
    setTimeout(() => setIsDragging(false), 100);
  }, []);

  const handleTimerAction = () => {
    if (!activeTaskId && !isTimerRunning) {
      return;
    }

    if (isTimerRunning) {
      onPause();
    } else {
      onStart();
    }
  };

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

  return (
    <div
      className="float-ball"
      style={{
        '--accent-color': getModeColor(),
      } as React.CSSProperties}
      onMouseDown={handleMouseDown}
    >
      {/* 展开提示 */}
      <div className="float-expand-hint">
        <ChevronUp size={12} />
      </div>

      {/* 左侧：任务信息 */}
      <div className="float-task-info">
        <span className="float-task-title" title={taskTitle}>
          {taskTitle}
        </span>
        {pendingTasks > 0 && (
          <span className="float-task-badge">{pendingTasks}</span>
        )}
      </div>

      {/* 中间：计时器 */}
      <div className="float-timer">
        <Clock size={14} className="float-timer-icon" />
        <span className="float-timer-text">{formattedTime}</span>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="float-action-area">
        <button
          className={`float-action-btn ${isTimerRunning ? 'running' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            handleTimerAction();
          }}
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
    </div>
  );
}

// 独立窗口版本的入口组件
export function FloatBallWindow() {
  // 从URL参数或storage获取状态
  // 在实际部署时，主窗口和浮动球窗口可以共享同一个storage
  // 这里暂时返回一个简单的占位符

  return (
    <div className="float-ball-window-container">
      <div className="loading-text">加载中...</div>
    </div>
  );
}
