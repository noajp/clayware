'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Textarea } from '@/ui/textarea';
import { Box, Plus } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { IconPicker } from '@/Function/shared/itemIcon/IconPicker';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';

import { TemplateRow } from '@/Function/sustainment/TemplateRow';
import { BUSINESS_TEMPLATES, definitionFromTemplate, say, type FunctionTemplate } from '@/Function/sustainment/businessTemplates';
import { emptyDefinition } from '@/Function/sustainment/definition';
import type { NewFunctionInput } from '@/hooks/useSustainments';
import type { SustainmentFunction } from '@/types/database';

// Adding a function to a Sustainment, in two steps (PRODUCT.md §9.8): pick
// the business template it starts from (or none), then say its name, what
// it is for and what differs for this company. It is created as a draft,
// which nothing runs on until the team has checked and published it.

export function AddFunctionDialog({ existingKeys, onClose, onCreate, onCreated }: {
  /** Template keys this Sustainment already has a function from. */
  existingKeys: ReadonlySet<string>;
  onClose: () => void;
  onCreate: (input: NewFunctionInput) => Promise<SustainmentFunction>;
  onCreated: (row: SustainmentFunction) => void;
}) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState<'pick' | 'details'>('pick');
  const [template, setTemplate] = useState<FunctionTemplate | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [intent, setIntent] = useState('');
  const [differences, setDifferences] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const choose = (tpl: FunctionTemplate | null) => {
    setTemplate(tpl);
    setName(tpl ? say(tpl.name, locale) : '');
    setIcon(tpl?.icon ?? null);
    setIntent(tpl ? say(tpl.intent, locale) : '');
    setError(null);
    setStep('details');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) { setError(t('Enter a name.')); nameRef.current?.focus(); return; }
    setSaving(true);
    setError(null);
    try {
      const base = template ? definitionFromTemplate(template, locale) : emptyDefinition();
      const row = await onCreate({
        name: trimmed, icon, templateKey: template?.key ?? null, differences,
        definition: { ...base, intent: intent.trim() },
      });
      onCreated(row);
    } catch (err) {
      const detail = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      setError(detail ? `${t('Could not add the function.')} ${detail}` : t('Could not add the function.'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {step === 'pick' ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t('Add a function')}</DialogTitle>
            </DialogHeader>
            <div className="-mx-2 max-h-[min(60vh,440px)] overflow-y-auto">
              <TemplateRow icon={<Plus size={16} />} title={t('Blank')}
                detail={t('Write the definition yourself')} onClick={() => choose(null)} />
              {BUSINESS_TEMPLATES.map((group) => {
                const open = group.functions.filter((f) => !existingKeys.has(f.key));
                if (open.length === 0) return null;
                return (
                  <section key={group.key} aria-label={say(group.name, locale)}>
                    <h3 className="mt-3 px-2 pb-1 text-[12px] font-medium text-muted-foreground">{say(group.name, locale)}</h3>
                    {open.map((f) => (
                      <TemplateRow key={f.key} icon={<ItemIcon icon={f.icon} size={16} />} title={say(f.name, locale)}
                        detail={say(f.intent, locale)} onClick={() => choose(f)} />
                    ))}
                  </section>
                );
              })}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t('Add a function')}</DialogTitle>
            </DialogHeader>
            <div className="flex items-end gap-2">
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">{t('Icon')}</div>
                <IconPicker value={{ icon, color: null }} onChange={(next) => setIcon(next.icon)}
                  defaultIcon={<Box size={16} />}>
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
                  placeholder={t('e.g. Invoicing, Expenses')} className="h-8 text-[13px] md:text-[13px]" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">{t('What it is for')}</span>
              <Textarea value={intent} rows={2} onChange={(e) => setIntent(e.target.value)}
                placeholder={t('Who uses it, and what must always be right')} />
            </label>
            {template && (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-muted-foreground">{t('What differs for your company')}</span>
                <Textarea value={differences} rows={3} onChange={(e) => setDifferences(e.target.value)}
                  placeholder={t('e.g. A different closing day, an extra approval step, other names for things')} />
              </label>
            )}
            {error && <p role="alert" className="text-[12px] text-[var(--status-danger)]">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStep('pick')} disabled={saving}>{t('Back')}</Button>
              <Button type="submit" variant="primary" disabled={saving}>{saving ? t('Adding…') : t('Add as draft')}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
