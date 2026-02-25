import { useState } from 'react';
import { Plus, Settings, Trash2, Edit2, Palette, FolderKanban, History, Cog, Save, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  onReorderZones?: (zones: Zone[]) => void;
  onApplyTemplate: (templateId: string) => void;
  onViewChange: (view: 'zones' | 'global' | 'history') => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onSaveAsTemplate?: (name: string) => void;
  onDeleteCustomTemplate?: (id: string) => void;
}

// 可排序的 Zone Item 组件
function SortableZoneItem({
  zone,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: {
  zone: Zone;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: zone.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`zone-item ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      <button
        className="zone-grip"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={12} />
      </button>
      <button
        className="zone-content"
        onClick={onSelect}
      >
        <div
          className="zone-color-indicator"
          style={{ backgroundColor: zone.color }}
        />
        <span className="zone-name">{zone.name}</span>
      </button>
      <div className="zone-actions">
        <Button
          size="icon"
          variant="ghost"
          className="zone-edit-btn"
          onClick={onEdit}
        >
          <Edit2 size={12} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="zone-delete-btn"
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  );
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
  onReorderZones,
  onApplyTemplate,
  onViewChange,
  onOpenHistory,
  onOpenSettings,
  onSaveAsTemplate,
  onDeleteCustomTemplate,
}: ZoneManagerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = zones.findIndex((z) => z.id === active.id);
      const newIndex = zones.findIndex((z) => z.id === over.id);

      const newZones = arrayMove(zones, oldIndex, newIndex).map((z, i) => ({
        ...z,
        order: i,
      }));

      onReorderZones?.(newZones);
    }
  };
  const [isAdding, setIsAdding] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneColor, setNewZoneColor] = useState(ZONE_COLORS[0]);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={zones.map(z => z.id)}
            strategy={verticalListSortingStrategy}
          >
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
                <SortableZoneItem
                  key={zone.id}
                  zone={zone}
                  isActive={activeZoneId === zone.id}
                  onSelect={() => onSelectZone(zone.id)}
                  onEdit={() => setEditingZone(zone)}
                  onDelete={() => onDeleteZone(zone.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      {/* Edit Zone Dialog */}
      {editingZone && (
        <Dialog open={!!editingZone} onOpenChange={(open) => !open && setEditingZone(null)}>
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
                <Button variant="outline" onClick={() => setEditingZone(null)}>
                  取消
                </Button>
                <Button onClick={handleUpdateZone}>
                  保存
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
