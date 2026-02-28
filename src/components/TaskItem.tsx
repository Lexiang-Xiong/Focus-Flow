import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Trash2, Edit2, GripVertical, ChevronDown, ChevronUp, ChevronRight, Flag, RotateCcw, Clock, Plus, Calendar, Pin } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useState, useRef, useEffect, useMemo } from 'react';
import type { Task, TaskPriority, DeadlineType } from '@/types';
import { formatDuration } from '@/types';
import { getDeadlineStatus, getAbsoluteUrgencyColor, convertDeadlineType, getInheritedDeadline } from '@/lib/urgency-utils';
import { useAppStore } from '@/store';
import { useTranslation } from 'react-i18next';

interface TaskItemProps {
  task: Task;
  zoneColor: string;
  isActive: boolean;
  isTimerRunning: boolean;
  isDragOver?: boolean;
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
  getTotalWorkTime?: (taskId: string) => number;
  getEstimatedTime?: (taskId: string) => number;
  rankScores?: Record<string, number>;  // 排名分数
  allTasks?: Task[];  // 所有任务，用于计算排名
}

export function TaskItem({
  task,
  zoneColor,
  isActive,
  isTimerRunning,
  isDragOver = false,
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
  getTotalWorkTime,
  getEstimatedTime,
  // rankScores 不再需要用于紧迫性显示（使用绝对时间）
  allTasks = [],
}: TaskItemProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description);
  const [editEstimatedTime, setEditEstimatedTime] = useState(task.estimatedTime?.toString() || '');
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [editDeadline, setEditDeadline] = useState<number | null>(task.deadline || null);
  const [editDeadlineType, setEditDeadlineType] = useState<DeadlineType>(task.deadlineType || 'none');
  const [editHour, setEditHour] = useState<number>(task.deadline ? new Date(task.deadline).getHours() : 23);
  const [editMinute, setEditMinute] = useState<number>(task.deadline ? new Date(task.deadline).getMinutes() : 59);
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

  // 同步截止日期编辑状态
  useEffect(() => {
    setEditDeadline(task.deadline || null);
    setEditDeadlineType(task.deadlineType || 'none');
    if (task.deadline) {
      const date = new Date(task.deadline);
      setEditHour(date.getHours());
      setEditMinute(date.getMinutes());
    }
  }, [task.deadline, task.deadlineType, showDeadlinePicker]);

  const style: React.CSSProperties = {
    // 只有可拖拽时才应用 transform，避免子任务缩进被覆盖
    transform: isDraggable ? CSS.Transform.toString(transform) : undefined,
    transition: isDraggable ? transition : undefined,
    opacity: isDragging ? 0.5 : 1,
    // 通过 paddingLeft 实现缩进
    paddingLeft: `${depth * 24}px`,
  };

  const handleSave = () => {
    if (editTitle.trim()) {
      const estimatedTimeValue = editEstimatedTime ? parseInt(editEstimatedTime, 10) : undefined;
      onUpdate(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        estimatedTime: (estimatedTimeValue !== undefined && !isNaN(estimatedTimeValue) && estimatedTimeValue > 0)
          ? estimatedTimeValue
          : undefined,
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // 阻止 textarea 默认的换行行为
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

  // 从 store 获取所有任务，用于计算截止日期继承
  const allTasksFromStore = useAppStore((state) => state.tasks);

  // 计算任务的紧迫程度（用于热力条颜色）- 使用绝对时间计算7档位
  const { urgencyColor, deadlineText, isOverdue, inheritedDeadline } = useMemo(() => {
    // 使用 store 中的所有任务来计算继承关系
    const tasksForInheritance = allTasks.length > 0 ? allTasks : allTasksFromStore;
    // 获取继承后的截止日期
    const inherited = getInheritedDeadline(task, tasksForInheritance);
    const { text: deadlineText, isOverdue } = getDeadlineStatus(inherited);
    // 使用绝对时间计算紧迫性颜色（7档位：赤橙黄绿青蓝紫 + 灰 + 深红）
    const color = getAbsoluteUrgencyColor(inherited, isOverdue);
    return { urgencyColor: color, deadlineText, isOverdue, inheritedDeadline: inherited };
  }, [task.id, task.deadline, task.parentId, allTasks, allTasksFromStore]);

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
        return t('task.priorityHigh');
      case 'medium':
        return t('task.priorityMedium');
      case 'low':
        return t('task.priorityLow');
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-item group relative ${task.completed ? 'completed' : ''} ${isActive ? 'active' : ''} ${isTimerRunning && isActive ? 'working' : ''} ${depth > 0 ? 'subtask' : ''} ${isDragOver ? 'drag-over' : ''}`}
      onClick={() => {
        // 点击任务项的空白区域时触发选择
        if (!isEditing) {
          onSelect?.(task.id);
        }
      }}
    >
      {/* 极简视觉引导 - 左侧分区颜色条：hover/激活时显示 */}
      <div
        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm transition-opacity duration-200"
        style={{
          backgroundColor: zoneColor,
          opacity: isActive || isTimerRunning ? 1 : 0,
        }}
      />
      <div
        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm bg-white/20 transition-opacity duration-200 group-hover:opacity-100 opacity-0 pointer-events-none"
      />

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

      {/* Urgency Heat Bar - 显示在任务左侧，根据紧迫程度变色（未完成任务都显示） */}
      {!task.completed && (
        <div
          className="absolute left-0 top-1 bottom-1 w-[4px] rounded-r-md transition-colors duration-300"
          style={{ backgroundColor: urgencyColor }}
          title={deadlineText || (inheritedDeadline ? `${t('task.remaining')} ${deadlineText}` : t('task.noDeadline'))}
        />
      )}

      {/* Checkbox */}
      <button
        className={`task-checkbox ${task.completed ? 'checked' : ''}`}
        onClick={handleCheckboxClick}
      >
        {task.completed && <Check size={12} />}
      </button>

      {/* Subtask Buttons Container - vertically stacked */}
      <div className="subtask-buttons-container">
        {/* Add Subtask Button - 只在传递了onAddSubtask回调时显示 */}
        {onAddSubtask && (
          <button
            className="add-subtask-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAddSubtask?.(task.id);
            }}
            title={t('task.addSubtask')}
          >
            <Plus size={12} />
          </button>
        )}

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
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder="任务描述（可选，Shift+Enter 换行）"
              className="task-edit-input description min-h-[32px] resize-none py-1"
              rows={1}
            />
            <Input
              type="number"
              value={editEstimatedTime}
              onChange={(e) => setEditEstimatedTime(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder="预期时间（分钟，可选）"
              className="task-edit-input estimated-time"
              min="0"
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

            {/* Deadline Display with Edit - always visible */}
            <div className="mt-1">
              <Popover open={showDeadlinePicker} onOpenChange={setShowDeadlinePicker}>
                <PopoverTrigger asChild>
                  <button
                    className={`text-[10px] flex items-center gap-1 hover:bg-white/10 px-1 py-0.5 rounded transition-colors border ${isOverdue ? 'text-red-500 font-bold border-red-500/50' : inheritedDeadline && inheritedDeadline > 0 ? 'text-green-400 border-green-500/50 hover:text-green-300 hover:border-green-400' : 'border-white/30 text-white/50 hover:text-white/80 hover:border-white/50'}`}
                    title="点击修改截止日期"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Calendar size={10} />
                    {inheritedDeadline && inheritedDeadline > 0 ? (
                      <span>{deadlineText}{task.parentId && !task.deadline && <span className="text-white/40 ml-0.5">{t('task.inherited')}</span>}</span>
                    ) : (
                      <span className="italic">{t('task.setDeadline')}</span>
                    )}
                  </button>
                </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-2 bg-black border border-white/20 max-h-[90vh] overflow-y-auto z-[9999]"
                    align="start"
                    side="bottom"
                    sideOffset={4}
                    collisionPadding={20}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CalendarComponent
                      mode="single"
                      selected={editDeadline ? new Date(editDeadline) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          // 保持之前选择的时间，只更新日期
                          date.setHours(editHour, editMinute, 0, 0);
                          setEditDeadline(date.getTime());
                          setEditDeadlineType('exact');
                        }
                      }}
                      className="rounded-md my-2"
                      classNames={{
                        root: "calendar-dark",
                        months: "flex flex-col gap-1 relative",
                        month: "flex flex-col",
                        caption: "flex justify-center items-center py-1 relative",
                        caption_label: "text-sm font-medium text-white",
                        nav: "absolute inset-x-0 top-1 flex items-center justify-between w-full z-10 px-1",
                        nav_button: "h-6 w-6 bg-black p-0 text-white hover:bg-white hover:text-black rounded flex items-center justify-center transition-colors text-xs border border-white/20",
                        nav_button_previous: "",
                        nav_button_next: "",
                        table: "w-full border-collapse space-y-1",
                        head_row: "flex",
                        head_cell: "text-white/50 rounded-md w-9 font-normal text-[0.8rem]",
                        row: "flex w-full mt-1",
                        cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                        day: "h-9 w-9 p-0 font-normal text-white bg-black hover:bg-white hover:text-black rounded-md transition-colors",
                        day_selected: "bg-white text-black hover:bg-white hover:text-black",
                        day_today: "border border-green-500 text-green-400",
                        day_outside: "text-white/30 opacity-50",
                        day_disabled: "text-white/30 opacity-50",
                        day_hidden: "invisible",
                      }}
                    />
                    {/* 时间选择器和快捷按钮 */}
                    <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-white/80">时间:</span>
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={editHour}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
                            setEditHour(val);
                          }}
                          className="w-10 h-6 text-xs bg-black/60 border border-green-500/50 rounded px-1 text-center text-green-400 focus:border-green-400 focus:outline-none"
                        />
                        <span className="text-white/80">:</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={editMinute}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                            setEditMinute(val);
                          }}
                          className="w-10 h-6 text-xs bg-black/60 border border-green-500/50 rounded px-1 text-center text-green-400 focus:border-green-400 focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 px-2 text-xs ${editDeadlineType === 'today' ? 'bg-white text-black' : 'text-white hover:bg-white hover:text-black'}`}
                          onClick={() => {
                            const result = convertDeadlineType('today');
                            setEditDeadline(result.deadline);
                            setEditDeadlineType(result.deadlineType);
                          }}
                        >
                          {t('task.deadlineToday')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 px-2 text-xs ${editDeadlineType === 'tomorrow' ? 'bg-white text-black' : 'text-white hover:bg-white hover:text-black'}`}
                          onClick={() => {
                            const result = convertDeadlineType('tomorrow');
                            setEditDeadline(result.deadline);
                            setEditDeadlineType(result.deadlineType);
                          }}
                        >
                          {t('task.deadlineTomorrow')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 px-2 text-xs ${editDeadlineType === 'week' ? 'bg-white text-black' : 'text-white hover:bg-white hover:text-black'}`}
                          onClick={() => {
                            const result = convertDeadlineType('week');
                            setEditDeadline(result.deadline);
                            setEditDeadlineType(result.deadlineType);
                          }}
                        >
                          {t('task.deadlineWeek')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 px-2 text-xs ${editDeadlineType === 'none' ? 'bg-white text-black' : 'text-white hover:bg-white hover:text-black'}`}
                          onClick={() => {
                            setEditDeadline(null);
                            setEditDeadlineType('none');
                          }}
                        >
                          {t('task.deadlineNone')}
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 group">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 bg-black text-white hover:bg-white hover:text-black"
                        onClick={() => {
                          // 使用编辑的时间和日期创建新的截止时间
                          if (editDeadline) {
                            const date = new Date(editDeadline);
                            date.setHours(editHour, editMinute, 0, 0);
                            onUpdate(task.id, { deadline: date.getTime(), deadlineType: 'exact' });
                          } else {
                            onUpdate(task.id, { deadline: editDeadline, deadlineType: editDeadlineType });
                          }
                          setShowDeadlinePicker(false);
                        }}
                      >
                        {t('common.save')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 bg-black text-white hover:bg-white hover:text-black"
                        onClick={() => {
                          setEditDeadline(task.deadline || null);
                          setEditDeadlineType(task.deadlineType || 'none');
                          setShowDeadlinePicker(false);
                        }}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
            </div>

            {/* Work Time Display */}
            <div className="task-work-time">
              <Clock size={10} className={isTimerRunning && isActive ? 'pulse' : ''} />
              {/* 使用动态计算的 totalWorkTime */}
              <span>{t('task.totalWorkTime')}: {formatDuration(getTotalWorkTime ? getTotalWorkTime(task.id) : (task.totalWorkTime || 0))}</span>
              {/* 显示预期时间：区分手动设置和自动继承 */}
              {(() => {
                const estimated = getEstimatedTime ? getEstimatedTime(task.id) : (task.estimatedTime || 0);
                if (estimated > 0) {
                  // 检查是否手动设置了预期时间
                  const isManual = task.estimatedTime !== undefined && task.estimatedTime > 0;
                  const isInherited = !isManual && hasChildren;
                  return (
                    <span className="estimated-time" title={isManual ? "手动设置的预期时间" : "从子任务继承的预期时间"}>
                      / 预期: {estimated}m{isInherited ? '+' : ''}
                    </span>
                  );
                }
                return null;
              })()}
              {/* 显示独立时间（自己的 ownTime） */}
              {(task.ownTime || 0) > 0 && (
                <span className="own-time" title="在该任务上独立花费的时间（不含子任务）">
                  (独立: {formatDuration(task.ownTime || 0)})
                </span>
              )}
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

      {/* Priority */}
      <div className="task-priority-wrapper">
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
        {/* Prevent Auto Complete Switch - 只有有子任务时才显示 */}
        {hasChildren && (
          <button
            className={`task-action-btn ${task.preventAutoComplete ? 'prevent-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(task.id, { preventAutoComplete: !task.preventAutoComplete });
            }}
            title={task.preventAutoComplete ? t('task.preventAutoCompleteEnabled') : t('task.preventAutoCompleteDisabled')}
          >
            <Pin size={12} />
          </button>
        )}
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
