'use client';

import { useMemo, useState } from 'react';
import { MoreHorizontal, Network, Plus, Users } from '@/ui/icons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { SidebarRow, SidebarRowAction, SidebarSectionLabel } from '@/Function/shared/SidebarRow';
import { DisclosureTriangle } from '@/Function/shared/DisclosureTriangle';
import { WorkerAvatar } from '@/Function/shared/WorkerAvatar';
import { appDialog } from '@/Function/shared/appDialogStore';
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { MenuShell, MENU_SEPARATOR } from '@/Function/shared/menu';
import { childUnits } from '@/Function/team/orgUnits';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { useSpaceRole } from '@/Function/space/data';
import { useOrgUnitActions, useOrgUnits, type OrgUnit } from '@/hooks/orgUnitData';
import { useTeamRoster } from '@/hooks/useTeamRoster';
import type { Worker } from '@/types/database';
import type { NavigationState } from '@/types/navigation';

/**
 * The Team place in the sidebar: the organisation as people report in it.
 * Everyone first, then the units, nested, each unfolding onto the units
 * inside it and its members, then whoever is in no unit. A unit is who
 * someone answers to; where they work is a Domain, under Execution. The
 * Space's owners make and arrange the units here.
 */
export function TeamList({ navigation, onOpen }: {
  /** The Team screen's focus, or undefined when Team is not the open screen. */
  navigation: Pick<NavigationState, 'workerId' | 'unitId'> | undefined;
  onOpen: (nav: Pick<NavigationState, 'workerId' | 'unitId'>) => void;
}) {
  const { t } = useI18n();
  const roster = useTeamRoster();
  const { units, members } = useOrgUnits();
  const canArrange = useSpaceRole(useActiveSpaceId()) === 'owner';
  const actions = useOrgUnitActions();
  const workerFocus = navigation ? navigation.workerId ?? null : undefined;
  const unitFocus = navigation ? navigation.unitId ?? null : undefined;

  const workers = useMemo(() => new Map<string, Worker>(roster.workers.map((w) => [w.id, w])), [roster.workers]);
  const byName = (ids: Iterable<string>) => [...new Set(ids)].filter((id) => workers.has(id))
    .sort((a, b) => workers.get(a)!.name.localeCompare(workers.get(b)!.name));
  const inAUnit = useMemo(() => new Set(members.map((m) => m.worker_id)), [members]);
  const unplaced = byName([...workers.keys()].filter((id) => !inAUnit.has(id)));

  const newUnit = async (parentId: string | null) => {
    const name = (await appDialog.prompt(t('Unit name')))?.trim();
    if (!name) return;
    actions.create.mutate({ name, parentId }, { onSuccess: (u) => onOpen({ unitId: u.id, workerId: null }) });
  };
  const person = (id: string, unitId: string | null) => (
    <SidebarRow key={`${unitId ?? 'none'}:${id}`} size="sm" active={workerFocus === id && unitFocus === unitId}
      icon={<WorkerAvatar worker={workers.get(id)!} size={16} />} label={workers.get(id)!.name}
      onClick={() => onOpen({ workerId: id, unitId })} />
  );

  return (
    <div className="mt-5 pb-4">
      <SidebarRow active={workerFocus === null && unitFocus === null} icon={<Users size={16} />} label={t('Everyone')}
        meta={workers.size || null} onClick={() => onOpen({ workerId: null, unitId: null })} />

      {(units.length > 0 || canArrange) && (
        <SidebarSectionLabel className="mt-5 justify-between pr-1">
          <span>{t('Units')}</span>
          {canArrange && (
            <SidebarRowAction label={t('New unit')} onClick={() => void newUnit(null)}><Plus size={13} /></SidebarRowAction>
          )}
        </SidebarSectionLabel>
      )}
      {childUnits(units, null).map((u) => (
        <UnitBranch key={u.id} unit={u} units={units} unitFocus={unitFocus} workerFocus={workerFocus} canArrange={canArrange}
          membersOf={(id) => byName(members.filter((m) => m.unit_id === id).map((m) => m.worker_id))}
          person={person} onOpen={(id) => onOpen({ unitId: id, workerId: null })} onNew={(id) => void newUnit(id)} />
      ))}
      {units.length === 0 && canArrange && (
        <SidebarRow size="sm" icon={<Plus size={14} />} label={t('Add a unit — a team, a department, a CoE')}
          onClick={() => void newUnit(null)} />
      )}

      {unplaced.length > 0 && <>
        <SidebarSectionLabel>{units.length > 0 ? t('Not in a unit') : t('People')}</SidebarSectionLabel>
        {unplaced.map((id) => person(id, null))}
      </>}
    </div>
  );
}

/** One unit: its row (opens its page; "…" arranges it; the triangle folds),
 *  then the units inside it and its own members. */
function UnitBranch({ unit, units, unitFocus, workerFocus, canArrange, membersOf, person, onOpen, onNew }: {
  unit: OrgUnit; units: OrgUnit[]; unitFocus: string | null | undefined; workerFocus: string | null | undefined; canArrange: boolean;
  membersOf: (unitId: string) => string[];
  person: (workerId: string, unitId: string | null) => React.ReactNode;
  onOpen: (unitId: string) => void; onNew: (parentId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const { update, remove } = useOrgUnitActions();
  const children = childUnits(units, unit.id);
  const ids = membersOf(unit.id);
  const hasInside = children.length > 0 || ids.length > 0;
  return (
    <div>
      <SidebarRow active={unitFocus === unit.id && workerFocus === null} icon={<Network size={16} />} label={unit.name} title={unit.name}
        meta={ids.length || null} onClick={() => onOpen(unit.id)}
        actions={<>
          {canArrange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={t('Unit actions')} title={t('Unit actions')}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"><MoreHorizontal size={14} /></button>
              </DropdownMenuTrigger>
              <MenuShell as="dropdown" align="start">
                <DropdownMenuItem onSelect={() => onNew(unit.id)}>{t('New unit inside')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={async () => {
                  const name = (await appDialog.prompt(t('Unit name'), unit.name))?.trim();
                  if (name && name !== unit.name) update.mutate({ id: unit.id, patch: { name } });
                }}>{t('Rename')}</DropdownMenuItem>
                <div className={MENU_SEPARATOR} />
                <DropdownMenuItem onSelect={async () => {
                  if (!await appDialog.confirm(t('Delete the unit “{name}”? Its members stay in the Space.', { name: unit.name }))) return;
                  remove.mutate(unit.id);
                }}>{t('Delete')}</DropdownMenuItem>
              </MenuShell>
            </DropdownMenu>
          )}
          {hasInside && (
            <SidebarRowAction label={t(open ? 'Collapse {name}' : 'Expand {name}', { name: unit.name })} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <DisclosureTriangle open={open} />
            </SidebarRowAction>
          )}
        </>} />
      {open && hasInside && (
        <div className="mt-0.5 pl-4">
          {children.map((c) => (
            <UnitBranch key={c.id} unit={c} units={units} unitFocus={unitFocus} workerFocus={workerFocus} canArrange={canArrange}
              membersOf={membersOf} person={person} onOpen={onOpen} onNew={onNew} />
          ))}
          {ids.map((id) => person(id, unit.id))}
        </div>
      )}
    </div>
  );
}
