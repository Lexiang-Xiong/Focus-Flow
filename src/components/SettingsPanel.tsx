import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Settings, Clock, Volume2, RotateCcw, Flag, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import type { AppState, TimerMode, GlobalViewSortMode } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';

interface SettingsPanelProps {
  settings: AppState['settings'];
  onBack: () => void;
  onUpdateSettings: (settings: Partial<AppState['settings']>) => void;
  onPreviewMode?: (mode: TimerMode) => void;
}

export function SettingsPanel({
  settings,
  onBack,
  onUpdateSettings,
  onPreviewMode,
}: SettingsPanelProps) {
  const [workMinutes, setWorkMinutes] = useState(Math.floor(settings.workDuration / 60));
  const [breakMinutes, setBreakMinutes] = useState(Math.floor(settings.breakDuration / 60));
  const [longBreakMinutes, setLongBreakMinutes] = useState(Math.floor(settings.longBreakDuration / 60));
  const [priorityWeight, setPriorityWeight] = useState(settings.globalViewSort.priorityWeight * 100);
  // deadlineWeight 由 priorityWeight 计算得出，保证两者之和为 100
  const deadlineWeight = useMemo(() => 100 - priorityWeight, [priorityWeight]);

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
    // deadlineWeight 会通过 useMemo 自动计算
    onUpdateSettings({
      workDuration: DEFAULT_SETTINGS.workDuration,
      breakDuration: DEFAULT_SETTINGS.breakDuration,
      longBreakDuration: DEFAULT_SETTINGS.longBreakDuration,
      autoStartBreak: DEFAULT_SETTINGS.autoStartBreak,
      soundEnabled: DEFAULT_SETTINGS.soundEnabled,
      globalViewSort: DEFAULT_SETTINGS.globalViewSort,
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
        </div>

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
