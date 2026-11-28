'use client';

import { useMemo, useState } from 'react';
import { PageSection } from '@/Function/shared/PageHead';
import { Button } from '@/ui/button';
import { useI18n } from '@/Function/i18n/I18nProvider';
import { formatRelative } from '@/Function/shared/dateUtils';
import { ElementIcon, ObjectIcon } from '@/Function/shared/conceptIcons';
import { ElementProgressMark, getElementProgress } from '@/Function/shared/ElementProgressMark';
import { requestElementDetail } from '@/Function/shared/element/elementDetailRequest';
import { useStrategyGapCheck, type GapFinding, type GapFindingKind } from '@/hooks/strategyGapData';
import type { ClaywareObjectWithChildren, ElementWithDetails } from '@/hooks/useSupabase';
import type { Intent } from '@/types/database';
import { useInitiativeIntentContext } from './InitiativeIntent';
import { buildGapReport, isCheckStale, standingOf, type BrokenCause } from './gapModel';
import { StrategyRangeMap, type RangeElement, type RangeObject } from './StrategyRangeMap';

// The Gap section at the top of a Strategy's Evaluation tab: where the work
// under the Strategy has drifted from what the Strategy says.
//
// Two readings, kept apart so a person always knows which is which:
//   - the links (gapModel) — always shown, no AI: work standing on a reversed
//     decision or a rejected hypothesis, conditions nobody is working on, and
//     work with no reason written;
//   - Athena's reading (strategy-gap) — only when a person asks; a record
//     with its time, marked stale once the Strategy has changed since.
// "Found nothing" and "could not check" never look the same.

const KIND_ORDER: GapFindingKind[] = ['off_course', 'obsolete', 'unclear'];
const KIND_LABEL: Record<GapFindingKind, string> = {
  off_course: 'Going against the Strategy',
  obsolete: 'May no longer be needed',
  unclear: 'Purpose unclear',
};
const CAUSE_LABEL: Record<BrokenCause, string> = {
  reversed: 'Decision reversed',
  rejected: 'Hypothesis rejected',
};
const KIND_WORD: Record<string, string> = { decision: 'Decided', measure: 'Success condition', assumption: 'Hypothesis' };

/** How many unanchored Elements show before the rest fold. */
const UNANCHORED_SHOWN = 5;

