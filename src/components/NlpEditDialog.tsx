import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2, Loader2, AlertTriangle, Plus, Pencil, Trash2, SkipForward, CornerDownRight, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Task, Zone } from '@/types';
import { planOps, type PlanResult, type Snapshot, type PlannedAction } from '@/lib/nlp-edit/apply-core';
import { writeByokConfig, type NlpProvider, type ProviderError, type ByokConfig } from '@/lib/nlp-edit/provider';
import { createAppNlpProvider } from '@/lib/nlp-edit/runtime';

type PlanOk = Extract<PlanResult, { kind: 'plan' }>;

interface NlpEditDialogProps {
  zones: Zone[];
  tasks: Task[];
  onApply: (actions: PlannedAction[]) => unknown;
  /** 注入点：测试喂 mock provider；默认接真实浏览器运行时（dev 经 vite 代理）。 */
  providerFactory?: () => NlpProvider;
  /** 注入点：保存 BYOK 配置；默认写入 localStorage['byok_v1']。 */
  saveConfig?: (cfg: ByokConfig) => void;
}

function formatProviderError(e: ProviderError, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (e.code === 'NOT_CONFIGURED' || e.code === 'BAD_CONFIG') return t('nlp.notConfigured');
  return `${t('nlp.errorTitle')}：${e.message}`;
}

function changeSummary(changes: Partial<Task>): string {
  return Object.entries(changes)
    .filter(([k]) => k !== 'parentId') // parentId（重挂父）单独用解析后的父任务名展示
    .map(([k, v]) => {
      if (v !== null && typeof v === 'object') return k;
      return `${k} = ${String(v)}`;
    })
    .join('，');
}

