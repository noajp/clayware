'use client';

import { useState } from 'react';
import { MoreHorizontal, Plus } from '@/ui/icons';
import { NavStrategyIcon, NavStrategyModeIcon } from '@/Frame/sidebar/NavIcons';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { DisclosureTriangle } from '@/Function/shared/DisclosureTriangle';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { SidebarFold } from '@/Function/shared/SidebarFold';
import { SidebarRow, SidebarRowAction } from '@/Function/shared/SidebarRow';
import { appDialog } from '@/Function/shared/appDialogStore';
import { formatError } from '@/Function/shared/formatError';
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { MenuShell, MENU_SEPARATOR } from '@/Function/shared/menu';
import { deleteVision, updateVision, useMyVisionRoles, useVisions } from '@/hooks/visionData';

/**
 * "Your Strategy ▾": the Space's Visions, as "Your Execution" lists its
 * Domains. A Vision's row opens its page; unfolded, its "Portfolio" row
 * opens the Portfolios it holds. Its owners and admins rename it from
 * "…"; its owners delete it (refused while it holds Portfolios).
 */
export function VisionList({ activeView, visionId, onOpenVision, onOpenPortfolios, onCreate }: {
  activeView: string;
  /** The Vision the open screen is in; null for the Space's first. */
  visionId: string | null;
  onOpenVision: (id: string) => void;
  onOpenPortfolios: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const { data: visions, loading } = useVisions();
  const roles = useMyVisionRoles();
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const current = visionId ?? visions[0]?.id ?? null;
  const toggle = (id: string) => setFolded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <SidebarFold id="strategy-visions" label={t('Your Strategy')}>
      {visions.map((v) => {
        const open = !folded.has(v.id);
        const role = roles.get(v.id);
        const mark = <ItemIcon icon={v.icon} fallback={<NavStrategyModeIcon size={16} />} />;
        return (
          <div key={v.id}>
            <SidebarRow active={activeView === 'vision' && current === v.id} icon={mark} label={v.name} title={v.name}
              onClick={() => onOpenVision(v.id)}
              actions={<>
                <SidebarRowAction label={t(open ? 'Collapse {name}' : 'Expand {name}', { name: v.name })} aria-expanded={open} onClick={() => toggle(v.id)}>
                  <DisclosureTriangle open={open} />
                </SidebarRowAction>
                {role === 'owner' || role === 'admin' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label={t('{name} settings', { name: v.name })} title={t('{name} settings', { name: v.name })}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                        <MoreHorizontal size={12} />
                      </button>
                    </DropdownMenuTrigger>
                    <MenuShell as="dropdown" align="start">
                      <DropdownMenuItem onSelect={async () => {
                        const name = (await appDialog.prompt(t('Vision name'), v.name))?.trim();
                        if (name && name !== v.name) updateVision(v.id, { name }).catch((e) => void appDialog.alert(formatError(e)));
                      }}>{t('Rename')}</DropdownMenuItem>
                      {role === 'owner' && <>
                        <div className={MENU_SEPARATOR} />
                        <DropdownMenuItem onSelect={async () => {
                          if (!await appDialog.confirm(t('Delete “{name}”? This can’t be undone.', { name: v.name }))) return;
                          deleteVision(v.id).catch(() => void appDialog.alert(t('A Vision that still holds Portfolios can’t be deleted. Move or delete them first.')));
                        }}>{t('Delete')}</DropdownMenuItem>
                      </>}
                    </MenuShell>
                  </DropdownMenu>
                ) : <span aria-hidden className="size-6 shrink-0" />}
              </>} />
            {open && (
              <div className="mt-0.5 pl-7">
                <SidebarRow active={activeView === 'strategy' && current === v.id} icon={<NavStrategyIcon size={16} />}
                  label={t('Portfolio')} onClick={() => onOpenPortfolios(v.id)} />
              </div>
            )}
          </div>
        );
      })}
      {!loading && visions.length === 0 && (
        <SidebarRow size="sm" icon={<Plus size={14} />} label={t('Add a Vision')} onClick={onCreate} />
      )}
    </SidebarFold>
  );
}