export function StrategyGapPanel({ strategyId, strategyName, strategyUpdatedAt, objects, ownObjectIds, via, onOpenObject }: {
  strategyId: string;
  strategyName: string;
  strategyUpdatedAt: string | null;
  /** The Objects the Strategy reaches, its descendants' included, with their Elements. */
  objects: ClaywareObjectWithChildren[];
  ownObjectIds: readonly string[];
  /** For an Object held by a Strategy under this one: that Strategy. */
  via: ReadonlyMap<string, { id: string; name: string }>;
  onOpenObject?: (objectId: string, domainId: string | null) => void;
}) {
  const { t } = useI18n();
  const intent = useInitiativeIntentContext();
  const { check, loading, error, run, running, runError } = useStrategyGapCheck(strategyId);
  const [showAllUnanchored, setShowAllUnanchored] = useState(false);

  const intents = useMemo<Intent[]>(() => intent?.data?.subs ?? [], [intent?.data]);
  const elements = useMemo(() => {
    const seen = new Map<string, ElementWithDetails>();
    for (const o of objects) for (const e of o.elements ?? []) if (!seen.has(e.id)) seen.set(e.id, e);
    return [...seen.values()];
  }, [objects]);
  const ownElementIds = useMemo(() => {
    const own = new Set(ownObjectIds);
    return new Set(objects.filter((o) => own.has(o.id)).flatMap((o) => (o.elements ?? []).map((e) => e.id)));
  }, [objects, ownObjectIds]);
  const report = useMemo(() => buildGapReport({
    intents, bindings: intent?.data?.bindings ?? [], elements, ownElementIds,
  }), [intents, intent?.data, elements, ownElementIds]);

  const objectOf = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const elementById = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);
  const openElement = (id: string) => {
    const el = elementById.get(id);
    const obj = el?.object_id ? objectOf.get(el.object_id) : undefined;
    requestElementDetail(id);
    if (obj) onOpenObject?.(obj.id, obj.domain_id ?? null);
  };
  const openObject = (id: string) => {
    const obj = objectOf.get(id);
    if (obj) onOpenObject?.(obj.id, obj.domain_id ?? null);
  };

  // The range map: each open Element's standing, each Object's, and the
  // Strategies under this one that hold them.
  const map = useMemo(() => {
    const aiKinds = new Map<string, GapFindingKind>();
    const objectOut = new Set<string>();
    for (const f of check?.findings ?? []) {
      if (f.target_type === 'element') aiKinds.set(f.target_id, f.kind);
      if (f.target_type === 'object' && f.kind !== 'unclear') objectOut.add(f.target_id);
    }
    const subs = new Map<string, { id: string; label: string }>();
    const mapObjects: RangeObject[] = objects.map((o) => {
      const holder = via.get(o.id);
      if (holder && !subs.has(holder.id)) subs.set(holder.id, { id: holder.id, label: holder.name });
      return { id: o.id, label: o.name, holderId: holder?.id ?? null, standing: objectOut.has(o.id) ? 'out' : 'in' };
    });
    const homes = new Set(objects.map((o) => o.id));
    const mapElements: RangeElement[] = elements
      .filter((e) => e.status !== 'done' && e.status !== 'cancelled')
      .map((e) => ({
        id: e.id,
        label: e.display_id ? `${e.display_id} ${e.title}` : e.title,
        objectId: e.object_id && homes.has(e.object_id) ? e.object_id : (objects.find((o) => (o.elements ?? []).some((x) => x.id === e.id))?.id ?? null),
        standing: standingOf(e.id, report, aiKinds),
        createdAt: e.created_at ?? null,
        updatedAt: e.updated_at ?? null,
      }));
    return { strategies: [...subs.values()], objects: mapObjects, elements: mapElements };
  }, [check, objects, via, elements, report]);

  const stale = check ? isCheckStale(check.created_at, strategyUpdatedAt, intents) : false;
  const linksClear = report.broken.length === 0 && report.unserved.length === 0 && report.unanchored.length === 0;
  const unanchoredShown = showAllUnanchored ? report.unanchored : report.unanchored.slice(0, UNANCHORED_SHOWN);

  return (
    <PageSection title={t('Gap')} action={
      <Button variant="secondary" size="sm" onClick={() => void run()} disabled={running}>
        {running ? t('Checking…') : check ? t('Check again with Athenya') : t('Check with Athenya')}
      </Button>
    }>
      <p className="mb-3 text-[12px] text-muted-foreground">
        {t('Where the work under this Strategy no longer matches what it says.')}
      </p>

      <div className="mb-4">
        <StrategyRangeMap name={strategyName} strategies={map.strategies} objects={map.objects} elements={map.elements}
          unserved={report.unserved.length} onOpenElement={openElement} onOpenObject={openObject} />
      </div>

      {/* Athena's reading — a record of one moment, shown as such. */}
      <div className="rounded-lg border border-border/60">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/50 px-3 py-2 text-[12px]">
          <span className="font-medium text-foreground">Athenya</span>
          {check && (
            <span className="text-muted-foreground">
              {t('Checked {when} · read {n} open Elements', { when: formatRelative(check.created_at), n: check.scope?.elements ?? 0 })}
              {(check.scope?.skipped ?? 0) > 0 && ` · ${t('{n} older ones not read', { n: check.scope.skipped! })}`}
            </span>
          )}
          {stale && (
            <span className="rounded-full bg-[var(--element-status-review)]/20 px-2 py-px text-[11px] text-[var(--element-status-review-text)]">
              {t('The Strategy changed after this check')}
            </span>
          )}
        </div>
        <div className="px-3 py-2.5">
          {running ? (
            <p className="text-[13px] text-muted-foreground" role="status">{t('Athenya is reading the Strategy and the work under it. This takes up to a minute.')}</p>
          ) : runError ? (
            <p className="text-[13px] text-[var(--status-danger-text)]" role="alert">{t('Could not check: {reason}', { reason: runError })}</p>
          ) : loading ? (
            <p className="text-[13px] text-muted-foreground">{t('Loading…')}</p>
          ) : error ? (
            <p className="text-[13px] text-[var(--status-danger-text)]" role="alert">{t('Could not load the last check: {reason}', { reason: error.message })}</p>
          ) : !check ? (
            <p className="text-[13px] text-muted-foreground">{t('Not checked yet. Athenya reads the Strategy, the Strategies and Objects under it and their open Elements, and lists the work that has drifted.')}</p>
          ) : (
            <div className="space-y-3">
              {check.summary && <p className="text-[13px] text-foreground">{check.summary}</p>}
              {check.findings.length === 0 && check.uncovered.length === 0 && (
                <p className="text-[13px] text-muted-foreground">{t('Athenya found no work that has drifted.')}</p>
              )}
              {KIND_ORDER.map((kind) => {
                const rows = check.findings.filter((f) => f.kind === kind);
                if (rows.length === 0) return null;
                return (
                  <GapGroup key={kind} title={t(KIND_LABEL[kind])} count={rows.length} danger={kind === 'off_course'}>
                    {rows.map((f) => (
                      <FindingRow key={`${f.target_type}:${f.target_id}`} finding={f}
                        element={f.target_type === 'element' ? elementById.get(f.target_id) : undefined}
                        onOpen={f.target_type === 'element' ? () => openElement(f.target_id)
                          : f.target_type === 'object' && objectOf.has(f.target_id) ? () => openObject(f.target_id) : undefined} />
                    ))}
                  </GapGroup>
                );
              })}
              {check.uncovered.length > 0 && (
                <GapGroup title={t('Asked for, but no work does it')} count={check.uncovered.length}>
                  {check.uncovered.map((u, i) => (
                    <li key={`${u.intent_id ?? 'text'}-${i}`} className="px-3 py-2">
                      <div className="text-[13px] text-foreground">{u.title}</div>
                      {u.suggestion && <div className="mt-0.5 text-[12px] text-muted-foreground">{u.suggestion}</div>}
                    </li>
                  ))}
                </GapGroup>
              )}
            </div>
          )}
        </div>
      </div>

      {/* The links — read without AI, always current. */}
      <div className="mt-4 space-y-3">
        <h3 className="text-[12px] font-medium text-muted-foreground">{t('From the links between the Strategy and its work')}</h3>
        {!intent?.data ? (
          <p className="text-[13px] text-muted-foreground">{t('Loading…')}</p>
        ) : !report.hasIntents ? (
          <p className="text-[13px] text-muted-foreground">{t('This Strategy has no decisions, hypotheses or success conditions yet, so there is nothing to measure the work against.')}</p>
        ) : linksClear ? (
          <p className="text-[13px] text-muted-foreground">{t('No gaps in the links: every open Element has a reason, and every decision, hypothesis and success condition still open has work.')}</p>
        ) : (
          <>
            {report.broken.length > 0 && (
              <GapGroup title={t('Standing on a reversed decision or a rejected hypothesis')} count={report.broken.length} danger>
                {report.broken.map((b) => (
                  <ElementRow key={b.element.id} element={elementById.get(b.element.id)} fallbackTitle={b.element.title} onOpen={() => openElement(b.element.id)}
                    note={`${t(CAUSE_LABEL[b.cause])}: ${b.intent.title}`} />
                ))}
              </GapGroup>
            )}
            {report.unserved.length > 0 && (
              <GapGroup title={t('No work is bound to these')} count={report.unserved.length}>
                {report.unserved.map((i) => (
                  <li key={i.id} className="flex items-baseline gap-2 px-3 py-2 text-[13px]">
                    <span className="w-28 shrink-0 text-[12px] text-muted-foreground">{t(KIND_WORD[i.kind] ?? i.kind)}</span>
                    <span className="min-w-0 flex-1 text-foreground">{i.title}</span>
                  </li>
                ))}
              </GapGroup>
            )}
            {report.unanchored.length > 0 && (
              <GapGroup title={t('No reason written')} count={report.unanchored.length}>
                {unanchoredShown.map((e) => (
                  <ElementRow key={e.id} element={elementById.get(e.id)} fallbackTitle={e.title} onOpen={() => openElement(e.id)} />
                ))}
                {report.unanchored.length > UNANCHORED_SHOWN && (
                  <li>
                    <button type="button" onClick={() => setShowAllUnanchored((v) => !v)}
                      className="w-full px-3 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground">
                      {showAllUnanchored ? t('Show fewer') : t('Show {n} more', { n: report.unanchored.length - UNANCHORED_SHOWN })}
                    </button>
                  </li>
                )}
              </GapGroup>
            )}
          </>
        )}
      </div>
    </PageSection>
  );
}

