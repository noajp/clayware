'use client';
import { useState } from 'react';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { fieldDisplayLabel } from './fieldModel';
import type { DataColumn } from '@/Function/shared/listTable/useListColumns';
import { MenuSectionLabel } from '@/Function/shared/menu';
import { Button, ButtonAppearanceProvider } from '@/ui/button';
import { MoreHorizontal } from '@/ui/icons';

/** The list header's field switches (its trailing button). Hiding never deletes data. */
export function FieldVisibility({ columns, isVisible, onToggle, onEdit }: {
  columns: DataColumn[];
  isVisible: (id: string) => boolean;
  onToggle: (id: string) => void;
  /** A custom field's settings, where it is renamed or deleted. */
  onEdit?: (column: DataColumn) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const labelOf = (c: DataColumn) => fieldDisplayLabel(t, c);
  const matching = columns.filter((c) => labelOf(c).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <ButtonAppearanceProvider appearance="navigation"><div className="space-y-2">
    <input aria-label={t('Find fields')} placeholder={t('Find fields…')} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-8 bg-transparent px-2 text-sm focus:bg-muted rounded-md" />
    {(['builtin', 'custom'] as const).map((kind) => {
      const fields = matching.filter((c) => c.kind === kind);
      if (!fields.length) return null;
      return <div key={kind}><MenuSectionLabel>{kind === 'builtin' ? t('Default fields') : t('Custom fields')}</MenuSectionLabel>
        {fields.map((c) => <div key={c.id} className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="md" className="min-w-0 flex-1 justify-between" role="switch" aria-checked={isVisible(c.id)} aria-label={t('Show {name}', { name: labelOf(c) })} disabled={!c.toggleable} onClick={() => onToggle(c.id)}>
            <span className="truncate">{labelOf(c)}</span>
            <span aria-hidden className={`w-8 h-4 rounded-full p-0.5 shrink-0 ${isVisible(c.id) ? 'bg-primary' : 'bg-muted-foreground'}`}><span className={`block size-3 rounded-full bg-background transition-transform ${isVisible(c.id) ? 'translate-x-4' : ''}`} /></span>
          </Button>
          {kind === 'custom' && onEdit && c.custom && <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" aria-label={t('Edit {name}', { name: labelOf(c) })} title={t('Edit field')} onClick={() => onEdit(c)}>
            <MoreHorizontal size={14} />
          </Button>}
        </div>)}
      </div>;
    })}
    {!matching.length && <p className="px-2 py-3 text-sm text-muted-foreground">{t('No fields found')}</p>}
  </div></ButtonAppearanceProvider>;
}
