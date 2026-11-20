'use client';

import type { ComponentProps, ReactNode } from 'react';
import { DisclosureTriangle } from '@/Function/shared/DisclosureTriangle';
import { MoreHorizontal } from '@/ui/icons';
import { VIEW_REGISTRY } from '@/Frame/viewRegistry';
import { SidebarRow, SidebarRowAction } from '@/Function/shared/SidebarRow';
import { useI18n } from '@/Function/i18n/I18nProvider';

export function DomainNavigationRow({ name, mark, active, expanded, activeView, onOpen, onToggle, onSelect, onSettings, dragProps }: {
  name: string; mark: ReactNode; active: boolean; expanded: boolean; activeView: string;
  onOpen: () => void; onToggle: () => void; onSelect: (view: string) => void;
  onSettings?: () => void; dragProps?: ComponentProps<'button'>;
}) {
  const { t } = useI18n();
  return <div>
    <SidebarRow active={active && activeView === 'domain-overview'} icon={mark} label={name} title={name}
      onClick={onOpen} buttonProps={dragProps}
      actions={<>
        <SidebarRowAction label={t(expanded ? 'Collapse {name}' : 'Expand {name}', { name })} aria-expanded={expanded} onClick={onToggle}>
          <DisclosureTriangle open={expanded} />
        </SidebarRowAction>
        {onSettings
          ? <SidebarRowAction label={`${name} settings`} onClick={onSettings}
              className="opacity-0 transition-opacity group-hover/srow:opacity-100 focus-visible:opacity-100">
              <MoreHorizontal size={13} />
            </SidebarRowAction>
          : <span aria-hidden className="size-6 shrink-0" />}
      </>} />
    {expanded && <div className="ml-[15px] mt-0.5 space-y-0.5 border-l border-[var(--border-subtle)] pl-2.5">
      {(['objects', 'domain-elements'] as const).map(id => {
        const { icon: Icon, label } = VIEW_REGISTRY[id];
        return <SidebarRow key={id} size="sm" active={active && activeView === id} icon={Icon && <Icon size={15} />} label={t(label)} onClick={() => onSelect(id)} />;
      })}
    </div>}
  </div>;
}