function GapGroup({ title, count, danger = false, children }: { title: string; count: number; danger?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[12px]">
        <span className="font-medium text-foreground">{title}</span>
        <span className={`tabular-nums ${danger ? 'text-[var(--status-danger-text)]' : 'text-muted-foreground'}`}>{count}</span>
      </div>
      <ul className="divide-y divide-border/50 rounded-md border border-border/60">{children}</ul>
    </div>
  );
}

function ElementRow({ element, fallbackTitle, note, onOpen }: { element?: ElementWithDetails; fallbackTitle: string; note?: string; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-2.5 px-3 py-1.5 text-left hover:bg-foreground/[0.04]">
        <span className="mt-[3px] shrink-0">
          {element ? <ElementProgressMark size={14} status={element.status} progress={getElementProgress(element)} /> : <ElementIcon size={14} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            {element?.display_id && <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{element.display_id}</span>}
            <span className="min-w-0 truncate text-[13px] text-foreground">{element?.title ?? fallbackTitle}</span>
          </span>
          {note && <span className="block text-[12px] text-muted-foreground">{note}</span>}
        </span>
      </button>
    </li>
  );
}

function FindingRow({ finding, element, onOpen }: { finding: GapFinding; element?: ElementWithDetails; onOpen?: () => void }) {
  const { t } = useI18n();
  const body = (
    <>
      <span className="mt-[3px] shrink-0 text-muted-foreground">
        {element ? <ElementProgressMark size={14} status={element.status} progress={getElementProgress(element)} />
          : finding.target_type === 'object' ? <ObjectIcon size={14} /> : <ElementIcon size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-foreground">
          {finding.target_type === 'strategy' && <span className="mr-1.5 text-[12px] text-muted-foreground">{t('Strategy')}</span>}
          {finding.label}
        </span>
        <span className="block text-[12px] text-muted-foreground">{finding.reason}</span>
        {finding.suggestion && <span className="block text-[12px] text-foreground/80">{finding.suggestion}</span>}
      </span>
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-foreground/[0.04]">{body}</button>
      ) : (
        <div className="flex items-start gap-2.5 px-3 py-2">{body}</div>
      )}
    </li>
  );
}
