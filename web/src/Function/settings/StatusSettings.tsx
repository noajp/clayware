'use client';

import { useState } from 'react';
import { MoreHorizontal, Plus } from '@/ui/icons';
import { Button } from '@/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { ItemIconButton } from '@/Function/shared/itemIcon/IconPicker';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { statusesByStage, stagesOf, type Status, type StatusScope } from '@/Function/shared/workStatus';
import { useStatusName } from '@/Function/shared/WorkStatusPicker';
import { ElementProgressMark } from '@/Function/shared/ElementProgressMark';
import type { ElementStatus } from '@/types/database';
import { createWorkStatus, deleteWorkStatus, saveWorkStatusLook, useElementStatusCounts, useWorkStatusCounts, useWorkStatuses } from '@/hooks/workStatuses';

// Settings › Statuses: the stages an Object or a Strategy (scope 'work') or
// an Element (scope 'element') goes through, each with its own status and the
// ones the Space added under it. A stage is fixed — lists, boards, reports
// and rules go by it — and what the Space sets is how each status reads: its
// name, its icon and colour, and which more there are. An Element's status
// without an icon of its own is drawn by its stage's designed mark.

export function StatusSettings({ scope }: { scope: StatusScope }) {
  const { t } = useI18n();
  const spaceId = useActiveSpaceId();
  const { rows, loading } = useWorkStatuses(spaceId);
  const counts = useWorkStatusCounts(scope === 'work' ? spaceId : null);
  const elementCounts = useElementStatusCounts(scope === 'element' ? spaceId : null);
  const nameOf = useStatusName();
  const [adding, setAdding] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!spaceId) return null;
  const run = (work: () => Promise<unknown>) => {
    setError(null);
    work().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const keyOf = (s: Status) => s.id ?? s.stage;
  const looks = stagesOf(scope);
  const lookOf = (s: Status) => ({ name: s.name, icon: s.icon, color: s.color });
  const save = (s: Status, patch: { name?: string; icon?: string | null; color?: string | null }) =>
    run(() => saveWorkStatusLook(spaceId, { rowId: s.rowId, scope, stage: s.stage }, lookOf(s), patch));

  const countText = (s: Status) => {
    if (scope === 'element') {
      const n = elementCounts[keyOf(s)] ?? 0;
      return n === 0 ? t('Not in use') : n === 1 ? t('1 Element') : t('{n} Elements', { n });
    }
    const c = counts[keyOf(s)];
    if (scope !== 'work' || !c || (c.objects === 0 && c.strategies === 0)) return t('Not in use');
    const parts: string[] = [];
    if (c.objects > 0) parts.push(c.objects === 1 ? t('1 Object') : t('{n} Objects', { n: c.objects }));
    if (c.strategies > 0) parts.push(c.strategies === 1 ? t('1 Strategy') : t('{n} Strategies', { n: c.strategies }));
    return parts.join(' · ');
  };

  return (
    <div className="space-y-2">
      <p className="-mt-2 pb-2 text-[12px] text-muted-foreground">
        {scope === 'element'
          ? t('Every Element stands in one of these stages. Rename a status, change its icon, or add your own under a stage.')
          : t('An Object and a Strategy each stand in one of these stages. Rename a status, change its icon, or add your own under a stage.')}
      </p>
      {error && <p role="alert" className="text-[12px] text-[var(--status-danger)]">{error}</p>}
      {loading ? <div className="text-[13px] text-muted-foreground">{t('Loading…')}</div> : statusesByStage(scope, rows).map((group) => {
        const stageLook = looks.find((l) => l.stage === group.stage);
        return (
          <section key={group.stage} aria-label={t(group.label)}>
            <div className="flex h-10 items-center rounded-lg bg-muted/60 pl-4 pr-2">
              <h3 className="flex-1 text-[13px] font-normal text-muted-foreground">{t(group.label)}</h3>
              <Button variant="ghost" size="icon-xs" aria-label={t('Add a status to {stage}', { stage: t(group.label) })}
                onClick={() => { setAdding(group.stage); setDraft(''); }}>
                <Plus size={14} />
              </Button>
            </div>
            <div className="px-1 py-1">
              {group.statuses.map((status) => (
                <div key={keyOf(status)} className="group flex h-14 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/50">
                    <ItemIconButton size={16} label={t('Change icon')}
                      value={{ icon: status.icon, color: status.color }}
                      onChange={(next) => save(status, { icon: next.icon, color: next.color })}
                      defaultIcon={scope === 'element'
                        ? <ElementProgressMark status={group.stage as ElementStatus} progress={group.stage === 'in_progress' ? 50 : 0} size={16} />
                        : <ItemIcon icon={stageLook?.icon} color={stageLook?.color} size={16} />} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {renaming === keyOf(status) ? (
                      <input autoFocus defaultValue={nameOf(status)} aria-label={t('Status name')} maxLength={60}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || e.key === 'Escape') e.currentTarget.blur();
                        }}
                        onBlur={(e) => {
                          setRenaming(null);
                          const name = e.currentTarget.value.trim();
                          if (name && name !== nameOf(status)) save(status, { name });
                        }}
                        className="h-7 w-full rounded-md bg-muted/50 px-2 text-[14px] text-foreground" />
                    ) : (
                      <button type="button" onClick={() => setRenaming(keyOf(status))}
                        className="block max-w-full truncate text-left text-[14px] text-foreground">{nameOf(status)}</button>
                    )}
                    <p className="truncate text-[12px] text-muted-foreground">{countText(status)}</p>
                  </div>
                  {/* A status of the Space's own can go; a stage's own can only
                      go back to how it comes. */}
                  {status.rowId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" aria-label={t('Status actions')}
                          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100">
                          <MoreHorizontal size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[180px]">
                        <DropdownMenuItem className="text-[13px]" onSelect={() => setRenaming(keyOf(status))}>{t('Rename')}</DropdownMenuItem>
                        <DropdownMenuItem className={`text-[13px] ${status.builtin ? '' : 'text-[var(--status-danger)]'}`}
                          onSelect={() => run(() => deleteWorkStatus(spaceId, status.rowId!))}>
                          {status.builtin ? t('Reset to default') : t('Delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
              {adding === group.stage && (
                <div className="flex h-12 items-center">
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60}
                    placeholder={t('New status…')} aria-label={t('New status…')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); }
                      else if (e.key === 'Escape') { setDraft(''); setAdding(null); }
                    }}
                    onBlur={() => {
                      const name = draft.trim();
                      setAdding(null); setDraft('');
                      if (name) run(() => createWorkStatus(spaceId, scope, group.stage, name));
                    }}
                    className="h-8 w-full rounded-md bg-muted/50 px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/60" />
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
