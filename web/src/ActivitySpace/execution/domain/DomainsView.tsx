'use client';

import React, { useState, useEffect } from 'react';
import { useDomains } from '@/hooks/useSupabase';
import { getActiveDomainId, setActiveDomainId } from '@/Function/space/domainsStore';
import { ChevronRight } from '@/ui/icons';
import { DomainIcon } from '@/Function/shared/conceptIcons';
import { ItemIcon } from '@/Function/shared/itemIcon/ItemIcon';
import { PageHeader } from '@/Function/shared/PageHeader';
import { EmptyState } from '@/Function/shared/EmptyState';
import { useI18n } from '@/Function/i18n/I18nProvider';

export function DomainsView({
  onOpen,
}: {
  onOpen: (domainId: string) => void;
}) {
  const { t } = useI18n();
  const { data: domains, loading } = useDomains();
  const [activeId, setActiveId] = useState<string>(() => getActiveDomainId() ?? '');

  useEffect(() => {
    const saved = getActiveDomainId();
    if (saved && domains.some((d) => d.id === saved)) setActiveId(saved);
    else if (domains[0]) { setActiveId(domains[0].id); setActiveDomainId(domains[0].id); }
  }, [domains]);

  const activeDomain = domains.find((d) => d.id === activeId) ?? domains[0];

  const drillIn = (domainId: string) => {
    setActiveDomainId(domainId);
    setActiveId(domainId);
    onOpen(domainId);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <PageHeader
        icon={<DomainIcon size={15} />}
        title={t('Domains')}
        count={domains.length || undefined}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <p className="text-[13px] text-muted-foreground">
            {t('Top-level containers for organizations, operations, or workspaces. Objects multi-home across Domains.')}
          </p>

          {!loading && domains.length === 0 ? (
            <div className="mt-8">
              <EmptyState
                art="domain"
                title={t('No Domains yet')}
                description={t('Create a Domain from the sidebar to organize Objects and Elements.')}
              />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              {domains.map((d) => {
                const isActive = d.id === activeDomain?.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => drillIn(d.id)}
                    className="group rounded-lg border border-[var(--border-subtle)] bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--surface-muted)]/40"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-[8px] border ${
                          d.color && !d.icon
                            ? 'border-transparent text-white'
                            : 'border-[var(--border-subtle)] bg-[var(--surface-muted)] text-foreground/85'
                        }`}
                        style={d.color && !d.icon ? { backgroundColor: d.color } : undefined}
                      >
                        <ItemIcon
                          icon={d.icon ?? null}
                          color={d.color ?? null}
                          size={18}
                          fallback={<DomainIcon size={18} />}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-[14px] font-medium tracking-tight text-foreground">{d.name}</h3>
                          {isActive && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-[4px] bg-[var(--status-success-subtle)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--status-success)]">
                              <span className="size-1.5 rounded-full bg-[var(--status-success)]" />
                              {t('Active')}
                            </span>
                          )}
                        </div>
                        {d.identifier && (
                          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground/70">{d.identifier}</p>
                        )}
                      </div>
                      <ChevronRight size={14} className="shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