export function NlpEditDialog({
  zones,
  tasks,
  onApply,
  providerFactory = createAppNlpProvider,
  saveConfig = writeByokConfig,
}: NlpEditDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanOk | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  // BYOK 配置态
  const [configMode, setConfigMode] = useState(false);
  // 仅用于「保存配置后强制重渲染」→ 重读 localStorage（首配时表单是靠 !config.ok 显示的，
  // configMode 本就是 false，单 setConfigMode(false) 不会触发重渲染，故需显式 tick）。
  const [, bumpCfg] = useState(0);
  const [cfgBase, setCfgBase] = useState('');
  const [cfgKey, setCfgKey] = useState('');
  const [cfgModel, setCfgModel] = useState('');
  const [cfgProvider, setCfgProvider] = useState('');

  const titleById = useMemo(() => new Map(tasks.map((x) => [x.id, x.title] as [string, string])), [tasks]);

  // 按需读 BYOK 配置（localStorage 读很轻）；保存后 setConfigMode 触发重渲染即自动刷新。缺失/损坏则进配置态。
  const config = open ? providerFactory().readConfig() : null;
  const showConfig = configMode || (config != null && !config.ok);

  const reset = useCallback(() => {
    setStep('input');
    setInput('');
    setLoading(false);
    setError(null);
    setPlan(null);
    setDeleteConfirmed(false);
    setConfigMode(false);
  }, []);

  const handleOpenChange = useCallback(
    (o: boolean) => {
      setOpen(o);
      if (!o) reset();
    },
    [reset],
  );

  const openConfig = useCallback(() => {
    const c = providerFactory().readConfig();
    if (c.ok) {
      setCfgBase(c.config.base);
      setCfgKey(c.config.key);
      setCfgModel(c.config.model);
      setCfgProvider(c.config.provider ?? '');
    }
    setError(null);
    setConfigMode(true);
  }, [providerFactory]);

  const handleSaveConfig = useCallback(() => {
    const base = cfgBase.trim();
    const key = cfgKey.trim();
    const model = cfgModel.trim();
    if (!base || !key || !model) {
      setError(t('nlp.cfgIncomplete'));
      return;
    }
    saveConfig({ provider: cfgProvider.trim() || undefined, base, key, model });
    setConfigMode(false);
    bumpCfg((n) => n + 1); // 强制重渲染 → 重读配置（首配时 configMode 已是 false，否则不会刷新）
    setError(null);
    toast.success(t('nlp.cfgSaved'));
  }, [cfgBase, cfgKey, cfgModel, cfgProvider, saveConfig, t]);

  const handleGenerate = useCallback(async () => {
    const text = input.trim();
    if (!text) {
      setError(t('nlp.emptyInput'));
      return;
    }
    setLoading(true);
    setError(null);
    const snapshot: Snapshot = { zones, tasks };
    const r = await providerFactory().requestOps(text, snapshot);
    setLoading(false);
    if (r.kind === 'error') {
      setError(formatProviderError(r.error, t));
      return;
    }
    const result = planOps(snapshot, r.ops, { invalidPolicy: 'skip' });
    if (result.kind === 'noop') {
      setError(t('nlp.noChanges'));
      return;
    }
    if (result.kind === 'error') {
      setError(`${t('nlp.errorTitle')}：${result.error.code}`);
      return;
    }
    setPlan(result);
    setDeleteConfirmed(false);
    setStep('preview');
  }, [input, zones, tasks, providerFactory, t]);

  const handleApply = useCallback(() => {
    if (!plan) return;
    onApply(plan.actions);
    toast.success(t('nlp.applied', { count: plan.actions.length }));
    handleOpenChange(false);
  }, [plan, onApply, t, handleOpenChange]);

  const applyDisabled = !plan || plan.actions.length === 0 || (plan.hasDeletes && !deleteConfirmed);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="zone-action-btn" title={t('nlp.trigger')} data-testid="nlp-trigger">
          <Wand2 size={14} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 size={16} /> {t('nlp.title')}
            {config?.ok && !showConfig && (
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto h-7 w-7"
                data-testid="nlp-config-edit"
                title={t('nlp.editConfig')}
                onClick={openConfig}
              >
                <Settings size={14} />
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>
            {showConfig ? t('nlp.configTitle') : step === 'input' ? t('nlp.inputLabel') : t('nlp.previewTitle')}
          </DialogDescription>
        </DialogHeader>

        {/* BYOK 配置表单（未配置 / 点改配置时） */}
        {showConfig && (
          <div className="flex flex-col gap-3" data-testid="nlp-config">
            <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-50/60 p-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{t('nlp.plaintextWarn')}</span>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              {t('nlp.cfgBase')}
              <Input data-testid="cfg-base" value={cfgBase} onChange={(e) => setCfgBase(e.target.value)} placeholder="https://.../v1" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('nlp.cfgKey')}
              <Input data-testid="cfg-key" type="password" value={cfgKey} onChange={(e) => setCfgKey(e.target.value)} placeholder="sk-… / tp-…" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('nlp.cfgModel')}
              <Input data-testid="cfg-model" value={cfgModel} onChange={(e) => setCfgModel(e.target.value)} placeholder="model" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t('nlp.cfgProvider')}
              <Input data-testid="cfg-provider" value={cfgProvider} onChange={(e) => setCfgProvider(e.target.value)} placeholder="(optional)" />
            </label>
            {error && (
              <p data-testid="nlp-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {config?.ok && (
                <Button variant="outline" onClick={() => { setConfigMode(false); setError(null); }}>
                  {t('nlp.cancel')}
                </Button>
              )}
              <Button data-testid="cfg-save" onClick={handleSaveConfig}>
                {t('nlp.save')}
              </Button>
            </div>
          </div>
        )}

        {!showConfig && step === 'input' && (
          <div className="flex flex-col gap-3">
            <Textarea
              data-testid="nlp-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('nlp.placeholder')}
              rows={4}
              autoFocus
            />
            {error && (
              <p data-testid="nlp-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button data-testid="nlp-generate" onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {loading ? t('nlp.generating') : t('nlp.generate')}
              </Button>
            </div>
          </div>
        )}

        {!showConfig && step === 'preview' && plan && (
          <div className="flex flex-col gap-3">
            <ScrollArea className="max-h-[46vh] pr-3">
              <div className="flex flex-col gap-3 text-sm">
                {/* 新增（含父任务名 = TP8 防静默错挂） */}
                {plan.diff.added.length > 0 && (
                  <section className="flex flex-col gap-1">
                    <h4 className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                      <Plus size={14} /> {t('nlp.added')} · {plan.diff.added.length}
                    </h4>
                    {plan.diff.added.map((a, i) => (
                      <div key={i} data-testid="nlp-added" className="flex items-center gap-1.5 pl-4">
                        <span className="font-medium">{a.title}</span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <CornerDownRight size={12} />
                          {a.parentLabel ? t('nlp.attachTo', { parent: a.parentLabel }) : t('nlp.topLevel')}
                        </span>
                      </div>
                    ))}
                  </section>
                )}

                {/* 修改 */}
                {plan.diff.updated.length > 0 && (
                  <section className="flex flex-col gap-1">
                    <h4 className="flex items-center gap-1.5 font-medium text-sky-600 dark:text-sky-400">
                      <Pencil size={14} /> {t('nlp.updated')} · {plan.diff.updated.length}
                    </h4>
                    {plan.diff.updated.map((u, i) => {
                      const summary = changeSummary(u.changes);
                      return (
                        <div key={i} data-testid="nlp-updated" className="flex flex-wrap items-center gap-1 pl-4">
                          <span className="font-medium">{titleById.get(u.id) ?? u.id}</span>
                          {summary && <span className="text-muted-foreground">：{summary}</span>}
                          {u.parentLabel !== undefined && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <CornerDownRight size={12} />
                              {u.parentLabel ? t('nlp.attachTo', { parent: u.parentLabel }) : t('nlp.topLevel')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </section>
                )}

                {/* 删除（含级联计数 → 强制确认） */}
                {plan.hasDeletes && (
                  <section className="flex flex-col gap-1">
                    <h4 className="flex items-center gap-1.5 font-medium text-destructive">
                      <Trash2 size={14} /> {t('nlp.deleted')}
                    </h4>
                    <p className="pl-4 text-muted-foreground">
                      {t('nlp.deleteWarn', { count: plan.deleteCount })}
                      {plan.diff.deleted.cascadeCount > 0 &&
                        `（${t('nlp.cascadeNote', { count: plan.diff.deleted.cascadeCount })}）`}
                    </p>
                  </section>
                )}

                {/* 已跳过（部分应用：不静默，列出原因） */}
                {plan.skipped.length > 0 && (
                  <section className="flex flex-col gap-1">
                    <h4 className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                      <SkipForward size={14} /> {t('nlp.skipped')} · {plan.skipped.length}
                    </h4>
                    {plan.skipped.map((s, i) => (
                      <div key={i} data-testid="nlp-skipped" className="pl-4 text-muted-foreground">
                        #{s.opIndex + 1} · {s.code} · {s.message}
                      </div>
                    ))}
                  </section>
                )}

                {plan.actions.length === 0 && <p className="text-muted-foreground">{t('nlp.nothingToApply')}</p>}
              </div>
            </ScrollArea>

            {plan.hasDeletes && (
              <label className="flex items-center gap-2 text-sm text-destructive">
                <Checkbox
                  data-testid="nlp-delete-confirm"
                  checked={deleteConfirmed}
                  onCheckedChange={(c) => setDeleteConfirmed(c === true)}
                />
                {t('nlp.confirmDelete', { count: plan.deleteCount })}
              </label>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('input')}>
                {t('nlp.back')}
              </Button>
              <Button data-testid="nlp-apply" onClick={handleApply} disabled={applyDisabled}>
                {t('nlp.apply')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
