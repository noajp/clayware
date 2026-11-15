'use client';

import type { ReactNode } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, MenuCheck } from '@/ui/dropdown-menu';
import { MenuSectionLabel } from '@/Function/shared/menu';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { statusOf, statusesByStage, type Status, type StatusRow, type StatusScope } from '@/Function/shared/workStatus';

/** A status's mark: its icon in its colour. */
export function WorkStatusMark({ status, size = 14 }: { status: Status; size?: number }) {
  return <ItemIcon icon={status.icon} color={status.color} size={size} />;
}

/** A status's name: the stage's built-in label in the viewer's language, or
 *  the name the Space gave it. */
export function useStatusName(): (status: Status) => string {
  const { t } = useI18n();
  return (status) => (status.nameIsLabel ? t(status.name) : status.name);
}

/**
 * Picks the status an Object or a Strategy stands in: every stage with its
 * own status, and the ones the Space added under it. `onChange` gets the
 * stage and the status within it (null for the stage's own).
 */
export function WorkStatusPicker({ scope, rows, stage, statusId, onChange, children }: {
  scope: StatusScope;
  rows: readonly StatusRow[];
  stage: string | null | undefined;
  statusId: string | null | undefined;
  onChange: (next: { stage: string; statusId: string | null }) => void;
  /** The trigger: what the row shows for the current status. */
  children: ReactNode;
}) {
  const nameOf = useStatusName();
  const current = statusOf(scope, rows, stage, statusId);
  const groups = statusesByStage(scope, rows);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {groups.map((group) => (
          <div key={group.stage}>
            {/* A stage with statuses of the Space's own is headed by its name. */}
            {group.statuses.length > 1 && <MenuSectionLabel>{nameOf({ ...group.statuses[0], name: group.label, nameIsLabel: true })}</MenuSectionLabel>}
            {group.statuses.map((status) => (
              <DropdownMenuItem key={status.id ?? status.stage} className="gap-2"
                onSelect={() => onChange({ stage: status.stage, statusId: status.id })}>
                <WorkStatusMark status={status} />
                <span className="flex-1 truncate">{nameOf(status)}</span>
                {current.stage === status.stage && current.id === status.id && <MenuCheck />}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
