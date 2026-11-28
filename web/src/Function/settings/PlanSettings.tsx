'use client';

import { Minus } from '@/ui/icons';
import { Button } from '@/ui/button';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { useActiveSpaceId } from '@/Function/space/activeSpaceStore';
import { PLAN_TERMS, SPACE_PLANS, type SpacePlan } from '@/Function/space/spacePlan';
import { useSpacePlan } from '@/hooks/spacePlanData';
import { SETTINGS_ISLAND } from '@/shared/designTokens';
import { SettingsIsland } from './SettingsControls';

// Settings › Plans: the Space's plan, what it costs at its size, and the
// three plans side by side. Online payment is not connected: a change of plan
// is asked for by email and made by Clayware — the button says so.

const CONTACT = 'mailto:hello@clayware.app?subject=Clayware%20plan';
const PLAN_NAME: Record<SpacePlan, string> = { free: 'Free', team: 'Team', enterprise: 'Enterprise' };

export function PlanSettings() {
  const { t, locale } = useI18n();
  const spaceId = useActiveSpaceId();
  const { plan, domainCount, memberCount, loading } = useSpacePlan(spaceId);
  const yen = new Intl.NumberFormat(locale, { style: 'currency', currency: 'JPY' });

  const summary = (p: SpacePlan): string => {
    if (p === 'free') return t('{n} of 2 Domains used', { n: domainCount });
    if (p === 'team') return t('{total} a month for {n} members', { n: memberCount, total: yen.format(500 * memberCount) });
    return t('One fixed price');
  };
  const price = (p: SpacePlan) => (PLAN_TERMS[p].yenPerMember === null ? t('Fixed price') : yen.format(PLAN_TERMS[p].yenPerMember ?? 0));
  const unit = (p: SpacePlan) => (p === 'team' ? t('per member a month') : null);
  const rows: { label: string; cells: Record<SpacePlan, string | false> }[] = [
    { label: t('Domains'), cells: { free: '2', team: t('Unlimited'), enterprise: t('Unlimited') } },
    { label: t('Athenya (AI)'), cells: { free: false, team: t('Billed by use'), enterprise: t('In the contract') } },
  ];

  return (
    <div className="space-y-8">
      <SettingsIsland>
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[13px] text-muted-foreground">{t('Current plan')}</div>
            <div className="mt-0.5 text-[18px] font-semibold leading-[26px] text-foreground">
              {loading ? '…' : plan ? PLAN_NAME[plan] : t('Unknown')}
            </div>
            {plan && <div className="mt-1 text-[12px] text-muted-foreground">{summary(plan)}</div>}
          </div>
          <Button asChild variant="secondary" size="md">
            <a href={CONTACT}>{t('Email us to change plan')}</a>
          </Button>
        </div>
      </SettingsIsland>

      <section aria-labelledby="plan-compare">
        <h2 id="plan-compare" className="sr-only">{t('All plans')}</h2>
        {/* A table where the page is wide enough for four columns; one plan
            under another where it is not. */}
        <div className={`${SETTINGS_ISLAND} @container`}>
          <table className="hidden w-full table-fixed border-collapse text-left @[34rem]:table">
            <caption className="sr-only">{t('All plans')}</caption>
            <colgroup>
              <col className="w-[28%]" />
              {SPACE_PLANS.map((p) => <col key={p} />)}
            </colgroup>
            <thead>
              <tr className="align-top">
                <td className="px-5 py-4" />
                {SPACE_PLANS.map((p) => (
                  <th key={p} scope="col" className={`px-4 py-4 font-normal ${p === plan ? 'bg-foreground/[0.04]' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-foreground">{PLAN_NAME[p]}</span>
                      {p === plan && <span className="sr-only">{t('Current plan')}</span>}
                    </div>
                    <div className="mt-2 text-[20px] font-semibold leading-[28px] text-foreground">{price(p)}</div>
                    <div className="mt-0.5 min-h-[18px] text-[12px] text-muted-foreground">{unit(p)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
              {rows.map((r) => <Row key={r.label} label={r.label} plan={plan} cells={r.cells} />)}
            </tbody>
          </table>
          <ul className="divide-y divide-[var(--border-subtle)] @[34rem]:hidden">
            {SPACE_PLANS.map((p) => (
              <li key={p} className={`px-5 py-4 ${p === plan ? 'bg-foreground/[0.04]' : ''}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold text-foreground">
                    {PLAN_NAME[p]}
                    {p === plan && <span className="sr-only"> ({t('Current plan')})</span>}
                  </span>
                  <span className="text-right">
                    <span className="text-[15px] font-semibold text-foreground">{price(p)}</span>
                    {unit(p) && <span className="ml-1 text-[12px] text-muted-foreground">{unit(p)}</span>}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                  {rows.map((r) => (
                    <div key={r.label} className="contents">
                      <dt className="text-muted-foreground">{r.label}</dt>
                      <dd className="text-foreground"><Cell value={r.cells[p]} /></dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {t('Unlimited members on every plan.')}
        </p>
      </section>
    </div>
  );
}

function Cell({ value }: { value: string | false }) {
  const { t } = useI18n();
  if (value !== false) return <>{value}</>;
  return <><Minus size={14} aria-hidden className="inline-block align-middle text-muted-foreground/60" /><span className="sr-only">{t('Not included')}</span></>;
}

function Row({ label, cells, plan }: { label: string; cells: Record<SpacePlan, string | false>; plan: SpacePlan | null }) {
  return (
    <tr>
      <th scope="row" className="px-5 py-3 text-[13px] font-normal text-muted-foreground">{label}</th>
      {SPACE_PLANS.map((p) => (
        <td key={p} className={`px-4 py-3 text-[13px] text-foreground ${p === plan ? 'bg-foreground/[0.04]' : ''}`}>
          <Cell value={cells[p]} />
        </td>
      ))}
    </tr>
  );
}
