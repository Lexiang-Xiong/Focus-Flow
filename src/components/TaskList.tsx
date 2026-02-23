import { useState, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TaskItem } from './TaskItem';
import type { Task, TaskPriority, Zone } from '@/types';

interface TaskListProps {
  zone: Zone | null;
  zones: Zone[];
  tasks: Task[];
  activeTaskId: string | null;
  isTimerRunning: boolean;
  onAddTask: (zoneId: string, title: string, description: string, priority?: TaskPriority) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => void;
  onToggleExpanded: (id: string) => void;
  onReorderTasks: (zoneId: string, tasks: Task[]) => void;
  onSelectTask: (id: string) => void;
  onClearCompleted: () => void;
}

export function TaskList({
  zone,
  zones,
  tasks,
  activeTaskId,
  isTimerRunning,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onUpdateTask,
  onToggleExpanded,
  onReorderTasks,
  onSelectTask,
  onClearCompleted,
}: TaskListProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority>('medium');
  const [showCompleted, setShowCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const handleAddTask = () => {
    if (newTaskTitle.trim() && zone) {
      onAddTask(zone.id, newTaskTitle.trim(), newTaskDescription.trim(), selectedPriority);
      setNewTaskTitle('');
      setNewTaskDescription('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTask();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = incompleteTasks.findIndex((t) => t.id === active.id);
      const newIndex = incompleteTasks.findIndex((t) => t.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(incompleteTasks, oldIndex, newIndex);
        onReorderTasks(zone?.id || '', reordered);
      }
    }
  };

  const getZoneColor = (zoneId: string) => {
    const z = zones.find((z) => z.id === zoneId);
    return z?.color || '#6b7280';
  };

  const stats = {
    total: tasks.length,
    completed: completedTasks.length,
    pending: incompleteTasks.length,
    completionRate: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
  };

  if (!zone) {
    return (
      <div className="task-list-empty">
        <p>请选择一个工作分区</p>
      </div>
    );
  }

  return (
    <div className="task-list-container">
      {/* Header */}
      <div className="task-list-header">
        <div className="task-list-title">
          <div
            className="zone-color-badge"
            style={{ backgroundColor: zone.color }}
          />
          <span>{zone.name}</span>
          <span className="task-count">
            ({stats.completed}/{stats.total})
          </span>
        </div>
      </div>

      {/* Add Task */}
      <div className="add-task-container">
        <div className="priority-selector">
          {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => (
            <button
              key={p}
              className={`priority-btn ${selectedPriority === p ? 'active' : ''} priority-${p}`}
              onClick={() => setSelectedPriority(p)}
            >
              <div className={`priority-dot ${p}`} />
            </button>
          ))}
        </div>
        <div className="add-task-inputs">
          <Input
            ref={inputRef}
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="任务标题..."
            className="add-task-title-input"
          />
          <Input
            value={newTaskDescription}
            onChange={(e) => setNewTaskDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述（可选，Shift+Enter 换行）..."
            className="add-task-desc-input"
          />
        </div>
        <Button
          size="icon"
          className="add-task-btn"
          onClick={handleAddTask}
          disabled={!newTaskTitle.trim()}
        >
          <Plus size={18} />
        </Button>
      </div>

      {/* Task List */}
      <ScrollArea className="task-scroll-area">
        <div className="tasks-container">
          {incompleteTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="empty-state">
              <Circle size={48} className="empty-icon" />
              <p>暂无任务，添加一个开始专注吧！</p>
              <p className="empty-hint">双击任务可展开/收缩描述</p>
            </div>
          ) : (
            <>
              {/* Draggable Incomplete Tasks */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={incompleteTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {incompleteTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      zoneColor={getZoneColor(task.zoneId)}
                      isActive={task.id === activeTaskId}
                      isTimerRunning={isTimerRunning && task.id === activeTaskId}
                      onToggle={onToggleTask}
                      onDelete={onDeleteTask}
                      onUpdate={onUpdateTask}
                      onToggleExpanded={onToggleExpanded}
                      onSelect={onSelectTask}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <div className="completed-section">
                  <button
                    className="completed-toggle"
                    onClick={() => setShowCompleted(!showCompleted)}
                  >
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span>已完成 ({completedTasks.length})</span>
                    <span className={`toggle-arrow ${showCompleted ? 'open' : ''}`}>
                      ▼
                    </span>
                  </button>

                  {showCompleted && (
                    <div className="completed-tasks">
                      {completedTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          zoneColor={getZoneColor(task.zoneId)}
                          isActive={false}
                          isTimerRunning={false}
                          onToggle={onToggleTask}
                          onDelete={onDeleteTask}
                          onUpdate={onUpdateTask}
                          onToggleExpanded={onToggleExpanded}
                          onSelect={onSelectTask}
                        />
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="clear-completed-btn"
                        onClick={onClearCompleted}
                      >
                        <Trash2 size={14} className="mr-1" />
                        清除已完成
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer Stats */}
      <div className="task-list-footer">
        <div className="footer-stat">
          <span className="stat-label">完成率</span>
          <span className="stat-value">{stats.completionRate}%</span>
        </div>
        <div className="footer-stat">
          <span className="stat-label">待办</span>
          <span className="stat-value">{stats.pending}</span>
        </div>
      </div>
    </div>
  );
}
