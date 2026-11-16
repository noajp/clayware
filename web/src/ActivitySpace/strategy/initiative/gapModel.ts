// The Strategy's Gap: where the work under it no longer matches what it says.
//
// Two readings stand side by side on the Evaluation tab. This file is the one
// that needs no AI — it reads the links people and Athena already wrote
// (intent_bindings) and answers three questions from them alone:
//
//   broken     open work that stands on a decision that was reversed or a
//              hypothesis that was found false — the work a change of course
//              leaves behind;
//   unserved   a live decision, an unmet success condition or an untested
//              hypothesis that no work is bound to — what the Strategy asks
//              for and nobody is doing;
//   unanchored open work in the Strategy's own Objects bound to none of its
//              intents — work whose reason is not written down.
//
// The other reading is Athena's (strategy-gap): it reads the text and judges
// what links cannot say. `isCheckStale` tells the tab when that reading was
// made before the Strategy last changed.
//
// Pure: no React, no Supabase, no clock.

import type { Intent, IntentBinding } from '@/types/database';

export interface GapElement {
  id: string;
  title: string;
  display_id?: string | null;
  status?: string | null;
  object_id?: string | null;
}

export type BrokenCause = 'reversed' | 'rejected';

export interface BrokenBasis {
  element: GapElement;
  intent: Intent;
  cause: BrokenCause;
}

export interface GapReport {
  broken: BrokenBasis[];
  unserved: Intent[];
  unanchored: GapElement[];
  /** Whether the Strategy has any intent to bind to; without one, unanchored says nothing. */
  hasIntents: boolean;
}

const CLOSED = new Set(['done', 'cancelled']);
export const isOpenElement = (e: GapElement) => !CLOSED.has(e.status ?? '');

/** Why an intent can no longer carry work, or null while it still can. */
export function brokenCause(intent: Intent): BrokenCause | null {
  if (intent.superseded_by_intent_id) return 'reversed';
  if (intent.kind === 'assumption' && intent.verdict === 'rejected') return 'rejected';
  return null;
}

/** Whether work is still owed to an intent: a standing decision, a success
 *  condition not yet met, or a hypothesis nobody has found out about yet.
 *  A closed decision and a hypothesis with a verdict are done with. */
function owesWork(intent: Intent): boolean {
  if (brokenCause(intent)) return false;
  if (intent.kind === 'decision') return intent.status !== 'done';
  if (intent.kind === 'assumption') return intent.verdict === null;
  if (intent.kind === 'measure') {
    if (intent.target_value === null || intent.actual_value === null) return true;
    return intent.direction === 'at_most' ? intent.actual_value > intent.target_value : intent.actual_value < intent.target_value;
  }
  return false;
}

export function buildGapReport(input: {
  intents: readonly Intent[];
  bindings: readonly IntentBinding[];
  /** Every Element the Strategy reaches, its descendants' included. */
  elements: readonly GapElement[];
  /** The Elements of the Strategy's own Objects. */
  ownElementIds: ReadonlySet<string>;
}): GapReport {
  const intents = input.intents.filter((i) => i.kind !== 'master');
  const byId = new Map(intents.map((i) => [i.id, i]));
  const elements = new Map(input.elements.map((e) => [e.id, e]));
  const elementBindings = input.bindings.filter((b) => b.target_type === 'element' && byId.has(b.intent_id));

  const broken: BrokenBasis[] = [];
  const seenBroken = new Set<string>();
  const servedBy = new Map<string, number>();
  const anchored = new Set<string>();
  for (const b of elementBindings) {
    const intent = byId.get(b.intent_id)!;
    const element = elements.get(b.target_id);
    if (!element) continue;
    anchored.add(element.id);
    servedBy.set(intent.id, (servedBy.get(intent.id) ?? 0) + 1);
    const cause = brokenCause(intent);
    if (cause && isOpenElement(element) && !seenBroken.has(element.id)) {
      seenBroken.add(element.id);
      broken.push({ element, intent, cause });
    }
  }

  const unserved = intents.filter((i) => owesWork(i) && !servedBy.get(i.id));
  const unanchored = intents.length === 0 ? [] : input.elements.filter((e) =>
    input.ownElementIds.has(e.id) && isOpenElement(e) && !anchored.has(e.id));

  return { broken, unserved, unanchored, hasIntents: intents.length > 0 };
}

/** Whether Athena's reading was made before the Strategy last changed — its
 *  text or any of its intents — and so may no longer hold. */
export function isCheckStale(checkedAt: string, strategyUpdatedAt: string | null, intents: readonly Pick<Intent, 'updated_at'>[]): boolean {
  const at = Date.parse(checkedAt);
  if (Number.isNaN(at)) return false;
  const changes = [strategyUpdatedAt, ...intents.map((i) => i.updated_at)]
    .map((s) => (s ? Date.parse(s) : NaN)).filter((n) => !Number.isNaN(n));
  return changes.some((n) => n > at);
}
