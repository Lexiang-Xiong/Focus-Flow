import { useState, useMemo } from 'react';
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
import { ArrowLeft, CheckCircle2, Globe, ArrowUpDown, Zap, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TaskItem } from './TaskItem';
import type { Task, Zone, GlobalViewSortMode, SortConfig, TaskPriority, TaskUrgency } from '@/types';

interface GlobalViewProps {
  zones: Zone[];
  tasks: Task[];
  activeTaskId: string | null;
  isTimerRunning: boolean;
  sortConfig: SortConfig;
  onBack: () => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Omit<Task, 'id'>>) => void;
  onToggleExpanded: (id: string) => void;
  onReorderTasks: (zoneId: string, tasks: Task[]) => void;
  onSelectTask: (id: string) => void;
  onSortConfigChange: (config: SortConfig) => void;
}

export function GlobalView({
  zones,
  tasks,
  activeTaskId,
  isTimerRunning,
  sortConfig,
  onBack,
  onToggleTask,
  onDeleteTask,
  onUpdateTask,
  onToggleExpanded,
  onReorderTasks,
  onSelectTask,
  onSortConfigChange,
}: GlobalViewProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Helper functions for sorting
  const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  const urgencyOrder: Record<TaskUrgency, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const calculateWeightedScore = (task: Task): number => {
    const pWeight = sortConfig.priorityWeight ?? 0.4;
    const uWeight = sortConfig.urgencyWeight ?? 0.6;
    const normalizedPriority = (2 - priorityOrder[task.priority]) / 2; // 0-1, high=1
    const normalizedUrgency = (3 - urgencyOrder[task.urgency]) / 3; // 0-1, urgent=1
    return normalizedPriority * pWeight + normalizedUrgency * uWeight;
  };

  // Get all incomplete tasks sorted based on sortConfig
  const incompleteTasks = useMemo(() => {
    const filtered = tasks.filter((t) => !t.completed);

    return [...filtered].sort((a, b) => {
      switch (sortConfig.mode) {
        case 'zone': {
          const zoneA = zones.find((z) => z.id === a.zoneId);
          const zoneB = zones.find((z) => z.id === b.zoneId);
          if (zoneA?.order !== zoneB?.order) {
            return (zoneA?.order || 0) - (zoneB?.order || 0);
          }
          return a.order - b.order;
        }
        case 'priority':
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        case 'urgency':
          return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        case 'weighted':
          return calculateWeightedScore(b) - calculateWeightedScore(a);
        default:
          return 0;
      }
    });
  }, [tasks, sortConfig, zones]);

  const completedTasks = tasks.filter((t) => t.completed);

  // Group tasks for non-zone sorting modes
  const taskGroups = useMemo(() => {
    if (sortConfig.mode === 'zone') return null;

    const groups: { title: string; color: string; tasks: Task[] }[] = [];

    if (sortConfig.mode === 'priority') {
      const priorityGroups: Record<TaskPriority, Task[]> = { high: [], medium: [], low: [] };
      incompleteTasks.forEach((t) => priorityGroups[t.priority].push(t));

      const priorityLabels: Record<TaskPriority, { title: string; color: string }> = {
        high: { title: '高优先级', color: '#ef4444' },
        medium: { title: '中优先级', color: '#eab308' },
        low: { title: '低优先级', color: '#22c55e' },
      };

      (['high', 'medium', 'low'] as TaskPriority[]).forEach((p) => {
        if (priorityGroups[p].length > 0) {
          groups.push({
            title: priorityLabels[p].title,
            color: priorityLabels[p].color,
            tasks: priorityGroups[p],
          });
        }
      });
    } else if (sortConfig.mode === 'urgency') {
      const urgencyGroups: Record<TaskUrgency, Task[]> = { urgent: [], high: [], medium: [], low: [] };
      incompleteTasks.forEach((t) => urgencyGroups[t.urgency].push(t));

      const urgencyLabels: Record<TaskUrgency, { title: string; color: string }> = {
        urgent: { title: '紧急', color: '#dc2626' },
        high: { title: '高紧急度', color: '#f97316' },
        medium: { title: '中紧急度', color: '#eab308' },
        low: { title: '低紧急度', color: '#22c55e' },
      };

      (['urgent', 'high', 'medium', 'low'] as TaskUrgency[]).forEach((u) => {
        if (urgencyGroups[u].length > 0) {
          groups.push({
            title: urgencyLabels[u].title,
            color: urgencyLabels[u].color,
            tasks: urgencyGroups[u],
          });
        }
      });
    } else if (sortConfig.mode === 'weighted') {
      const scoreGroups: { title: string; color: string; minScore: number; tasks: Task[] }[] = [
        { title: '重要且紧急', color: '#dc2626', minScore: 0.75, tasks: [] },
        { title: '重要或紧急', color: '#f97316', minScore: 0.5, tasks: [] },
        { title: '一般', color: '#eab308', minScore: 0.25, tasks: [] },
        { title: '低优先级', color: '#22c55e', minScore: 0, tasks: [] },
      ];

      incompleteTasks.forEach((t) => {
        const score = calculateWeightedScore(t);
        if (score >= 0.75) scoreGroups[0].tasks.push(t);
        else if (score >= 0.5) scoreGroups[1].tasks.push(t);
        else if (score >= 0.25) scoreGroups[2].tasks.push(t);
        else scoreGroups[3].tasks.push(t);
      });

      scoreGroups.forEach((g) => {
        if (g.tasks.length > 0) {
          groups.push({
            title: g.title,
            color: g.color,
            tasks: g.tasks,
          });
        }
      });
    }

    return groups;
  }, [incompleteTasks, sortConfig.mode]);

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
        <div className="sort-mode-selector">
          <Select
            value={sortConfig.mode}
            onValueChange={(value: GlobalViewSortMode) => onSortConfigChange({ ...sortConfig, mode: value })}
          >
            <SelectTrigger className="sort-select-trigger">
              <ArrowUpDown size={14} />
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zone">
                <div className="sort-option">
                  <Globe size={14} />
                  <span>按工作区</span>
                </div>
              </SelectItem>
              <SelectItem value="priority">
                <div className="sort-option">
                  <Flag size={14} />
                  <span>按优先级</span>
                </div>
              </SelectItem>
              <SelectItem value="urgency">
                <div className="sort-option">
                  <Zap size={14} />
                  <span>按紧急度</span>
                </div>
              </SelectItem>
              <SelectItem value="weighted">
                <div className="sort-option">
                  <Flag size={14} />
                  <Zap size={14} />
                  <span>加权排序</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
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
              {/* Task Groups for non-zone sorting or Zone Labels for zone sorting */}
              {sortConfig.mode === 'zone' ? (
                // Zone sorting - show zone labels
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
              ) : (
                // Non-zone sorting - show temporary blocks
                taskGroups?.map((group) => (
                  <div key={group.title} className="task-group">
                    <div
                      className="group-label"
                      style={{
                        backgroundColor: `${group.color}15`,
                        borderLeftColor: group.color,
                      }}
                    >
                      <span style={{ color: group.color }}>{group.title}</span>
                      <span className="group-count">({group.tasks.length})</span>
                    </div>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={group.tasks.map((t) => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {group.tasks.map((task) => (
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
                  </div>
                ))
              )}

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
