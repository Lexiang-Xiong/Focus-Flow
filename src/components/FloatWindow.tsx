import { useState, useRef, useEffect } from 'react';
import { Pin, Minus, X, GripHorizontal, ChevronDown } from 'lucide-react';

interface FloatWindowProps {
  children: React.ReactNode;
  onCollapse?: () => void;
}

// Tauri API wrapper for browser compatibility
const tauriWindow = {
  setAlwaysOnTop: async (value: boolean) => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setAlwaysOnTop(value);
    } catch {
      // Browser mode
    }
  },
  minimize: async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {
      // Browser mode
    }
  },
  close: async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {
      // Browser mode
    }
  },
  isVisible: async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      return await getCurrentWindow().isVisible();
    } catch {
      return true;
    }
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

export function FloatWindow({ children, onCollapse }: FloatWindowProps) {
  const [isPinned, setIsPinned] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Toggle always on top
  const togglePin = async () => {
    await tauriWindow.setAlwaysOnTop(!isPinned);
    setIsPinned(!isPinned);
  };

  // Minimize window
  const handleMinimize = async () => {
    await tauriWindow.minimize();
  };

  // Close window
  const handleClose = async () => {
    await tauriWindow.close();
    // Fallback for browser mode
    if (containerRef.current) {
      containerRef.current.style.display = 'none';
    }
  };

  // Keyboard shortcut to show/hide (Ctrl/Cmd + Shift + T)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        const isVisible = await tauriWindow.isVisible();
        if (isVisible) {
          await tauriWindow.hide();
        } else {
          await tauriWindow.show();
          await tauriWindow.setFocus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className="float-window"
    >
      {/* Title bar */}
      <div
        className="title-bar"
        data-tauri-drag-region
      >
        <div className="drag-handle" style={{ pointerEvents: 'none' }}>
          <GripHorizontal size={14} className="text-white/50" />
          <span className="title-text">浮动待办</span>
        </div>
        <div className="window-controls no-drag" data-tauri-drag-region="false">
          <button
            className={`control-btn ${isPinned ? 'active' : ''}`}
            onClick={togglePin}
            title={isPinned ? '取消置顶' : '置顶窗口'}
          >
            <Pin size={14} />
          </button>
          {onCollapse && (
            <button
              className="control-btn"
              onClick={onCollapse}
              title="收起为悬浮球"
            >
              <ChevronDown size={14} />
            </button>
          )}
          <button
            className="control-btn"
            onClick={handleMinimize}
            title="最小化"
          >
            <Minus size={14} />
          </button>
          <button
            className="control-btn close"
            onClick={handleClose}
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="content-area">
        {children}
      </div>
    </div>
  );
}
