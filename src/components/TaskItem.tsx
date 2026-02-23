import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Trash2, Edit2, GripVertical, ChevronDown, ChevronUp, ChevronRight, Flag, RotateCcw, Clock, Zap, Plus } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState, useRef, useEffect } from 'react';
import type { Task, TaskPriority, TaskUrgency } from '@/types';
import { formatDuration } from '@/types';

interface TaskItemProps {
  task: Task;
  zoneColor: string;
  isActive: boolean;
  isTimerRunning: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Omit<Task, 'id'>>) => void;
  onToggleExpanded: (id: string) => void;
  onToggleSubtasksCollapsed?: (id: string) => void;
  onAddSubtask?: (parentId: string) => void;
  onZoomIn?: (id: string) => void;
  onSelect?: (id: string) => void;
  hasChildren?: boolean;
  depth?: number;
  isDraggable?: boolean;
}

export function TaskItem({
  task,
  zoneColor,
  isActive,
  isTimerRunning,
  onToggle,
  onDelete,
  onUpdate,
  onToggleExpanded,
  onToggleSubtasksCollapsed,
  onAddSubtask,
  onZoomIn,
  onSelect,
  hasChildren = false,
  depth = 0,
  isDraggable = true,
}: TaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showUrgencyMenu, setShowUrgencyMenu] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !isDraggable });

  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditing]);

  const style: React.CSSProperties = {
    // 只有可拖拽时才应用 transform，避免子任务缩进被覆盖
    transform: isDraggable ? CSS.Transform.toString(transform) : undefined,
    transition: isDraggable ? transition : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSave = () => {
    if (editTitle.trim()) {
      onUpdate(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
      });
    }
    setIsEditing(false);
  };

  // 处理编辑区域失去焦点 - 使用 setTimeout 延迟判断，给用户切换输入框的时间
  const handleBlur = () => {
    // 延迟检查，确保用户不是切换到另一个输入框
    setTimeout(() => {
      // 检查当前是否仍然有焦点在任何输入框上
      const activeElement = document.activeElement;
      const isFocusInsideForm = activeElement?.closest('.task-edit-form');
      if (!isFocusInsideForm) {
        handleSave();
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditTitle(task.title);
      setEditDescription(task.description);
      setIsEditing(false);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(task.id);
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 标题点击只触发进入下级，不触发选择
    if (onZoomIn) {
      onZoomIn(task.id);
    }
  };

  const handleContentClick = (e: React.MouseEvent) => {
    // 点击任务内容区域（非按钮部分）才触发选择
    e.stopPropagation();
    if (!isEditing) {
      onSelect?.(task.id);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 编辑模式下不触发展开/收缩
    if (!isEditing) {
      onToggleExpanded(task.id);
    }
  };

  const handleResetWorkTime = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(task.id, { totalWorkTime: 0 });
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#eab308';
      case 'low':
        return '#22c55e';
    }
  };

  const getPriorityLabel = (priority: TaskPriority) => {
    switch (priority) {
      case 'high':
        return '高';
      case 'medium':
        return '中';
      case 'low':
        return '低';
    }
  };

  const getUrgencyColor = (urgency: TaskUrgency) => {
    switch (urgency) {
      case 'urgent':
        return '#dc2626';
      case 'high':
        return '#f97316';
      case 'medium':
        return '#eab308';
      case 'low':
        return '#22c55e';
    }
  };

  const getUrgencyLabel = (urgency: TaskUrgency) => {
    switch (urgency) {
      case 'urgent':
        return '急';
      case 'high':
        return '高';
      case 'medium':
        return '中';
      case 'low':
        return '低';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-item ${task.completed ? 'completed' : ''} ${isActive ? 'active' : ''} ${isTimerRunning && isActive ? 'working' : ''} ${depth > 0 ? 'subtask' : ''}`}
      onClick={(e) => {
        // 点击任务项的空白区域时触发选择
        if (!isEditing) {
          onSelect?.(task.id);
        }
      }}
    >
      {/* Drag Handle */}
      {isDraggable ? (
        <div className="task-drag-handle" {...attributes} {...listeners}>
          <GripVertical size={14} className="text-white/30" />
        </div>
      ) : (
        <div className="task-drag-handle invisible">
          <GripVertical size={14} />
        </div>
      )}

      {/* Zone Color Indicator */}
      <div
        className="task-zone-indicator"
        style={{ backgroundColor: zoneColor }}
      />

      {/* Checkbox */}
      <button
        className={`task-checkbox ${task.completed ? 'checked' : ''}`}
        onClick={handleCheckboxClick}
      >
        {task.completed && <Check size={12} />}
      </button>

      {/* Subtask Buttons Container - vertically stacked */}
      <div className="subtask-buttons-container">
        {/* Add Subtask Button */}
        <button
          className="add-subtask-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAddSubtask?.(task.id);
          }}
          title="添加子任务"
        >
          <Plus size={12} />
        </button>

        {/* Subtask Toggle Button */}
        {hasChildren && (
          <button
            className="subtask-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSubtasksCollapsed?.(task.id);
            }}
            title={task.isCollapsed ? '展开子任务' : '收起子任务'}
          >
            {task.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* Task Content */}
      <div className="task-content-wrapper" onClick={handleContentClick} onDoubleClick={handleDoubleClick}>
        {isEditing ? (
          <div className="task-edit-form">
            <Input
              ref={titleInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder="任务标题"
              className="task-edit-input"
            />
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder="任务描述（可选）"
              className="task-edit-input description"
            />
          </div>
        ) : (
          <div className="task-content">
            <div className="task-header-row">
              <span
                className={`task-title ${onZoomIn ? 'cursor-pointer hover:text-blue-400 hover:underline' : ''}`}
                onClick={handleTitleClick}
                title={onZoomIn ? "点击进入该任务视图" : undefined}
              >
                {task.title}
              </span>
              {task.description && (
                <button
                  className="task-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpanded(task.id);
                  }}
                >
                  {task.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>
            {task.expanded && task.description && (
              <div className="task-description">{task.description}</div>
            )}
            
            {/* Work Time Display */}
            <div className="task-work-time">
              <Clock size={10} className={isTimerRunning && isActive ? 'pulse' : ''} />
              <span>累计: {formatDuration(task.totalWorkTime || 0)}</span>
              <button
                className="reset-work-time-btn"
                onClick={handleResetWorkTime}
                title="清零累计时间"
              >
                <RotateCcw size={10} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Priority and Urgency */}
      <div className="task-priority-wrapper">
        {/* Urgency */}
        <button
          className="task-urgency"
          style={{ color: getUrgencyColor(task.urgency) }}
          onClick={(e) => {
            e.stopPropagation();
            setShowUrgencyMenu(!showUrgencyMenu);
          }}
        >
          <Zap size={12} />
          <span>{getUrgencyLabel(task.urgency)}</span>
        </button>
        {showUrgencyMenu && (
          <div className="urgency-menu">
            {(['urgent', 'high', 'medium', 'low'] as TaskUrgency[]).map((u) => (
              <button
                key={u}
                className={`urgency-option ${task.urgency === u ? 'selected' : ''}`}
                style={{ color: getUrgencyColor(u) }}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(task.id, { urgency: u });
                  setShowUrgencyMenu(false);
                }}
              >
                <Zap size={10} />
                <span>{getUrgencyLabel(u)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Priority */}
        <button
          className="task-priority"
          style={{ color: getPriorityColor(task.priority) }}
          onClick={(e) => {
            e.stopPropagation();
            setShowPriorityMenu(!showPriorityMenu);
          }}
        >
          <Flag size={12} />
          <span>{getPriorityLabel(task.priority)}</span>
        </button>
        {showPriorityMenu && (
          <div className="priority-menu">
            {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => (
              <button
                key={p}
                className={`priority-option ${task.priority === p ? 'selected' : ''}`}
                style={{ color: getPriorityColor(p) }}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(task.id, { priority: p });
                  setShowPriorityMenu(false);
                }}
              >
                <Flag size={10} />
                <span>{getPriorityLabel(p)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="task-actions">
        <Button
          size="icon"
          variant="ghost"
          className="task-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
        >
          <Edit2 size={12} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="task-action-btn delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
        >
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  );
}
