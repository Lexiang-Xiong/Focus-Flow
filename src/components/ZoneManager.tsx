import { useState } from 'react';
import { Plus, Settings, Trash2, Edit2, Palette, FolderKanban, History, Cog, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Zone, Template } from '@/types';
import { ZONE_COLORS } from '@/types';

interface ZoneManagerProps {
  zones: Zone[];
  activeZoneId: string | null;
  templates: Template[];
  customTemplates?: Template[];
  onSelectZone: (zoneId: string | null) => void;
  onAddZone: (name: string, color: string) => void;
  onUpdateZone: (id: string, updates: Partial<Omit<Zone, 'id'>>) => void;
  onDeleteZone: (id: string) => void;
  onApplyTemplate: (templateId: string) => void;
  onViewChange: (view: 'zones' | 'global' | 'history') => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onSaveAsTemplate?: (name: string) => void;
  onDeleteCustomTemplate?: (id: string) => void;
}

export function ZoneManager({
  zones,
  activeZoneId,
  templates,
  customTemplates = [],
  onSelectZone,
  onAddZone,
  onUpdateZone,
  onDeleteZone,
  onApplyTemplate,
  onViewChange,
  onOpenHistory,
  onOpenSettings,
  onSaveAsTemplate,
  onDeleteCustomTemplate,
}: ZoneManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneColor, setNewZoneColor] = useState(ZONE_COLORS[0]);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  const handleAddZone = () => {
    if (newZoneName.trim()) {
      onAddZone(newZoneName.trim(), newZoneColor);
      setNewZoneName('');
      setIsAdding(false);
    }
  };

  const handleUpdateZone = () => {
    if (editingZone && editingZone.name.trim()) {
      onUpdateZone(editingZone.id, {
        name: editingZone.name.trim(),
        color: editingZone.color,
      });
      setEditingZone(null);
      setEditDialogOpen(false);
    }
  };

  const handleEditDialogOpen = (open: boolean, zone?: Zone) => {
    setEditDialogOpen(open);
    if (open && zone) {
      setEditingZone(zone);
    } else if (!open) {
      setEditingZone(null);
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    onApplyTemplate(templateId);
    setShowTemplates(false);
  };

  return (
    <div className="zone-manager">
      {/* Header */}
      <div className="zone-manager-header">
        <span className="zone-manager-title">
          <FolderKanban size={16} />
          工作分区
        </span>
        <div className="zone-manager-actions">
          <Button
            size="icon"
            variant="ghost"
            className="zone-action-btn"
            onClick={() => onViewChange('global')}
            title="全局视图"
          >
            <Palette size={14} />
          </Button>
          <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
            <DialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="zone-action-btn"
                title="应用模板"
              >
                <Settings size={14} />
              </Button>
            </DialogTrigger>
            <DialogContent className="template-dialog">
              <DialogHeader>
                <DialogTitle>选择工作模板</DialogTitle>
              </DialogHeader>
              <div className="template-list">
                {/* 预定义模板 */}
                {templates.map((template) => (
                  <button
                    key={template.id}
                    className="template-item"
                    onClick={() => handleApplyTemplate(template.id)}
                  >
                    <div className="template-info">
                      <span className="template-name">{template.name}</span>
                      <span className="template-desc">{template.description}</span>
                    </div>
                    <div className="template-zones">
                      {template.zones.map((z: { color: string }, i: number) => (
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
                    className="template-item"
                    onClick={() => handleApplyTemplate(template.id)}
                  >
                    <div className="template-info">
                      <span className="template-name">{template.name}</span>
                      <span className="template-desc">{template.description}</span>
                    </div>
                    <div className="template-zones">
                      {template.zones.map((z: { color: string }, i: number) => (
                        <span
                          key={i}
                          className="template-zone-dot"
                          style={{ backgroundColor: z.color }}
                        />
                      ))}
                    </div>
                    {onDeleteCustomTemplate && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="delete-template-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('确定要删除这个模板吗？')) {
                            onDeleteCustomTemplate(template.id);
                          }
                        }}
                      >
                        <X size={12} />
                      </Button>
                    )}
                  </button>
                ))}
                {/* 保存当前分区为模板 */}
                {onSaveAsTemplate && zones.length > 0 && (
                  <button
                    className="template-item save-template-btn"
                    onClick={() => setShowSaveTemplateDialog(true)}
                  >
                    <Save size={16} />
                    <span>保存当前分区为模板</span>
                  </button>
                )}
              </div>
            </DialogContent>

            {/* 保存模板对话框 */}
            <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
              <DialogContent className="history-dialog">
                <DialogHeader>
                  <DialogTitle>保存为模板</DialogTitle>
                </DialogHeader>
                <p>将当前分区保存为模板</p>
                <Input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="输入模板名称"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTemplateName.trim() && onSaveAsTemplate) {
                      onSaveAsTemplate(newTemplateName.trim());
                      setNewTemplateName('');
                      setShowSaveTemplateDialog(false);
                    }
                  }}
                />
                <div className="history-form-actions">
                  <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>
                    取消
                  </Button>
                  <Button
                    onClick={() => {
                      if (newTemplateName.trim() && onSaveAsTemplate) {
                        onSaveAsTemplate(newTemplateName.trim());
                        setNewTemplateName('');
                        setShowSaveTemplateDialog(false);
                      }
                    }}
                    disabled={!newTemplateName.trim()}
                  >
                    保存
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </Dialog>
          <Button
            size="icon"
            variant="ghost"
            className="zone-action-btn"
            onClick={() => setIsAdding(true)}
            title="添加分区"
          >
            <Plus size={14} />
          </Button>
        </div>
      </div>

      {/* Zone List */}
      <ScrollArea className="zone-list-scroll">
        <div className="zone-list">
          {/* Global View Button */}
          <button
            className={`zone-item global ${activeZoneId === null ? 'active' : ''}`}
            onClick={() => onSelectZone(null)}
          >
            <div className="zone-color-indicator" style={{ background: 'linear-gradient(90deg, #3b82f6, #22c55e, #f59e0b)' }} />
            <span className="zone-name">全局视图</span>
            <span className="zone-count">全部</span>
          </button>

          {/* Zone Items */}
          {zones.map((zone) => (
            <div
              key={zone.id}
              className={`zone-item ${activeZoneId === zone.id ? 'active' : ''}`}
            >
              <button
                className="zone-content"
                onClick={() => onSelectZone(zone.id)}
              >
                <div
                  className="zone-color-indicator"
                  style={{ backgroundColor: zone.color }}
                />
                <span className="zone-name">{zone.name}</span>
              </button>
              <div className="zone-actions">
                <Dialog open={editDialogOpen} onOpenChange={(open) => handleEditDialogOpen(open, zone)}>
                  <DialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="zone-edit-btn"
                    >
                      <Edit2 size={12} />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="zone-edit-dialog">
                    <DialogHeader>
                      <DialogTitle>编辑分区</DialogTitle>
                    </DialogHeader>
                    <div className="zone-edit-form">
                      <Input
                        value={editingZone?.name || ''}
                        onChange={(e) => setEditingZone(prev => prev ? { ...prev, name: e.target.value } : null)}
                        placeholder="分区名称"
                      />
                      <div className="color-picker">
                        <span className="color-label">选择颜色</span>
                        <div className="color-grid">
                          {ZONE_COLORS.map((color) => (
                            <button
                              key={color}
                              className={`color-option ${editingZone?.color === color ? 'selected' : ''}`}
                              style={{ backgroundColor: color }}
                              onClick={() => setEditingZone(prev => prev ? { ...prev, color } : null)}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="zone-edit-actions">
                        <Button variant="outline" onClick={() => { setEditingZone(null); setEditDialogOpen(false); }}>
                          取消
                        </Button>
                        <Button onClick={handleUpdateZone}>
                          保存
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button
                  size="icon"
                  variant="ghost"
                  className="zone-delete-btn"
                  onClick={() => onDeleteZone(zone.id)}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="zone-manager-footer">
        <Button
          variant="ghost"
          size="sm"
          className="footer-btn"
          onClick={onOpenHistory}
        >
          <History size={14} className="mr-1" />
          历史
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="footer-btn"
          onClick={onOpenSettings}
        >
          <Cog size={14} className="mr-1" />
          设置
        </Button>
      </div>

      {/* Add Zone Dialog */}
      {isAdding && (
        <div className="zone-add-form">
          <Input
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            placeholder="分区名称"
            onKeyDown={(e) => e.key === 'Enter' && handleAddZone()}
            autoFocus
          />
          <div className="color-picker">
            <div className="color-grid">
              {ZONE_COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-option ${newZoneColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setNewZoneColor(color)}
                />
              ))}
            </div>
          </div>
          <div className="zone-add-actions">
            <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleAddZone} disabled={!newZoneName.trim()}>
              添加
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
