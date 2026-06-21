import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { readByokConfig, writeByokConfig, clearByokConfig } from '@/lib/nlp-edit/provider';

/**
 * 设置页的 BYOK 配置区：在 SettingsPanel 里也能填/改/清 byok_v1（不止对话框未配置态）。
 * 读写都走 provider 的 read/write/clearByokConfig（默认 localStorage）。key 明文存本机（UI 标风险）。
 */
export function ByokSettingsSection() {
  const { t } = useTranslation();
  const initial = readByokConfig();
  const cfg = initial.ok ? initial.config : null;
  const [base, setBase] = useState(cfg?.base ?? '');
  const [apiKey, setApiKey] = useState(cfg?.key ?? '');
  const [model, setModel] = useState(cfg?.model ?? '');
  const [provider, setProvider] = useState(cfg?.provider ?? '');
  const [configured, setConfigured] = useState(initial.ok);

  const save = () => {
    const b = base.trim();
    const k = apiKey.trim();
    const m = model.trim();
    if (!b || !k || !m) {
      toast.error(t('nlp.cfgIncomplete'));
      return;
    }
    writeByokConfig({ provider: provider.trim() || undefined, base: b, key: k, model: m });
    setConfigured(true);
    toast.success(t('nlp.cfgSaved'));
  };

  const clear = () => {
    clearByokConfig();
    setBase('');
    setApiKey('');
    setModel('');
    setProvider('');
    setConfigured(false);
    toast.success(t('nlp.cleared'));
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    testid: string,
    opts: { type?: string; placeholder?: string } = {},
  ) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-white/60">{label}</label>
      <Input
        data-testid={testid}
        type={opts.type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={opts.placeholder}
        className="bg-black/30 border-white/20"
      />
    </div>
  );

  return (
    <div className="settings-section" data-testid="byok-settings">
      <h3 className="settings-section-title">
        <Wand2 size={14} className="mr-2 text-violet-400" />
        {t('nlp.settingsTitle')}
      </h3>
      <p className="settings-section-desc">
        {t('nlp.settingsDesc')} · {configured ? t('nlp.statusOk') : t('nlp.statusNone')}
      </p>

      <div className="setting-item flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-950/30 p-2 text-xs text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{t('nlp.plaintextWarn')}</span>
        </div>
        {field(t('nlp.cfgBase'), base, setBase, 'byok-set-base', { placeholder: 'https://.../v1' })}
        {field(t('nlp.cfgKey'), apiKey, setApiKey, 'byok-set-key', { type: 'password', placeholder: 'sk-… / tp-…' })}
        {field(t('nlp.cfgModel'), model, setModel, 'byok-set-model', { placeholder: 'model' })}
        {field(t('nlp.cfgProvider'), provider, setProvider, 'byok-set-provider', { placeholder: '(optional)' })}
        <div className="flex gap-2">
          <Button data-testid="byok-save" className="bg-violet-600 hover:bg-violet-500 text-white" onClick={save}>
            {t('nlp.save')}
          </Button>
          {configured && (
            <Button data-testid="byok-clear" variant="outline" onClick={clear}>
              <Trash2 size={14} className="mr-1" />
              {t('nlp.clear')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
