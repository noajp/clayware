'use client';

import { useState } from 'react';
import { Button } from '@/ui/button';
import { HoverGroup, ListItem } from '@/ui/list-item';
import { Box, Plus } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { MainIsland } from '@/Function/shared/MainIsland';
import { DetailPage, PageHead, PageSection } from '@/Function/shared/PageHead';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { readDefinition } from '@/Function/sustainment/definition';
import { useSustainmentFunctions } from '@/hooks/useSustainmentFunctions';
import { useSustainments } from '@/hooks/useSustainments';
import type { Sustainment } from '@/types/database';
import { AddFunctionDialog } from './AddFunctionDialog';
import { FunctionPage, FunctionStatusMark } from './FunctionPage';

// A Sustainment's screen, opened from its button on the ModeRail. Its own
// page says what it is for and lists its functions (billing, expenses …),
// each a draft or published; a function opens on its own page, where its
// definition is read and edited.

/** No icon: the name's first letter, sized to the icon's box. */
function Initial({ sustainment, size }: { sustainment: Sustainment; size: number }) {
  return <span className="font-semibold leading-none" style={{ fontSize: Math.round(size * 0.8) }}>{Array.from(sustainment.name.trim())[0] ?? ''}</span>;
}

export function SustainmentView({ sustainmentId, functionId, onOpenFunction }: {
  sustainmentId: string | null;
  /** The function shown, or null for the Sustainment's own page. */
  functionId: string | null;
  onOpenFunction: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const { data: sustainments, loading, error, updateSustainment } = useSustainments();
  const sustainment = sustainmentId ? sustainments.find((s) => s.id === sustainmentId) ?? null : null;
  const functions = useSustainmentFunctions(sustainment?.id ?? null);
  const [adding, setAdding] = useState(false);

  if (!sustainment) {
    if (loading) return null;
    return (
      <MainIsland crumbs={[{ id: 'sustainment', label: t('Sustainment') }]}>
        <p className="px-8 py-8 text-[14px] text-muted-foreground">
          {error
            ? t('Could not load this Sustainment. Try again.')
            : t('This Sustainment was not found. It may have been deleted, or it belongs to another Space.')}
        </p>
      </MainIsland>
    );
  }

  const fn = functionId ? functions.data.find((f) => f.id === functionId) ?? null : null;
  const icon = (size: number) => <ItemIcon icon={sustainment.icon} size={size} fallback={<Initial sustainment={sustainment} size={size} />} />;
  const home = { id: sustainment.id, label: sustainment.name, icon: icon(14) };

  if (fn) {
    return (
      <MainIsland crumbs={[
        { ...home, onClick: () => onOpenFunction(null) },
        { id: fn.id, label: fn.name, icon: <ItemIcon icon={fn.icon} size={14} fallback={<Box size={14} />} /> },
      ]}>
        <div className="flex-1 overflow-auto">
          <FunctionPage key={fn.id} fn={fn}
            onUpdate={(patch) => functions.updateFunction({ id: fn.id, patch })}
            onRemove={async () => { await functions.removeFunction(fn.id); onOpenFunction(null); }} />
        </div>
      </MainIsland>
    );
  }

  const addButton = (
    <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}>
      <Plus size={14} />{t('Add function')}
    </Button>
  );

  return (
    <MainIsland crumbs={[home]}>
      <div className="flex-1 overflow-auto">
        <DetailPage head={
          <PageHead icon={icon(20)} title={sustainment.name} description={sustainment.description ?? ''} canEdit
            titleLabel={t('Sustainment name')} titlePlaceholder={t('Sustainment name')}
            descriptionLabel={t('What it is for')}
            descriptionPlaceholder={t('What this Sustainment keeps right for the company')}
            onSaveTitle={(name) => updateSustainment({ id: sustainment.id, patch: { name } })}
            onSaveDescription={(description) => updateSustainment({ id: sustainment.id, patch: { description: description || null } })} />
        }>
          <PageSection title={t('Functions')} action={functions.data.length > 0 ? addButton : undefined}>
            {functions.error ? (
              <p role="alert" className="text-[13px] text-[var(--status-danger)]">{t('Could not load the functions. Try again.')}</p>
            ) : functions.loading ? null : functions.data.length === 0 ? (
              <div className="flex flex-col items-start gap-3 py-1">
                <p className="max-w-[52ch] text-[13px] leading-[20px] text-muted-foreground">
                  {t('A function is one job this Sustainment does, such as invoicing or expenses. Start from a template and change what differs for your company.')}
                </p>
                <Button type="button" variant="primary" size="sm" onClick={() => setAdding(true)}>
                  <Plus size={14} />{t('Add function')}
                </Button>
              </div>
            ) : (
              <HoverGroup className="-mx-2">
                {functions.data.map((f) => (
                  <ListItem key={f.id} onClick={() => onOpenFunction(f.id)} className="py-1.5"
                    leading={<ItemIcon icon={f.icon} size={16} fallback={<Box size={16} />} />}
                    title={f.name} description={readDefinition(f.definition).intent || undefined}
                    trailing={
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <FunctionStatusMark status={f.status} />{f.status === 'published' ? t('Published') : t('Draft')}
                      </span>
                    } />
                ))}
              </HoverGroup>
            )}
          </PageSection>
        </DetailPage>
      </div>
      {adding && <AddFunctionDialog
        existingKeys={new Set(functions.data.map((f) => f.template_key).filter((k): k is string => !!k))}
        onClose={() => setAdding(false)} onCreate={functions.createFunction}
        onCreated={(row) => { setAdding(false); onOpenFunction(row.id); }} />}
    </MainIsland>
  );
}
