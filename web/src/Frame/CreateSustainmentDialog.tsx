'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Textarea } from '@/ui/textarea';
import { Check, Plus } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { IconPicker } from '@/Function/shared/itemIcon/IconPicker';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { TemplateRow } from '@/Function/sustainment/TemplateRow';
import { BUSINESS_TEMPLATES, definitionFromTemplate, say, type BusinessTemplate } from '@/Function/sustainment/businessTemplates';
import { NavDomainIcon } from '@/Frame/sidebar/NavIcons';
import type { NewSustainmentInput } from '@/hooks/useSustainments';
import type { Sustainment } from '@/types/database';

// The rail's "+", in two steps. First what it will manage: a business
// template (CRM, Accounting …) or a blank one. Then its name and icon, what
// it is for, and which of the template's functions to start with — each
// one a draft the team checks and publishes inside. Creating opens the new
// Sustainment; a failed insert says so here and keeps what was typed.

export function CreateSustainmentDialog({ onClose, onCreate, onCreated }: {
  onClose: () => void;
  onCreate: (input: NewSustainmentInput) => Promise<Sustainment>;
  onCreated: (row: Sustainment) => void;
}) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState<'pick' | 'details'>('pick');
  const [template, setTemplate] = useState<BusinessTemplate | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [purpose, setPurpose] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const choose = (tpl: BusinessTemplate | null) => {
    setTemplate(tpl);
    setName(tpl ? say(tpl.name, locale) : '');
    setIcon(tpl?.icon ?? null);
    setPurpose(tpl ? say(tpl.purpose, locale) : '');
    setPicked(new Set(tpl?.functions.map((f) => f.key) ?? []));
    setError(null);
    setStep('details');
  };

  const toggle = (key: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) { setError(t('Enter a name.')); nameRef.current?.focus(); return; }
    setSaving(true);
    setError(null);
    try {
      const functions = (template?.functions ?? []).filter((f) => picked.has(f.key)).map((f) => ({
        name: say(f.name, locale), icon: f.icon, templateKey: f.key, definition: definitionFromTemplate(f, locale),
      }));
      const row = await onCreate({ name: trimmed, icon, description: purpose, functions });
      onCreated(row);
    } catch (err) {
      const detail = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      setError(detail ? `${t('Could not create the Sustainment.')} ${detail}` : t('Could not create the Sustainment.'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {step === 'pick' ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t('What will this Sustainment manage?')}</DialogTitle>
            </DialogHeader>
            <ul className="-mx-2 grid gap-0.5" aria-label={t('Business templates')}>
              {BUSINESS_TEMPLATES.map((tpl) => (
                <li key={tpl.key}>
                  <TemplateRow icon={<ItemIcon icon={tpl.icon} size={16} />} title={say(tpl.name, locale)}
                    detail={tpl.functions.map((f) => say(f.name, locale)).join(' · ')}
                    onClick={() => choose(tpl)} />
                </li>
              ))}
              <li>
                <TemplateRow icon={<Plus size={16} />} title={t('Blank')}
                  detail={t('Name it now and add functions inside')} onClick={() => choose(null)} />
              </li>
            </ul>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t('Create Sustainment')}</DialogTitle>
            </DialogHeader>
            <div className="flex items-end gap-2">
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">{t('Icon')}</div>
                <IconPicker value={{ icon, color: null }} onChange={(next) => setIcon(next.icon)}
                  defaultIcon={<NavDomainIcon size={16} />}>
                  <button type="button" aria-label={t('Change icon')} title={t('Change icon')}
                    className="flex size-8 items-center justify-center rounded-md border border-[var(--border-subtle)] text-muted-foreground transition-colors hover:bg-[var(--surface-strong)] hover:text-foreground">
                    {icon
                      ? <ItemIcon icon={icon} size={16} />
                      : <span aria-hidden className="text-[13px] font-semibold">{name.trim().charAt(0) || '·'}</span>}
                  </button>
                </IconPicker>
              </div>
              <label className="min-w-0 flex-1">
                <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">{t('Name')}</span>
                <Input ref={nameRef} autoFocus value={name} required aria-required="true"
                  aria-invalid={error && !name.trim() ? true : undefined}
                  onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
                  placeholder={t('e.g. Accounting, CRM')} className="h-8 text-[13px] md:text-[13px]" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">{t('What it is for')}</span>
              <Textarea value={purpose} rows={3} onChange={(e) => setPurpose(e.target.value)}
                placeholder={t('e.g. Bill customers on the 20th and know what is unpaid')} />
            </label>
            {template && (
              <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[12px] font-medium text-muted-foreground">
                  {t('Start with these functions')}
                </legend>
                <div className="grid gap-0.5">
                  {template.functions.map((f) => {
                    const on = picked.has(f.key);
                    return (
                      // The whole row is the checkbox, so it is easy to hit.
                      <button key={f.key} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(f.key)}
                        className="flex w-full items-start gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left outline-none transition-colors hover:bg-[var(--surface-strong)] focus-visible:bg-[var(--surface-strong)]">
                        <span aria-hidden className={`mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border ${on
                          ? 'border-transparent bg-[var(--accent-default)] text-white' : 'border-[var(--border-strong)]'}`}>
                          {on && <Check size={11} />}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                            <ItemIcon icon={f.icon} size={14} className="text-muted-foreground" />{say(f.name, locale)}
                          </span>
                          <span className="block text-[12px] leading-[1.4] text-muted-foreground">{say(f.intent, locale)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  {t('Each starts as a draft. Change what differs for your company, then publish it.')}
                </p>
              </fieldset>
            )}
            {error && <p role="alert" className="text-[12px] text-[var(--status-danger)]">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStep('pick')} disabled={saving}>{t('Back')}</Button>
              <Button type="submit" variant="primary" disabled={saving}>{saving ? t('Creating…') : t('Create')}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
