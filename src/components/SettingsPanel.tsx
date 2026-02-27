import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Settings, Clock, Volume2, RotateCcw, Flag, Zap, Repeat, Plus, Trash2, Edit2, Bookmark, Download, Upload, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AppState, TimerMode, GlobalViewSortMode, Zone, RecurringTemplate, TaskPriority, ConfigProfile } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { useAppStore } from '@/store';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';

interface SettingsPanelProps {
  settings: AppState['settings'];
  zones: Zone[];
  recurringTemplates: RecurringTemplate[];
  onAddRecurringTemplate: (template: Omit<RecurringTemplate, 'id' | 'lastTriggeredAt'>) => void;
  onUpdateRecurringTemplate: (id: string, updates: Partial<RecurringTemplate>) => void;
  onDeleteRecurringTemplate: (id: string) => void;
  onBack: () => void;
  onUpdateSettings: (settings: Partial<AppState['settings']>) => void;
  onPreviewMode?: (mode: TimerMode) => void;
}

export function SettingsPanel({
  settings,
  zones,
  recurringTemplates,
  onAddRecurringTemplate,
  onUpdateRecurringTemplate,
  onDeleteRecurringTemplate,
  onBack,
  onUpdateSettings,
  onPreviewMode,
}: SettingsPanelProps) {
  const [workMinutes, setWorkMinutes] = useState(Math.floor(settings.workDuration / 60));
  const [breakMinutes, setBreakMinutes] = useState(Math.floor(settings.breakDuration / 60));
  const [longBreakMinutes, setLongBreakMinutes] = useState(Math.floor(settings.longBreakDuration / 60));
  const [priorityWeight, setPriorityWeight] = useState(settings.globalViewSort.priorityWeight * 100);
  const [autoSaveInterval, setAutoSaveInterval] = useState(settings.autoSaveInterval || 60);
  // deadlineWeight 由 priorityWeight 计算得出，保证两者之和为 100
  const deadlineWeight = useMemo(() => 100 - priorityWeight, [priorityWeight]);

  // 定时任务配置弹窗状态
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null);
  const [recTitle, setRecTitle] = useState('');
  const [recDesc, setRecDesc] = useState('');
  const [recZoneId, setRecZoneId] = useState('');
  const [recPriority, setRecPriority] = useState<TaskPriority>('medium');
  const [recIntervalValue, setRecIntervalValue] = useState(1);
  const [recIntervalUnit, setRecIntervalUnit] = useState<'minutes' | 'hours' | 'days'>('days');
  const [recDeadlineValue, setRecDeadlineValue] = useState(2);
  const [recDeadlineUnit, setRecDeadlineUnit] = useState<'hours' | 'days'>('days');

  // 配置快照相关状态
  const { configProfiles, saveConfigProfile, applyConfigProfile, deleteConfigProfile, updateConfigProfile, importConfigProfile } = useAppStore();
  const [showSaveProfileDialog, setShowSaveProfileDialog] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [editingProfile, setEditingProfile] = useState<ConfigProfile | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');

  // 初始化默认分区
  useEffect(() => {
    if (zones.length > 0 && !recZoneId) {
      setRecZoneId(zones[0].id);
    }
  }, [zones, recZoneId]);

  // 打开编辑弹窗
  const handleEditTemplate = (tpl: RecurringTemplate) => {
    setEditingTemplate(tpl);
    setRecTitle(tpl.title);
    setRecDesc(tpl.description);
    setRecZoneId(tpl.zoneId);
    setRecPriority(tpl.priority);

    // 反推 interval 单位
    if (tpl.intervalMinutes < 60) {
      setRecIntervalValue(tpl.intervalMinutes);
      setRecIntervalUnit('minutes');
    } else if (tpl.intervalMinutes < 1440) {
      setRecIntervalValue(Math.round(tpl.intervalMinutes / 60));
      setRecIntervalUnit('hours');
    } else {
      setRecIntervalValue(Math.round(tpl.intervalMinutes / 1440));
      setRecIntervalUnit('days');
    }

    // 反推 deadline 单位
    if (tpl.deadlineOffsetHours < 24) {
      setRecDeadlineValue(tpl.deadlineOffsetHours);
      setRecDeadlineUnit('hours');
    } else {
      setRecDeadlineValue(Math.round(tpl.deadlineOffsetHours / 24));
      setRecDeadlineUnit('days');
    }

    setShowRecurringDialog(true);
  };

  const handleSaveRecurring = () => {
    if (!recTitle.trim() || !recZoneId) return;

    // 转换为底层需要的单位，并强制最低 5 分钟安全限制
    let intervalMinutes = recIntervalUnit === 'days'
      ? recIntervalValue * 24 * 60
      : recIntervalUnit === 'hours'
        ? recIntervalValue * 60
        : recIntervalValue;

    // 强制防刷屏限制：任何任务的生成间隔不得低于 5 分钟
    if (intervalMinutes < 5) {
      intervalMinutes = 5;
    }

    const deadlineOffsetHours = recDeadlineUnit === 'days' ? recDeadlineValue * 24 : recDeadlineValue;

    if (editingTemplate) {
      // 编辑模式
      onUpdateRecurringTemplate(editingTemplate.id, {
        title: recTitle.trim(),
        description: recDesc.trim(),
        zoneId: recZoneId,
        priority: recPriority,
        intervalMinutes,
        deadlineOffsetHours,
      });
    } else {
      // 新建模式
      onAddRecurringTemplate({
        title: recTitle.trim(),
        description: recDesc.trim(),
        zoneId: recZoneId,
        priority: recPriority,
        intervalMinutes,
        deadlineOffsetHours,
        isActive: true,
        scope: 'global',
      });
    }

    setShowRecurringDialog(false);
    setEditingTemplate(null);
    setRecTitle('');
    setRecDesc('');
    setRecIntervalValue(1);
    setRecDeadlineValue(2);
  };

  // 导出配置
  const handleExportConfig = async () => {
    try {
      const state = useAppStore.getState();
      const exportData = {
        version: 1,
        name: `环境备份 ${new Date().toLocaleDateString()}`,
        settings: state.settings,
        customTemplates: state.customTemplates,
        recurringTemplates: state.recurringTemplates.filter((r: RecurringTemplate) => r.scope === 'global' || !r.scope)
      };

      const filePath = await save({
        defaultPath: `focus-flow-env-${Date.now()}.json`,
        filters:[{ name: 'JSON', extensions: ['json'] }]
      });

      if (filePath) {
        await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
        toast.success('环境配置已成功导出！');
      }
    } catch (e) {
      console.error('导出配置失败', e);
      toast.error('导出配置失败');
    }
  };

  // 导入配置
  const handleImportConfig = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (selected && typeof selected === 'string') {
        const content = await readTextFile(selected);
        const success = importConfigProfile(JSON.parse(content));
        if (success) {
          toast.success('配置已导入到快照列表，请点击应用');
        } else {
          toast.error('文件格式错误');
        }
      }
    } catch (e) {
      console.error('导入配置失败', e);
      toast.error('导入配置失败');
    }
  };

  // 同步外部 settings 变化到本地状态
  useEffect(() => {
    setWorkMinutes(Math.floor(settings.workDuration / 60));
  }, [settings.workDuration]);

  useEffect(() => {
    setBreakMinutes(Math.floor(settings.breakDuration / 60));
  }, [settings.breakDuration]);

  useEffect(() => {
    setLongBreakMinutes(Math.floor(settings.longBreakDuration / 60));
  }, [settings.longBreakDuration]);

  useEffect(() => {
    setAutoSaveInterval(settings.autoSaveInterval || 60);
  }, [settings.autoSaveInterval]);

  const handleWorkDurationChange = (value: number[]) => {
    const minutes = value[0];
    setWorkMinutes(minutes);
    onUpdateSettings({ workDuration: minutes * 60 });
  };

  const handleBreakDurationChange = (value: number[]) => {
    const minutes = value[0];
    setBreakMinutes(minutes);
    onUpdateSettings({ breakDuration: minutes * 60 });
  };

  const handleLongBreakDurationChange = (value: number[]) => {
    const minutes = value[0];
    setLongBreakMinutes(minutes);
    onUpdateSettings({ longBreakDuration: minutes * 60 });
  };

  // 预览模式 - 只在完成拖动后触发
  const handleWorkDurationCommit = () => {
    onPreviewMode?.('work');
  };

  const handleBreakDurationCommit = () => {
    onPreviewMode?.('break');
  };

  const handleLongBreakDurationCommit = () => {
    onPreviewMode?.('longBreak');
  };

  const handlePriorityWeightChange = (value: number[]) => {
    const weight = value[0];
    setPriorityWeight(weight);
    // deadlineWeight 会通过 useMemo 自动计算
    onUpdateSettings({
      globalViewSort: {
        mode: settings.globalViewSort.mode as GlobalViewSortMode,
        priorityWeight: weight / 100,
        deadlineWeight: (100 - weight) / 100,
      },
    });
  };

  const handleDeadlineWeightChange = (value: number[]) => {
    // 紧急度 Slider 正向联动：拖动紧急度时，优先级跟随反向变动
    const dWeight = value[0];
    const pWeight = 100 - dWeight;
    setPriorityWeight(pWeight);
    onUpdateSettings({
      globalViewSort: {
        mode: settings.globalViewSort.mode as GlobalViewSortMode,
        priorityWeight: pWeight / 100,
        deadlineWeight: dWeight / 100,
      },
    });
  };

  const handleReset = () => {
    setWorkMinutes(25);
    setBreakMinutes(5);
    setLongBreakMinutes(15);
    setPriorityWeight(DEFAULT_SETTINGS.globalViewSort.priorityWeight * 100);
    setAutoSaveInterval(DEFAULT_SETTINGS.autoSaveInterval);
    // deadlineWeight 会通过 useMemo 自动计算
    onUpdateSettings({
      workDuration: DEFAULT_SETTINGS.workDuration,
      breakDuration: DEFAULT_SETTINGS.breakDuration,
      longBreakDuration: DEFAULT_SETTINGS.longBreakDuration,
      autoStartBreak: DEFAULT_SETTINGS.autoStartBreak,
      soundEnabled: DEFAULT_SETTINGS.soundEnabled,
      globalViewSort: DEFAULT_SETTINGS.globalViewSort,
      autoSaveEnabled: DEFAULT_SETTINGS.autoSaveEnabled,
      autoSaveInterval: DEFAULT_SETTINGS.autoSaveInterval,
    });
  };

  return (
    <div className="settings-panel-container">
      {/* Header */}
      <div className="settings-panel-header">
        <Button
          size="icon"
          variant="ghost"
          className="back-btn"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="settings-panel-title">
          <Settings size={18} className="text-blue-400" />
          <span>设置</span>
        </div>
      </div>

      {/* Settings Content */}
      <div className="settings-content">
        {/* Timer Settings */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Clock size={14} className="mr-2" />
            计时器设置
          </h3>

          {/* Work Duration */}
          <div className="setting-item">
            <div className="setting-label">
              <span>专注时长 (分钟)</span>
              <Input
                type="number"
                value={workMinutes}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value) || 0);
                  setWorkMinutes(val);
                  onUpdateSettings({ workDuration: val * 60 });
                }}
                className="w-20 h-8 text-right font-mono bg-black/30 border-white/20 text-white"
                min={1}
              />
            </div>
            <Slider
              value={[workMinutes]}
              onValueChange={handleWorkDurationChange}
              onValueCommit={handleWorkDurationCommit}
              min={1}
              max={120}
              step={1}
              className="setting-slider mt-2"
            />
          </div>

          {/* Break Duration */}
          <div className="setting-item">
            <div className="setting-label">
              <span>短休息时长 (分钟)</span>
              <Input
                type="number"
                value={breakMinutes}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value) || 0);
                  setBreakMinutes(val);
                  onUpdateSettings({ breakDuration: val * 60 });
                }}
                className="w-20 h-8 text-right font-mono bg-black/30 border-white/20 text-white"
                min={1}
              />
            </div>
            <Slider
              value={[breakMinutes]}
              onValueChange={handleBreakDurationChange}
              onValueCommit={handleBreakDurationCommit}
              min={1}
              max={60}
              step={1}
              className="setting-slider mt-2"
            />
          </div>

          {/* Long Break Duration */}
          <div className="setting-item">
            <div className="setting-label">
              <span>长休息时长 (分钟)</span>
              <Input
                type="number"
                value={longBreakMinutes}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value) || 0);
                  setLongBreakMinutes(val);
                  onUpdateSettings({ longBreakDuration: val * 60 });
                }}
                className="w-20 h-8 text-right font-mono bg-black/30 border-white/20 text-white"
                min={1}
              />
            </div>
            <Slider
              value={[longBreakMinutes]}
              onValueChange={handleLongBreakDurationChange}
              onValueCommit={handleLongBreakDurationCommit}
              min={1}
              max={90}
              step={1}
              className="setting-slider mt-2"
            />
          </div>
        </div>

        {/* Weighted Sort Settings */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Flag size={14} className="mr-2" />
            加权排序设置
          </h3>
          <p className="settings-section-desc">
            在全局视图使用加权排序时，优先级和紧急度的权重比例
          </p>

          {/* Priority Weight */}
          <div className="setting-item">
            <div className="setting-label">
              <Flag size={14} className="mr-2 text-red-400" />
              <span>优先级权重</span>
              <span className="setting-value">{priorityWeight}%</span>
            </div>
            <Slider
              value={[priorityWeight]}
              onValueChange={handlePriorityWeightChange}
              min={0}
              max={100}
              step={10}
              className="setting-slider mt-2"
            />
          </div>

          {/* Urgency Weight */}
          <div className="setting-item">
            <div className="setting-label">
              <Zap size={14} className="mr-2 text-orange-400" />
              <span>紧急度权重</span>
              <span className="setting-value">{deadlineWeight}%</span>
            </div>
            <Slider
              value={[deadlineWeight]}
              onValueChange={handleDeadlineWeightChange}
              min={0}
              max={100}
              step={10}
              className="setting-slider mt-2"
            />
          </div>
        </div>

        {/* Other Settings */}
        <div className="settings-section">
          <h3 className="settings-section-title">
            <Volume2 size={14} className="mr-2" />
            其他设置
          </h3>

          {/* Auto Start Break */}
          <div className="setting-item switch">
            <div className="setting-label">
              <span>自动开始休息</span>
              <span className="setting-desc">专注结束后自动开始休息计时</span>
            </div>
            <Switch
              checked={settings.autoStartBreak}
              onCheckedChange={(checked) => onUpdateSettings({ autoStartBreak: checked })}
            />
          </div>

          {/* Sound Enabled */}
          <div className="setting-item switch">
            <div className="setting-label">
              <span>声音提醒</span>
              <span className="setting-desc">计时结束时播放提示音</span>
            </div>
            <Switch
              checked={settings.soundEnabled}
              onCheckedChange={(checked) => onUpdateSettings({ soundEnabled: checked })}
            />
          </div>

          {/* Auto Save Enabled */}
          <div className="setting-item switch">
            <div className="setting-label">
              <span>自动保存历史</span>
              <span className="setting-desc">自动将当前工作区保存到历史记录</span>
            </div>
            <Switch
              checked={settings.autoSaveEnabled || false}
              onCheckedChange={(checked) => onUpdateSettings({ autoSaveEnabled: checked })}
            />
          </div>

          {/* Auto Save Interval */}
          {settings.autoSaveEnabled && (
            <div className="setting-item">
              <div className="setting-label">
                <span>保存间隔 (秒)</span>
                <Input
                  type="number"
                  value={autoSaveInterval}
                  onChange={(e) => {
                    const val = Math.max(10, parseInt(e.target.value) || 60);
                    setAutoSaveInterval(val);
                    onUpdateSettings({ autoSaveInterval: val });
                  }}
                  className="w-20 h-8 text-right font-mono bg-black/30 border-white/20 text-white"
                  min={10}
                />
              </div>
              <Slider
                value={[autoSaveInterval]}
                onValueChange={(value) => {
                  setAutoSaveInterval(value[0]);
                }}
                onValueCommit={(value) => {
                  onUpdateSettings({ autoSaveInterval: value[0] });
                }}
                min={10}
                max={300}
                step={10}
                className="setting-slider mt-2"
              />
            </div>
          )}
        </div>

        {/* Recurring Tasks Settings */}
        <div className="settings-section">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
            <h3 className="flex items-center text-xs font-semibold text-white/70">
              <Repeat size={14} className="mr-2 text-green-400" />
              定时任务 (自动化)
            </h3>
            <Button size="sm" className="h-6 text-xs px-2 bg-blue-600 hover:bg-blue-500 text-white" onClick={() => setShowRecurringDialog(true)}>
              <Plus size={12} className="mr-1" />
              新建规则
            </Button>
          </div>
          <p className="settings-section-desc mb-3">
            设置周期性任务，系统会在后台自动为您生成待办事项。
          </p>

          <div className="flex flex-col gap-2">
            {!recurringTemplates || recurringTemplates.length === 0 ? (
              <div className="text-center py-4 text-xs text-white/30 bg-black/10 rounded-md border border-dashed border-white/10">
                暂无自动化规则
              </div>
            ) : (
              recurringTemplates.map(tpl => (
                <div key={tpl.id} className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white/90">{tpl.title}</span>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={tpl.isActive}
                        onCheckedChange={(c) => onUpdateRecurringTemplate(tpl.id, { isActive: c })}
                      />
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-white/40 hover:text-blue-400 hover:bg-blue-400/10" onClick={() => handleEditTemplate(tpl)} title="编辑规则">
                        <Edit2 size={12} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-white/40 hover:text-red-400 hover:bg-red-400/10" onClick={() => onDeleteRecurringTemplate(tpl.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                    <span className="flex items-center">
                      <Repeat size={10} className="mr-1" />
                      每 {tpl.intervalMinutes >= 1440 ? `${tpl.intervalMinutes / 1440} 天` : tpl.intervalMinutes >= 60 ? `${tpl.intervalMinutes / 60} 小时` : `${tpl.intervalMinutes} 分钟`}
                    </span>
                    <span className="flex items-center">
                      <Clock size={10} className="mr-1" />
                      DDL: 生成后 {tpl.deadlineOffsetHours >= 24 ? `${tpl.deadlineOffsetHours / 24} 天` : `${tpl.deadlineOffsetHours} 小时`}
                    </span>
                    <span className="flex items-center">
                      <Flag size={10} className="mr-1" />
                      存放至: {zones.find(z => z.id === tpl.zoneId)?.name || '未知分区'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 新建定时任务的弹窗 */}
        <Dialog open={showRecurringDialog} onOpenChange={setShowRecurringDialog}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>新建定时任务</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-white/60">任务名称</label>
                <Input value={recTitle} onChange={e => setRecTitle(e.target.value)} className="bg-black/30 border-white/20" placeholder="例如：每周周报总结" />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-white/60">描述 (可选)</label>
                <Input value={recDesc} onChange={e => setRecDesc(e.target.value)} className="bg-black/30 border-white/20" placeholder="任务描述..." />
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs text-white/60">触发间隔 <span className="text-white/30 text-[10px]">(最小5分钟)</span></label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={recIntervalUnit === 'minutes' ? 5 : 1}
                      value={recIntervalValue}
                      onChange={e => {
                        const val = Number(e.target.value);
                        // 如果单位是分钟，限制最低输入为5
                        if (recIntervalUnit === 'minutes' && val < 5 && val !== 0) {
                          setRecIntervalValue(5);
                        } else {
                          setRecIntervalValue(val);
                        }
                      }}
                      className="bg-black/30 border-white/20"
                    />
                    <Select value={recIntervalUnit} onValueChange={(v: 'minutes' | 'hours' | 'days') => {
                      setRecIntervalUnit(v);
                      if (v === 'minutes' && recIntervalValue < 5) {
                        setRecIntervalValue(5);
                      }
                    }}>
                      <SelectTrigger className="w-[80px] bg-black/30 border-white/20"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="minutes">分钟</SelectItem><SelectItem value="hours">小时</SelectItem><SelectItem value="days">天</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs text-white/60">目标分区</label>
                  <Select value={recZoneId} onValueChange={setRecZoneId}>
                    <SelectTrigger className="bg-black/30 border-white/20"><SelectValue placeholder="选择分区" /></SelectTrigger>
                    <SelectContent>
                      {zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs text-white/60">自动设定 DDL (生成后)</label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} value={recDeadlineValue} onChange={e => setRecDeadlineValue(Number(e.target.value))} className="bg-black/30 border-white/20" />
                    <Select value={recDeadlineUnit} onValueChange={(v: 'hours' | 'days') => setRecDeadlineUnit(v)}>
                      <SelectTrigger className="w-[80px] bg-black/30 border-white/20"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="hours">小时</SelectItem><SelectItem value="days">天</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-xs text-white/60">优先级</label>
                  <Select value={recPriority} onValueChange={(v: TaskPriority) => setRecPriority(v)}>
                    <SelectTrigger className="bg-black/30 border-white/20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">高 (High)</SelectItem>
                      <SelectItem value="medium">中 (Medium)</SelectItem>
                      <SelectItem value="low">低 (Low)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setShowRecurringDialog(false)}>取消</Button>
              <Button className="bg-blue-600 hover:bg-blue-500 text-white" onClick={handleSaveRecurring} disabled={!recTitle.trim()}>
                保存规则
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Environment Profiles Section */}
        <div className="settings-section mt-6">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
            <h3 className="flex items-center text-xs font-semibold text-white/70">
              <Bookmark size={14} className="mr-2 text-indigo-400" />
              环境配置快照
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={handleImportConfig}>
                <Upload size={12} className="mr-1" /> 导入
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={handleExportConfig}>
                <Download size={12} className="mr-1" /> 导出
              </Button>
            </div>
          </div>
          <p className="settings-section-desc mb-3">
            将当前的设置、模板和全局自动化规则打包保存。方便在不同工作模式间一键切换。
          </p>

          <Button
            variant="outline"
            className="w-full mb-3 border-dashed border-indigo-500/50 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
            onClick={() => setShowSaveProfileDialog(true)}
          >
            <Save size={14} className="mr-2" /> 保存当前环境为快照
          </Button>

          <div className="flex flex-col gap-2">
            {(!configProfiles || configProfiles.length === 0) && (
              <div className="text-center py-4 text-xs text-white/30 bg-black/10 rounded-md border border-white/5">
                暂无配置快照
              </div>
            )}
            {(configProfiles || []).map(profile => (
              <div key={profile.id} className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 border border-white/10 hover:border-indigo-500/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white/90">{profile.name}</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="h-6 text-xs px-2 bg-indigo-600 hover:bg-indigo-500 text-white" onClick={() => {
                      applyConfigProfile(profile.id);
                      toast.success(`已应用环境：${profile.name}`);
                    }}>
                      应用
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-white/40 hover:text-blue-400 hover:bg-blue-400/10" onClick={() => {
                      setEditingProfile(profile);
                      setEditingProfileName(profile.name);
                    }}>
                      <Edit2 size={12} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-white/40 hover:text-red-400 hover:bg-red-400/10" onClick={() => deleteConfigProfile(profile.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
                <div className="text-[10px] text-white/40">
                  创建于: {new Date(profile.createdAt).toLocaleString()} · 包含 {profile.recurringTemplates.length} 个全局规则
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save Profile Dialog */}
        <Dialog open={showSaveProfileDialog} onOpenChange={setShowSaveProfileDialog}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>保存配置快照</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <Input
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="例如：极简办公模式"
                className="bg-black/30 border-white/20"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="ghost" onClick={() => setShowSaveProfileDialog(false)}>取消</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white" disabled={!profileName.trim()} onClick={() => {
                saveConfigProfile(profileName.trim(), recurringTemplates.filter((r: RecurringTemplate) => r.scope === 'global' || !r.scope));
                setProfileName('');
                setShowSaveProfileDialog(false);
                toast.success('快照保存成功');
              }}>
                保存
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Profile Dialog */}
        <Dialog open={!!editingProfile} onOpenChange={(open) => !open && setEditingProfile(null)}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>编辑配置快照</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <Input
                value={editingProfileName}
                onChange={e => setEditingProfileName(e.target.value)}
                placeholder="快照名称"
                className="bg-black/30 border-white/20"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="ghost" onClick={() => setEditingProfile(null)}>取消</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white" disabled={!editingProfileName.trim()} onClick={() => {
                if (editingProfile) {
                  updateConfigProfile(editingProfile.id, { name: editingProfileName.trim() });
                  toast.success('快照名称已更新');
                }
                setEditingProfile(null);
                setEditingProfileName('');
              }}>
                保存
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reset Button */}
        <div className="settings-footer">
          <Button
            variant="outline"
            size="sm"
            className="reset-btn"
            onClick={handleReset}
          >
            <RotateCcw size={14} className="mr-1" />
            恢复默认设置
          </Button>
        </div>
      </div>
    </div>
  );
}
