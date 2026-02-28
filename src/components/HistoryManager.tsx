import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { History, ArrowLeft, RotateCcw, Trash2, Copy, FolderPlus, Calendar, Clock, ChevronDown, ChevronRight, CheckCircle2, Circle, Download, Upload, Archive, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import JSZip from 'jszip';
import type { HistoryWorkspace, Template } from '@/types';

interface HistoryManagerProps {
  historyWorkspaces: HistoryWorkspace[];
  templates: Template[];
  customTemplates?: Template[]; // 自定义模板
  currentSourceHistoryId?: string; // 当前工作区来自哪个历史记录
  hasUnsavedChanges?: () => boolean; // 检测当前工作区是否有未{t('common.save')}的内容
  onBack: () => void;
  onRestore: (historyId: string) => void;
  onDelete: (historyId: string) => void;
  onRename: (historyId: string, newName: string) => void;
  onUpdateSummary: (historyId: string, summary: string) => void;
  onCreateNewWorkspace: (name?: string, templateId?: string) => void;
  onArchiveCurrent: (name: string, summary: string) => string | null;
  onQuickArchive?: () => string | null; // 快速存档，返回 null 表示需要确认覆盖
  onOverwriteHistory?: (historyId: string) => void; // 覆盖历史记录
  onExportHistory?: (historyId: string) => string | null;
  onExportAllHistory?: () => string;
  onImportHistory?: (jsonString: string) => boolean;
  onImportAllHistory?: (jsonString: string) => number;
  onSaveCustomTemplate?: (name: string) => void;
  onDeleteCustomTemplate?: (id: string) => void;
}

export function HistoryManager({
  historyWorkspaces,
  templates,
  customTemplates = [],
  currentSourceHistoryId,
  hasUnsavedChanges,
  onBack,
  onRestore,
  onDelete,
  onRename,
  onUpdateSummary,
  onCreateNewWorkspace,
  onArchiveCurrent,
  onQuickArchive,
  onOverwriteHistory,
  onExportHistory,
  onExportAllHistory,
  onImportHistory,
  onImportAllHistory,
  onSaveCustomTemplate,
  onDeleteCustomTemplate,
}: HistoryManagerProps) {
  const [showNewWorkspaceDialog, setShowNewWorkspaceDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingOverwriteId, setPendingOverwriteId] = useState<string | null>(null);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showDeleteTemplateConfirm, setShowDeleteTemplateConfirm] = useState(false);
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [archiveName, setArchiveName] = useState('');
  const [archiveSummary, setArchiveSummary] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { t, i18n } = useTranslation();

  // Helper to get translated template name
  const getTemplateName = (templateId: string, defaultName?: string) => {
    const keyMap: Record<string, string> = {
      'general': 'template.templateGeneral',
      'project': 'template.templateProject',
      'dev': 'template.templateDev',
      'blank': 'template.templateBlank'
    };
    return keyMap[templateId] ? t(keyMap[templateId]) : (defaultName || t('common.unnamed'));
  };

  // Helper to get translated template description
  const getTemplateDesc = (templateId: string, defaultDesc?: string) => {
    const keyMap: Record<string, string> = {
      'general': 'template.templateGeneralDesc',
      'project': 'template.templateProjectDesc',
      'dev': 'template.templateDevDesc',
      'blank': 'template.templateBlankDesc'
    };
    return keyMap[templateId] ? t(keyMap[templateId]) : (defaultDesc || '');
  };

  // 未{t('common.save')}确认对话框状态
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  // 保留 pendingAction 用于日志或调试
  const [_pendingAction, setPendingAction] = useState<{
    type: 'restore' | 'import' | 'newWorkspace';
    data?: string | undefined;
  } | null>(null);
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  // 检查是否有未{t('common.save')}的更改，如果有则弹出确认对话框
  const checkAndProceed = (action: { type: 'restore' | 'import' | 'newWorkspace'; data?: string | undefined }, callback: () => void) => {
    if (hasUnsavedChanges && hasUnsavedChanges()) {
      setPendingAction(action);
      setPendingCallback(() => callback);
      setShowUnsavedConfirm(true);
    } else {
      callback();
    }
  };

  // 执行待处理的操作
  const executePendingAction = () => {
    if (pendingCallback) {
      pendingCallback();
    }

    setShowUnsavedConfirm(false);
    setPendingAction(null);
    setPendingCallback(null);
  };

  // {t('common.cancel')}待处理操作
  const cancelPendingAction = () => {
    setShowUnsavedConfirm(false);
    setPendingAction(null);
    setPendingCallback(null);
  };


  // 处理导出 - 使用 Tauri 对话框
  const handleExport = async (historyId: string) => {
    if (!onExportHistory) return;
    const json = onExportHistory(historyId);
    if (!json) return;

    try {
      // 弹出{t('common.save')}对话框
      const filePath = await save({
        defaultPath: `focus-flow-history-${Date.now()}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (filePath) {
        await writeTextFile(filePath, json);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // 处理导入 - 使用 Tauri 对话框
  const handleImport = async () => {
    if (!onImportHistory || !onImportAllHistory) return;

    try {
      // 弹出打开文件对话框，支持 json 和 zip
      const selected = await open({
        multiple: false,
        filters: [
          { name: '支持格式', extensions: ['json', 'zip'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'ZIP', extensions: ['zip'] }
        ]
      });

      if (selected && typeof selected === 'string') {
        const content = await readTextFile(selected);
        const isZip = selected.toLowerCase().endsWith('.zip');

        if (isZip) {
          // 处理 zip 文件
          try {
            const zip = await JSZip.loadAsync(content);
            // 查找 zip 中的 json 文件
            const jsonFiles = Object.keys(zip.files).filter(f => f.endsWith('.json'));

            if (jsonFiles.length === 0) {
              toast.error(t('workspace.noJsonFound'));
              return;
            }

            let totalImported = 0;
            for (const fileName of jsonFiles) {
              const file = zip.files[fileName];
              const jsonContent = await file.async('string');
              const count = onImportAllHistory(jsonContent);
              totalImported += count;
            }

            if (totalImported > 0) {
              toast.success(t('workspace.importSuccess', { count: totalImported }));
            } else {
              toast.error(t('workspace.importFailed'));
            }
          } catch (zipError) {
            console.error('Zip parse error:', zipError);
            toast.error(t('workspace.zipParseError'));
          }
        } else {
          // 处理单个 json 文件
          const count = onImportAllHistory(content);
          if (count > 0) {
            toast.success(t('workspace.importSuccess', { count }));
          } else {
            toast.error(t('workspace.importFailed'));
          }
        }
      }
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(t('workspace.importFailed'));
    }
  };

  // 触发导入（带未{t('common.save')}检查）
  const triggerImport = () => {
    checkAndProceed({ type: 'import' }, () => {
      handleImport();
    });
  };

  // 处理全量导出
  const handleExportAll = async () => {
    if (!onExportAllHistory) return;

    try {
      // 弹出{t('common.save')}对话框
      const filePath = await save({
        defaultPath: `focus-flow-all-history-${Date.now()}.zip`,
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      });

      if (filePath) {
        // 创建 zip 文件
        const zip = new JSZip();
        // 添加元数据文件
        zip.file('metadata.json', JSON.stringify({
          exportDate: new Date().toISOString(),
          version: '1.0',
          count: historyWorkspaces.length
        }, null, 2));

        // 导出所有历史记录为单独的 json 文件
        historyWorkspaces.forEach((workspace, index) => {
          const safeName = workspace.name.replace(/[<>:"/\\|?*]/g, '_');
          zip.file(`history-${index + 1}-${safeName}.json`, JSON.stringify(workspace, null, 2));
        });

        // 生成 zip 文件
        const zipContent = await zip.generateAsync({ type: 'base64' });
        // 将 base64 转为字符串并写入（这里需要用 binary 方式）
        const binaryString = atob(zipContent);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // 写入文件
        await writeTextFile(filePath, Array.from(bytes).map(b => String.fromCharCode(b)).join(''));
        toast.success(t('workspace.exportSuccess', { count: historyWorkspaces.length }));
      }
    } catch (error) {
      console.error('Export all failed:', error);
      toast.error(t('workspace.importFailed'));
    }
  };

  // 切换展开/收起状态
  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // 处理恢复确认
  const handleRestoreWithConfirm = (id: string) => {
    checkAndProceed({ type: 'restore', data: id }, () => {
      onRestore(id);
    });
  };

  const handleCreateNewWorkspace = (templateId?: string) => {
    checkAndProceed({ type: 'newWorkspace', data: templateId }, () => {
      onCreateNewWorkspace(newWorkspaceName || undefined, templateId);
      setNewWorkspaceName('');
      setShowNewWorkspaceDialog(false);
    });
  };

  const handleArchive = () => {
    const name = archiveName.trim() || `${i18n.language === 'zh' ? '存档' : 'Archive'} ${new Date().toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')}`;
    const summary = archiveSummary.trim() || '';
    onArchiveCurrent(name, summary);
    setArchiveName('');
    setArchiveSummary('');
    setShowArchiveDialog(false);
  };

  // 处理快速存入（默认名称 + 日期）
  const handleQuickArchive = () => {
    if (!onQuickArchive) return;

    // 先检查是否需要确认覆盖
    if (currentSourceHistoryId) {
      const existingHistory = historyWorkspaces.find(h => h.id === currentSourceHistoryId);
      if (existingHistory) {
        // 显示确认对话框
        setPendingOverwriteId(currentSourceHistoryId);
        setShowOverwriteConfirm(true);
        return;
      }
    }

    // 不需要确认，直接执行存档
    onQuickArchive();
  };

  // 处理覆盖确认
  const handleOverwriteConfirm = () => {
    if (pendingOverwriteId && onOverwriteHistory) {
      onOverwriteHistory(pendingOverwriteId);
    }
    setShowOverwriteConfirm(false);
    setPendingOverwriteId(null);
  };

  // 处理覆盖{t('common.cancel')}
  const handleOverwriteCancel = () => {
    setShowOverwriteConfirm(false);
    setPendingOverwriteId(null);
  };

  // 处理{t('common.save')}模板
  const handleSaveTemplate = () => {
    if (newTemplateName.trim() && onSaveCustomTemplate) {
      onSaveCustomTemplate(newTemplateName.trim());
      setNewTemplateName('');
      setShowSaveTemplateDialog(false);
    }
  };

  // 处理删除自定义模板
  const handleDeleteCustomTemplate = (id: string) => {
    setPendingDeleteTemplateId(id);
    setShowDeleteTemplateConfirm(true);
  };

  // 确认删除模板
  const confirmDeleteTemplate = () => {
    if (onDeleteCustomTemplate && pendingDeleteTemplateId) {
      onDeleteCustomTemplate(pendingDeleteTemplateId);
    }
    setShowDeleteTemplateConfirm(false);
    setPendingDeleteTemplateId(null);
  };

  // {t('common.cancel')}删除模板
  const cancelDeleteTemplate = () => {
    setShowDeleteTemplateConfirm(false);
    setPendingDeleteTemplateId(null);
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
    return date.toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="history-manager-container">
      {/* 未{t('common.save')}更改确认对话框 */}
      <AlertDialog open={showUnsavedConfirm} onOpenChange={setShowUnsavedConfirm}>
        <AlertDialogContent className="history-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Current workspace unsaved</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workspace.confirmRestore')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingAction}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={executePendingAction}>{t('common.continue')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          <span>{t('workspace.history')}</span>
          <span className="history-count">({historyWorkspaces.length})</span>
        </div>
      </div>

      {/* Actions */}
      <div className="history-actions">
        <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="history-action-btn">
              <Calendar size={14} className="mr-1" />
              {t('workspace.archive')}
            </Button>
          </DialogTrigger>
          <DialogContent className="history-dialog">
            <DialogHeader>
              <DialogTitle>将当前工作{t('workspace.archive')}</DialogTitle>
            </DialogHeader>
            <div className="history-form">
              <Input
                value={archiveName}
                onChange={(e) => setArchiveName(e.target.value)}
                placeholder={t('workspace.workspaceName') + ' (e.g., Project Phase 1)'}
              />
              <Input
                value={archiveSummary}
                onChange={(e) => setArchiveSummary(e.target.value)}
                placeholder={t('workspace.workspaceSummary') + ' (optional)'}
              />
              <div className="history-form-actions">
                <Button variant="outline" onClick={() => setShowArchiveDialog(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleArchive}>
                  {t('workspace.archive')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 快速存入按钮 */}
        {onQuickArchive && (
          <Button
            variant="outline"
            size="sm"
            className="history-action-btn primary"
            onClick={handleQuickArchive}
          >
            <Clock size={14} className="mr-1" />
            {t('workspace.quickArchive')}
          </Button>
        )}

        {/* 覆盖确认对话框 */}
        <Dialog open={showOverwriteConfirm} onOpenChange={setShowOverwriteConfirm}>
          <DialogContent className="history-dialog">
            <DialogHeader>
              <DialogTitle>{t('messages.confirmOverwrite') || 'Confirm Overwrite'}</DialogTitle>
            </DialogHeader>
            <p>{t('messages.overwriteConfirm') || 'This record already exists. Overwrite the previous archive?'}</p>
            <div className="history-form-actions">
              <Button variant="outline" onClick={handleOverwriteCancel}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleOverwriteConfirm}>
                {t('common.confirm')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* {t('common.save')}模板对话框 */}
        <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
          <DialogContent className="history-dialog">
            <DialogHeader>
              <DialogTitle>{t('template.saveAsTemplate')}</DialogTitle>
            </DialogHeader>
            <p>{t('template.saveAsTemplateDesc')}</p>
            <Input
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder={t('template.templateName')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTemplate();
              }}
            />
            <div className="history-form-actions">
              <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSaveTemplate} disabled={!newTemplateName.trim()}>
                {t('common.save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 删除模板确认对话框 */}
        <Dialog open={showDeleteTemplateConfirm} onOpenChange={setShowDeleteTemplateConfirm}>
          <DialogContent className="history-dialog">
            <DialogHeader>
              <DialogTitle>{t('template.deleteTemplate')}</DialogTitle>
            </DialogHeader>
            <p>{t('messages.confirmDelete')}</p>
            <div className="history-form-actions">
              <Button variant="outline" onClick={cancelDeleteTemplate}>
                {t('common.cancel')}
              </Button>
              <Button onClick={confirmDeleteTemplate} className="bg-red-500 hover:bg-red-600">
                {t('common.delete')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showNewWorkspaceDialog} onOpenChange={setShowNewWorkspaceDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="history-action-btn primary">
              <FolderPlus size={14} className="mr-1" />
              {t('workspace.newWorkspace')}
            </Button>
          </DialogTrigger>
          <DialogContent className="template-dialog">
            <DialogHeader>
              <DialogTitle>{t('workspace.newWorkspace')}</DialogTitle>
            </DialogHeader>
            <div className="new-workspace-form">
              <Input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder={t('workspace.workspaceName') + ' (optional)'}
                className="mb-4"
              />
              <p className="template-label">{t('template.applyTemplate')} (optional)</p>
              <div className="template-list">
                <button
                  className="template-item"
                  onClick={() => handleCreateNewWorkspace()}
                >
                  <div className="template-info">
                    <span className="template-name">{t('template.templateBlank')}</span>
                    <span className="template-desc">{t('template.templateBlankDesc')}</span>
                  </div>
                </button>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    className="template-item"
                    onClick={() => handleCreateNewWorkspace(template.id)}
                  >
                    <div className="template-info">
                      <span className="template-name">{getTemplateName(template.id, template.name)}</span>
                      <span className="template-desc">{getTemplateDesc(template.id, template.description)}</span>
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
                {/* 自定义模板 */}
                {customTemplates.map((template) => (
                  <button
                    key={template.id}
                    className="template-item custom-template"
                    onClick={() => handleCreateNewWorkspace(template.id)}
                  >
                    <div className="template-info">
                      <span className="template-name">{getTemplateName(template.id, template.name)}</span>
                      <span className="template-desc">{getTemplateDesc(template.id, template.description)}</span>
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className="delete-template-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCustomTemplate(template.id);
                      }}
                    >
                      <X size={12} />
                    </Button>
                  </button>
                ))}
                {/* {t('common.save')}当前分区为模板按钮 */}
                {onSaveCustomTemplate && (
                  <button
                    className="template-item save-template-btn"
                    onClick={() => setShowSaveTemplateDialog(true)}
                  >
                    <Save size={16} />
                    <span>{t('template.saveAsTemplate')}</span>
                  </button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 导入按钮 */}
        {onImportHistory && (
          <Button variant="outline" size="sm" className="history-action-btn" onClick={triggerImport}>
            <Upload size={14} className="mr-1" />
            {t('common.import')}
          </Button>
        )}

        {/* 全量导出按钮 */}
        {onExportAllHistory && historyWorkspaces.length > 0 && (
          <Button variant="outline" size="sm" className="history-action-btn" onClick={handleExportAll}>
            <Archive size={14} className="mr-1" />
            {t('workspace.exportAll')}
          </Button>
        )}
      </div>

      {/* History List */}
      <ScrollArea className="history-list-scroll">
        <div className="history-list">
          {historyWorkspaces.length === 0 ? (
            <div className="empty-state">
              <History size={48} className="empty-icon" />
              <p>{t('workspace.noHistory')}</p>
              <p className="empty-hint">{t('workspace.noHistoryHint')}</p>
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
                          title={t('workspace.clickToEditName')}
                        >
                          {workspace.name}
                        </span>
                      )}
                      <span className="history-time">
                        {formatDate(workspace.createdAt)}
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
                        placeholder={t('workspace.addSummary')}
                      />
                    ) : (
                      <span
                        className="history-summary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSummaryId(workspace.id);
                          setEditSummary(workspace.summary || '');
                        }}
                        title={t('workspace.clickToEditSummary')}
                      >
                        {workspace.summary || t('workspace.defaultSummary', { zones: workspace.zones.length, tasks: workspace.tasks.length })}
                      </span>
                    )}

                    <div className="history-stats">
                      <span className="history-stat">
                        <Clock size={10} />
                        {t('profile.createdAt')}: {formatDate(workspace.createdAt)}
                      </span>
                      {workspace.lastModified !== workspace.createdAt && (
                        <span className="history-stat modified">
                          {t('workspace.modified')}: {formatDate(workspace.lastModified)}
                        </span>
                      )}
                      <span className="history-stat">{workspace.zones.length} {t('zone.zones')}</span>
                      <span className="history-stat">{workspace.tasks.length} {t('task.tasks')}</span>
                      <span className="history-stat">
                        {workspace.tasks.filter(t => t.completed).length} {t('task.completed')}
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
                      title={t('workspace.restore')}
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
                      title={t('common.copyData')}
                    >
                      <Copy size={14} />
                    </Button>
                    {onExportHistory && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="history-action-btn export"
                        onClick={() => handleExport(workspace.id)}
                        title={t('common.exportAsFile')}
                      >
                        <Download size={14} />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="history-action-btn delete"
                      onClick={() => onDelete(workspace.id)}
                      title={t('common.delete')}
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
                            {t('workspace.moreTasks', { count: workspace.tasks.length - 20 })}
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
