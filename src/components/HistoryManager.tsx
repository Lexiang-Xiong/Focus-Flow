import { useState } from 'react';
import { History, ArrowLeft, RotateCcw, Trash2, Copy, FolderPlus, Calendar, Clock, ChevronDown, ChevronRight, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { HistoryWorkspace, Template } from '@/types';

interface HistoryManagerProps {
  historyWorkspaces: HistoryWorkspace[];
  templates: Template[];
  onBack: () => void;
  onRestore: (historyId: string) => void;
  onDelete: (historyId: string) => void;
  onRename: (historyId: string, newName: string) => void;
  onUpdateSummary: (historyId: string, summary: string) => void;
  onCreateNewWorkspace: (name?: string, templateId?: string) => void;
  onArchiveCurrent: (name: string, summary: string) => string | null;
}

export function HistoryManager({
  historyWorkspaces,
  templates,
  onBack,
  onRestore,
  onDelete,
  onRename,
  onUpdateSummary,
  onCreateNewWorkspace,
  onArchiveCurrent,
}: HistoryManagerProps) {
  const [showNewWorkspaceDialog, setShowNewWorkspaceDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [archiveName, setArchiveName] = useState('');
  const [archiveSummary, setArchiveSummary] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 切换展开/收起状态
  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // 处理恢复确认
  const handleRestoreWithConfirm = (id: string) => {
    onRestore(id);
  };

  const handleCreateNewWorkspace = (templateId?: string) => {
    onCreateNewWorkspace(newWorkspaceName || undefined, templateId);
    setNewWorkspaceName('');
    setShowNewWorkspaceDialog(false);
  };

  const handleArchive = () => {
    const name = archiveName.trim() || `存档 ${new Date().toLocaleDateString('zh-CN')}`;
    const summary = archiveSummary.trim() || '';
    onArchiveCurrent(name, summary);
    setArchiveName('');
    setArchiveSummary('');
    setShowArchiveDialog(false);
  };

  const handleRename = (historyId: string) => {
    if (editName.trim()) {
      onRename(historyId, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const handleUpdateSummary = (historyId: string) => {
    onUpdateSummary(historyId, editSummary);
    setEditingSummaryId(null);
    setEditSummary('');
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    return `${Math.floor(days / 30)}个月前`;
  };

  return (
    <div className="history-manager-container">
      {/* Header */}
      <div className="history-manager-header">
        <Button
          size="icon"
          variant="ghost"
          className="back-btn"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="history-manager-title">
          <History size={18} className="text-purple-400" />
          <span>历史工作区</span>
          <span className="history-count">({historyWorkspaces.length})</span>
        </div>
      </div>

      {/* Actions */}
      <div className="history-actions">
        <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="history-action-btn">
              <Calendar size={14} className="mr-1" />
              存入历史
            </Button>
          </DialogTrigger>
          <DialogContent className="history-dialog">
            <DialogHeader>
              <DialogTitle>将当前工作存入历史</DialogTitle>
            </DialogHeader>
            <div className="history-form">
              <Input
                value={archiveName}
                onChange={(e) => setArchiveName(e.target.value)}
                placeholder="工作区名称（如：项目第一阶段）"
              />
              <Input
                value={archiveSummary}
                onChange={(e) => setArchiveSummary(e.target.value)}
                placeholder="摘要描述（可选）"
              />
              <div className="history-form-actions">
                <Button variant="outline" onClick={() => setShowArchiveDialog(false)}>
                  取消
                </Button>
                <Button onClick={handleArchive}>
                  存入历史
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showNewWorkspaceDialog} onOpenChange={setShowNewWorkspaceDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="history-action-btn primary">
              <FolderPlus size={14} className="mr-1" />
              新建工作区
            </Button>
          </DialogTrigger>
          <DialogContent className="template-dialog">
            <DialogHeader>
              <DialogTitle>创建新工作区</DialogTitle>
            </DialogHeader>
            <div className="new-workspace-form">
              <Input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="工作区名称（可选）"
                className="mb-4"
              />
              <p className="template-label">选择模板（可选）</p>
              <div className="template-list">
                <button
                  className="template-item"
                  onClick={() => handleCreateNewWorkspace()}
                >
                  <div className="template-info">
                    <span className="template-name">空白工作区</span>
                    <span className="template-desc">从零开始创建</span>
                  </div>
                </button>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    className="template-item"
                    onClick={() => handleCreateNewWorkspace(template.id)}
                  >
                    <div className="template-info">
                      <span className="template-name">{template.name}</span>
                      <span className="template-desc">{template.description}</span>
                    </div>
                    <div className="template-zones">
                      {template.zones.map((z, i) => (
                        <span
                          key={i}
                          className="template-zone-dot"
                          style={{ backgroundColor: z.color }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* History List */}
      <ScrollArea className="history-list-scroll">
        <div className="history-list">
          {historyWorkspaces.length === 0 ? (
            <div className="empty-state">
              <History size={48} className="empty-icon" />
              <p>暂无历史工作区</p>
              <p className="empty-hint">点击"存入历史"保存当前工作，或创建新工作区自动存档</p>
            </div>
          ) : (
            historyWorkspaces
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((workspace) => (
                <div
                  key={workspace.id}
                  className={`history-item ${expandedId === workspace.id ? 'expanded' : ''}`}
                >
                  {/* 主内容区域 - 点击展开/收起 */}
                  <div
                    className="history-info"
                    onClick={() => toggleExpand(workspace.id)}
                  >
                    <div className="history-header-row">
                      {/* 展开/收起图标 */}
                      <span className="expand-icon" style={{ marginRight: '4px' }}>
                        {expandedId === workspace.id ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </span>

                      {editingId === workspace.id ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(workspace.id);
                            if (e.key === 'Escape') {
                              setEditingId(null);
                              setEditName('');
                            }
                          }}
                          onBlur={() => handleRename(workspace.id)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          className="history-edit-input"
                        />
                      ) : (
                        <span
                          className="history-name"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(workspace.id);
                            setEditName(workspace.name);
                          }}
                          title="点击编辑名称"
                        >
                          {workspace.name}
                        </span>
                      )}
                      <span className="history-time" title={formatDate(workspace.createdAt)}>
                        {formatRelativeTime(workspace.createdAt)}
                      </span>
                    </div>

                    {editingSummaryId === workspace.id ? (
                      <Input
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateSummary(workspace.id);
                          if (e.key === 'Escape') {
                            setEditingSummaryId(null);
                            setEditSummary('');
                          }
                        }}
                        onBlur={() => handleUpdateSummary(workspace.id)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="history-summary-edit-input"
                        placeholder="添加摘要描述..."
                      />
                    ) : (
                      <span
                        className="history-summary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSummaryId(workspace.id);
                          setEditSummary(workspace.summary || '');
                        }}
                        title="点击编辑摘要"
                      >
                        {workspace.summary || `包含 ${workspace.zones.length} 个分区，${workspace.tasks.length} 个任务`}
                      </span>
                    )}

                    <div className="history-stats">
                      <span className="history-stat">
                        <Clock size={10} />
                        {formatDate(workspace.createdAt)}
                      </span>
                      <span className="history-stat">{workspace.zones.length} 分区</span>
                      <span className="history-stat">{workspace.tasks.length} 任务</span>
                      <span className="history-stat">
                        {workspace.tasks.filter(t => t.completed).length} 完成
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="history-actions" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="history-action-btn restore"
                      onClick={() => handleRestoreWithConfirm(workspace.id)}
                      title="恢复到当前工作区"
                    >
                      <RotateCcw size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="history-action-btn copy"
                      onClick={() => {
                        const data = JSON.stringify(workspace, null, 2);
                        navigator.clipboard.writeText(data);
                      }}
                      title="复制数据"
                    >
                      <Copy size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="history-action-btn delete"
                      onClick={() => onDelete(workspace.id)}
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>

                  {/* 展开的任务详情 */}
                  {expandedId === workspace.id && workspace.tasks.length > 0 && (
                    <div className="history-task-details" onClick={(e) => e.stopPropagation()}>
                      <div className="history-task-list">
                        {workspace.tasks.slice(0, 20).map((task, index) => (
                          <div
                            key={index}
                            className={`history-task-item ${task.completed ? 'completed' : ''}`}
                          >
                            {task.completed ? (
                              <CheckCircle2 size={14} className="check-icon" />
                            ) : (
                              <Circle size={14} style={{ opacity: 0.5 }} />
                            )}
                            <span className="task-title">{task.title}</span>
                            {task.totalWorkTime && task.totalWorkTime > 0 && (
                              <span className="task-time">
                                {Math.floor(task.totalWorkTime / 60)}m
                              </span>
                            )}
                          </div>
                        ))}
                        {workspace.tasks.length > 20 && (
                          <div className="history-task-item" style={{ opacity: 0.5, justifyContent: 'center' }}>
                            ... 还有 {workspace.tasks.length - 20} 个任务
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
