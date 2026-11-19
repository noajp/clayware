'use client';

import { Button } from '@/ui/button';
import { useI18n } from '@/Function/i18n/I18nProvider';

// A page's views as a quiet strip of tabs under its header — the same strip
// as a Domain's or an Object's (TabBar), for pages whose tabs are fixed: no
// reordering, adding or closing.

export function ViewTabs<T extends string>({ tabs, active, onSelect, label, actions }: {
  tabs: readonly { id: T; label: string; icon?: React.ComponentType<{ size?: number }> }[];
  active: T;
  onSelect: (id: T) => void;
  /** What the tabs choose between, for assistive tech. */
  label: string;
  /** Page chrome that belongs on the tabs' own line, at its right end. */
  actions?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div role="tablist" aria-label={label} className="flex shrink-0 items-center gap-1 border-b border-[var(--gloss-rim)] bg-transparent py-1.5 pl-6 pr-4">
      {tabs.map((v) => {
        const Icon = v.icon;
        const isActive = active === v.id;
        return (
          <Button key={v.id} type="button" shape="tab" role="tab" aria-selected={isActive}
            variant={isActive ? 'secondary' : 'ghost'} onClick={() => onSelect(v.id)}>
            {Icon && <span className={isActive ? 'text-foreground' : 'text-muted-foreground'}><Icon size={13} /></span>}
            {t(v.label)}
          </Button>
        );
      })}
      {actions && <div className="ml-auto flex items-center">{actions}</div>}
    </div>
  );
}
