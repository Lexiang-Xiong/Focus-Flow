import { useState, useRef, useEffect } from 'react';
import { Pin, Minus, X, GripHorizontal, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
          <span className="title-text">{t('app.name')}</span>
        </div>
        <div className="window-controls no-drag" data-tauri-drag-region="false">
          <button
            className={`control-btn ${isPinned ? 'active' : ''}`}
            onClick={togglePin}
            title={isPinned ? t('window.unpin') : t('window.pin')}
          >
            <Pin size={14} />
          </button>
          {onCollapse && (
            <button
              className="control-btn"
              onClick={onCollapse}
              title={t('window.collapseToBall')}
            >
              <ChevronDown size={14} />
            </button>
          )}
          <button
            className="control-btn"
            onClick={handleMinimize}
            title={t('window.minimize')}
          >
            <Minus size={14} />
          </button>
          <button
            className="control-btn close"
            onClick={handleClose}
            title={t('window.close')}
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
