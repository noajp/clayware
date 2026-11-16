'use client';

import { ElementProgressMark } from '@/Function/shared/ElementProgressMark';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import type { Status } from '@/Function/shared/workStatus';
import { useI18n } from '@/Function/i18n/I18nProvider';
import type { ElementStatus } from '@/types/database';

// A status as a mark — the same for an Element, an Object and a Strategy. A
// status with an icon the Space chose shows that icon in its colour; every
// other — a stage's own, or one the Space added and left without an icon —
// is drawn by its stage's designed mark, with the progress pie for In
// Progress.

export function StatusLook({ status, progress = 0, size = 16 }: { status: Status; progress?: number; size?: number }) {
  if (status.icon) return <ItemIcon icon={status.icon} color={status.color} size={size} />;
  return <ElementProgressMark status={status.stage as ElementStatus} progress={progress} size={size} />;
}

/** A status's name: the stage's built-in label in the viewer's language, or
 *  the name the Space gave it. */
export function useStatusName(): (status: Status) => string {
  const { t } = useI18n();
  return (status) => (status.nameIsLabel ? t(status.name) : status.name);
}
