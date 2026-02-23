import { useState } from 'react';
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
import { ArrowLeft, CheckCircle2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TaskItem } from './TaskItem';
import type { Task, Zone } from '@/types';

interface GlobalViewProps {
  zones: Zone[];
  tasks: Task[];
  activeTaskId: string | null;
  isTimerRunning: boolean;
  onBack: () => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => void;
  onToggleExpanded: (id: string) => void;
  onReorderTasks: (zoneId: string, tasks: Task[]) => void;
  onSelectTask: (id: string) => void;
}

export function GlobalView({
  zones,
  tasks,
  activeTaskId,
  isTimerRunning,
  onBack,
  onToggleTask,
  onDeleteTask,
  onUpdateTask,
  onToggleExpanded,
  onReorderTasks,
  onSelectTask,
}: GlobalViewProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get all incomplete tasks sorted by zone and order
  const incompleteTasks = tasks
    .filter((t) => !t.completed)
    .sort((a, b) => {
      const zoneA = zones.find((z) => z.id === a.zoneId);
      const zoneB = zones.find((z) => z.id === b.zoneId);
      if (zoneA?.order !== zoneB?.order) {
        return (zoneA?.order || 0) - (zoneB?.order || 0);
      }
      return a.order - b.order;
    });

  const completedTasks = tasks.filter((t) => t.completed);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = incompleteTasks.findIndex((t) => t.id === active.id);
      const newIndex = incompleteTasks.findIndex((t) => t.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(incompleteTasks, oldIndex, newIndex);
        // Group by zone and reorder within each zone
        const zoneGroups = new Map<string, Task[]>();
        reordered.forEach((task) => {
          if (!zoneGroups.has(task.zoneId)) {
            zoneGroups.set(task.zoneId, []);
          }
          zoneGroups.get(task.zoneId)!.push(task);
        });
        
        // Update order for each zone
        zoneGroups.forEach((zoneTasks, zoneId) => {
          onReorderTasks(zoneId, zoneTasks);
        });
      }
    }
  };

  const getZoneColor = (zoneId: string) => {
    const zone = zones.find((z) => z.id === zoneId);
    return zone?.color || '#6b7280';
  };

  const getZoneName = (zoneId: string) => {
    const zone = zones.find((z) => z.id === zoneId);
    return zone?.name || '未知分区';
  };

  const stats = {
    total: tasks.length,
    completed: completedTasks.length,
    pending: incompleteTasks.length,
    completionRate: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
  };

  return (
    <div className="global-view-container">
      {/* Header */}
      <div className="global-view-header">
        <Button
          size="icon"
          variant="ghost"
          className="back-btn"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="global-view-title">
          <Globe size={18} className="text-blue-400" />
          <span>全局视图</span>
          <span className="task-count">({stats.completed}/{stats.total})</span>
        </div>
      </div>

      {/* Task List */}
      <ScrollArea className="task-scroll-area">
        <div className="tasks-container">
          {incompleteTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="empty-state">
              <Globe size={48} className="empty-icon" />
              <p>暂无任务</p>
              <p className="empty-hint">在分区中添加任务，这里会显示所有任务</p>
            </div>
          ) : (
            <>
              {/* Zone Labels for Incomplete Tasks */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={incompleteTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {incompleteTasks.map((task, index) => {
                    const prevTask = incompleteTasks[index - 1];
                    const showZoneLabel = !prevTask || prevTask.zoneId !== task.zoneId;
                    
                    return (
                      <div key={task.id}>
                        {showZoneLabel && (
                          <div
                            className="zone-label"
                            style={{
                              backgroundColor: `${getZoneColor(task.zoneId)}20`,
                              borderLeftColor: getZoneColor(task.zoneId),
                            }}
                          >
                            <div
                              className="zone-label-dot"
                              style={{ backgroundColor: getZoneColor(task.zoneId) }}
                            />
                            <span style={{ color: getZoneColor(task.zoneId) }}>
                              {getZoneName(task.zoneId)}
                            </span>
                          </div>
                        )}
                        <TaskItem
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
                      </div>
                    );
                  })}
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
                      {completedTasks.map((task, index) => {
                        const prevTask = completedTasks[index - 1];
                        const showZoneLabel = !prevTask || prevTask.zoneId !== task.zoneId;
                        
                        return (
                          <div key={task.id}>
                            {showZoneLabel && (
                              <div
                                className="zone-label completed"
                                style={{
                                  backgroundColor: `${getZoneColor(task.zoneId)}10`,
                                  borderLeftColor: getZoneColor(task.zoneId),
                                }}
                              >
                                <div
                                  className="zone-label-dot"
                                  style={{ backgroundColor: getZoneColor(task.zoneId) }}
                                />
                                <span style={{ color: getZoneColor(task.zoneId) }}>
                                  {getZoneName(task.zoneId)}
                                </span>
                              </div>
                            )}
                            <TaskItem
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
                          </div>
                        );
                      })}
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
