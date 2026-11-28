'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { IconPicker } from '@/Function/shared/itemIcon/IconPicker';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { NavDomainIcon } from '@/Frame/sidebar/NavIcons';
import type { Sustainment } from '@/types/database';

// The rail's "+": a name (required) and, if wanted, an icon. Creating opens
// the new Sustainment; a failed insert says so here and keeps what was typed.
// A Sustainment keeps an icon and no colour, so a colour picked in the
// picker is not kept.

export function CreateSustainmentDialog({ onClose, onCreate, onCreated }: {
  onClose: () => void;
  onCreate: (input: { name: string; icon: string | null }) => Promise<Sustainment>;
  onCreated: (row: Sustainment) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) { setError(t('Enter a name.')); nameRef.current?.focus(); return; }
    setSaving(true);
    setError(null);
    try {
      const row = await onCreate({ name: trimmed, icon });
      onCreated(row);
    } catch (err) {
      const detail = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      setError(detail ? `${t('Could not create the Sustainment.')} ${detail}` : t('Could not create the Sustainment.'));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
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
          {error && <p role="alert" className="text-[12px] text-[var(--status-danger)]">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>{t('Cancel')}</Button>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? t('Creating…') : t('Create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
