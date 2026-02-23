import { useState } from 'react';
import { ArrowLeft, Settings, Clock, Volume2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import type { AppState, TimerMode } from '@/types';
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

  const handleWorkDurationChange = (value: number[]) => {
    const minutes = value[0];
    setWorkMinutes(minutes);
    onUpdateSettings({ workDuration: minutes * 60 });
    onPreviewMode?.('work');
  };

  const handleBreakDurationChange = (value: number[]) => {
    const minutes = value[0];
    setBreakMinutes(minutes);
    onUpdateSettings({ breakDuration: minutes * 60 });
    onPreviewMode?.('break');
  };

  const handleLongBreakDurationChange = (value: number[]) => {
    const minutes = value[0];
    setLongBreakMinutes(minutes);
    onUpdateSettings({ longBreakDuration: minutes * 60 });
    onPreviewMode?.('longBreak');
  };

  const handleReset = () => {
    setWorkMinutes(25);
    setBreakMinutes(5);
    setLongBreakMinutes(15);
    onUpdateSettings({
      workDuration: DEFAULT_SETTINGS.workDuration,
      breakDuration: DEFAULT_SETTINGS.breakDuration,
      longBreakDuration: DEFAULT_SETTINGS.longBreakDuration,
      autoStartBreak: DEFAULT_SETTINGS.autoStartBreak,
      soundEnabled: DEFAULT_SETTINGS.soundEnabled,
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
              min={1}
              max={90}
              step={1}
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
