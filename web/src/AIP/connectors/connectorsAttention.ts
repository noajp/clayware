import type { Integration, IntegrationDraft, SiteCredential } from '@/types/database';
import { INTEGRATION_STATUS_LABELS, integrationStatus, presetById, readLastTest, signInUnfinished, testOutcomeLabel } from './catalog';
import { siteCredentialStatus } from './siteCredentialModel';

// What on Settings › Connectors waits on a person, for the strip at the
// top of the page. Drafts count when the drafting AI is waiting — on an
// answer (awaiting_input) or on a review (awaiting_review), the two
// states the server's heartbeat treats as waiting on a person — and the
// Space's connections and site logins count when they stopped working.
// Only the person who started a draft can answer its AI (the drafting run
// is theirs), and reviewing is an owner's act (RLS); everyone else reads
// who it waits on instead of being asked. Pure.

export type AttentionKind = 'draft-question' | 'draft-review' | 'connection' | 'site-login';

export interface AttentionItem {
  kind: AttentionKind;
  /** The draft's, connection's or site login's id. */
  id: string;
  name: string;
  icon: string | null;
  /** Why it is here (a t() key). */
  reason: string;
  tone: 'warning' | 'danger';
}

export function attentionItems({ drafts, integrations, siteLogins, isOwner, userId }: {
  drafts: readonly Pick<IntegrationDraft, 'id' | 'name' | 'status' | 'created_by'>[];
  integrations: readonly Pick<Integration, 'id' | 'name' | 'kind' | 'preset' | 'icon' | 'enabled' | 'last_test' | 'auth_type' | 'secret_id'>[];
  siteLogins: readonly Pick<SiteCredential, 'id' | 'origin' | 'label' | 'secret_id' | 'last_test'>[];
  isOwner: boolean;
  /** The signed-in person; null while the session resolves. */
  userId: string | null;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const d of drafts) {
    if (d.status !== 'awaiting_input') continue;
    items.push({ kind: 'draft-question', id: d.id, name: d.name, icon: null, tone: 'warning',
      reason: userId !== null && d.created_by === userId ? 'The AI is asking you something' : 'The AI is waiting for the person who started it' });
  }
  for (const d of drafts) {
    if (d.status !== 'awaiting_review') continue;
    items.push({ kind: 'draft-review', id: d.id, name: d.name, icon: null, tone: 'warning',
      reason: isOwner ? 'Waiting for your review' : 'Waiting for an owner’s review' });
  }
  for (const i of integrations) {
    // Model connections are managed in Settings › Team.
    if (i.kind === 'model' || integrationStatus(i) !== 'action-needed') continue;
    const last = readLastTest(i.last_test);
    items.push({ kind: 'connection', id: i.id, name: i.name, icon: i.icon ?? presetById(i.preset)?.icon ?? null, tone: 'danger',
      reason: signInUnfinished(i) ? 'Sign-in hasn’t finished' : last ? testOutcomeLabel(last.code) : INTEGRATION_STATUS_LABELS['action-needed'] });
  }
  for (const c of siteLogins) {
    if (siteCredentialStatus(c) !== 'action-needed') continue;
    const last = readLastTest(c.last_test);
    items.push({ kind: 'site-login', id: c.id, name: c.label || c.origin, icon: null, tone: 'danger',
      reason: last ? testOutcomeLabel(last.code) : INTEGRATION_STATUS_LABELS['action-needed'] });
  }
  return items;
}
