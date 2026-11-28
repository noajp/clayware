'use client';

import { Box } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { SidebarRow, SidebarSectionLabel } from '@/Function/shared/SidebarRow';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { useSustainmentFunctions } from '@/hooks/useSustainmentFunctions';
import { useSustainments } from '@/hooks/useSustainments';

/**
 * The sidebar while a Sustainment is open: the Sustainment itself, then its
 * functions. A draft says so at the end of its row; functions are added on
 * the Sustainment's page.
 */
export function SustainmentList({ sustainmentId, functionId, onOpen }: {
  sustainmentId: string | null;
  /** The open function, or null on the Sustainment's own page. */
  functionId: string | null;
  onOpen: (functionId: string | null) => void;
}) {
  const { t } = useI18n();
  const { data: sustainments } = useSustainments();
  const sustainment = sustainments.find((s) => s.id === sustainmentId) ?? null;
  const { data: functions } = useSustainmentFunctions(sustainment?.id ?? null);
  if (!sustainment) return null;
  const initial = Array.from(sustainment.name.trim())[0] ?? '';
  return (
    <>
      <div className="mt-5" />
      <SidebarRow active={functionId === null} label={sustainment.name} onClick={() => onOpen(null)}
        icon={<ItemIcon icon={sustainment.icon} size={16}
          fallback={<span className="text-[12px] font-semibold leading-none">{initial}</span>} />} />
      <SidebarSectionLabel>{t('Functions')}</SidebarSectionLabel>
      {functions.length === 0
        ? <p className="px-2.5 text-[12px] leading-[18px] text-muted-foreground/80">{t('No functions yet')}</p>
        : functions.map((f) => (
          <SidebarRow key={f.id} size="sm" active={functionId === f.id} label={f.name} onClick={() => onOpen(f.id)}
            icon={<ItemIcon icon={f.icon} size={16} fallback={<Box size={16} />} />}
            meta={f.status === 'draft' ? t('Draft') : undefined} />
        ))}
    </>
  );
}
