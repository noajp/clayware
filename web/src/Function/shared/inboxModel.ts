// What the Inbox shows first: the things that wait on the person.
//
// A question a run asked rests the work until it is answered, so it is
// not one more row among reports and status changes — it leads the
// list, under its own heading, for as long as its ticket stands open.
// Whether a ticket is open is the ticket's own state (the notification
// is only the knock on the door), so the list is split against the set
// of open tickets, never by the notification's read flag: reading a
// question does not answer it, and answering it takes it out of the
// waiting group whether or not the row was ever marked read.
//
// Pure: the list component loads the open tickets and renders the split.

interface InboxEntry { kind: string; question_ticket_id?: string | null; is_read?: boolean }

/** Notification kinds that explicitly ask the user for a decision or review
 *  while unread (approvals, invitations, scheduled reviews). */
const ACTION_REQUIRED_KINDS: ReadonlySet<string> = new Set([
  'approval_requested',
  'invite',
  'review_due',
]);

/** The tickets the Inbox's question notifications point at, once each. */
export function questionTicketIdsOf(notifications: readonly InboxEntry[]): string[] {
  const ids = new Set<string>();
  for (const n of notifications) {
    if (n.kind === 'question' && n.question_ticket_id) ids.add(n.question_ticket_id);
  }
  return [...ids];
}

/** The Inbox in two groups, each in the order it came in: what waits on
 *  the person (questions whose ticket is still open, plus unread approvals,
 *  invitations, and review requests), then everything else. While the open
 *  tickets are not known yet, open questions are not claimed to be waiting. */
export function splitInbox<N extends InboxEntry>(
  notifications: readonly N[],
  openTicketIds: ReadonlySet<string> | null,
): { waiting: N[]; rest: N[] } {
  const waiting: N[] = [];
  const rest: N[] = [];
  for (const n of notifications) {
    const openQuestion = n.kind === 'question' && !!n.question_ticket_id && !!openTicketIds?.has(n.question_ticket_id);
    const pendingAction = ACTION_REQUIRED_KINDS.has(n.kind) && !n.is_read;
    (openQuestion || pendingAction ? waiting : rest).push(n);
  }
  return { waiting, rest };
}
