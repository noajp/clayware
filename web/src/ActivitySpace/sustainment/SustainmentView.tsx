'use client';

import { useI18n } from '@/Function/i18n/I18nProvider';
import { MainIsland } from '@/Function/shared/MainIsland';
import { DetailPage, PAGE_TITLE, PAGE_TITLE_WEIGHT, PageIcon } from '@/Function/shared/PageHead';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { useSustainments } from '@/hooks/useSustainments';
import type { Sustainment } from '@/types/database';

// A Sustainment's page, opened from its button on the ModeRail: its icon and
// name, as every concept page starts, and what it holds. It holds no
// functions yet, and the page says only that.

/** No icon: the name's first letter, sized to the icon's box. */
function Initial({ sustainment, size }: { sustainment: Sustainment; size: number }) {
  return <span className="font-semibold leading-none" style={{ fontSize: Math.round(size * 0.8) }}>{Array.from(sustainment.name.trim())[0] ?? ''}</span>;
}

export function SustainmentView({ sustainmentId }: { sustainmentId: string | null }) {
  const { t } = useI18n();
  const { data: sustainments, loading, error } = useSustainments();
  const sustainment = sustainmentId ? sustainments.find((s) => s.id === sustainmentId) ?? null : null;

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

  return (
    <MainIsland crumbs={[{ id: sustainment.id, label: sustainment.name,
      icon: <ItemIcon icon={sustainment.icon} size={14} fallback={<Initial sustainment={sustainment} size={14} />} /> }]}>
      <div className="flex-1 overflow-auto">
        <DetailPage head={
          <div>
            <PageIcon><ItemIcon icon={sustainment.icon} size={20} fallback={<Initial sustainment={sustainment} size={20} />} /></PageIcon>
            <h1 className={PAGE_TITLE} style={PAGE_TITLE_WEIGHT}>{sustainment.name}</h1>
          </div>
        }>
          <p className="text-[14px] text-muted-foreground">{t('No functions in this Sustainment yet')}</p>
        </DetailPage>
      </div>
    </MainIsland>
  );
}
