// =============================================================
// A Sustainment function's definition document, contract `sustainment/v0`
// (PRODUCT.md §9.4): what the function is for, and what it keeps, in the
// resources–events–agents vocabulary of §9.3. Each section is a list of
// short lines a person can read and edit; the kernel that will run them
// reads the same document later.
//
// Pure: the hooks store this in `sustainment_functions.definition`, the
// page reads it back through `readDefinition`.
// =============================================================

export const DEFINITION_CONTRACT = 'sustainment/v0' as const;

/** The sections, in the order the page shows them. */
export const DEFINITION_SECTIONS = ['things', 'commitments', 'facts', 'matches', 'norms', 'time', 'intake', 'approvals'] as const;
export type DefinitionSection = typeof DEFINITION_SECTIONS[number];

/** Each section's name and the question it answers, in English; the page
 *  translates them. */
export const SECTION_META: Record<DefinitionSection, { label: string; hint: string }> = {
  things: { label: 'Things', hint: 'Parties, resources, places and documents it keeps track of' },
  commitments: { label: 'Commitments', hint: 'What is expected to happen: orders, contracts, budgets' },
  facts: { label: 'Facts', hint: 'What actually happened, with the day it happened' },
  matches: { label: 'Matches', hint: 'Which facts fulfil which commitments' },
  norms: { label: 'Rules', hint: 'Calculations, checks and conditions to keep' },
  time: { label: 'Dates', hint: 'Deadlines, closing days and cycles' },
  intake: { label: 'Intake', hint: 'Where records come in from: email, PDF, statements' },
  approvals: { label: 'Approvals', hint: 'Who confirms what, and in which order' },
};

export interface FunctionDefinition {
  contract: typeof DEFINITION_CONTRACT;
  /** Who uses it and why. */
  intent: string;
  sections: Record<DefinitionSection, string[]>;
}

export type FunctionStatus = 'draft' | 'published';

export function emptySections(): Record<DefinitionSection, string[]> {
  return Object.fromEntries(DEFINITION_SECTIONS.map((s) => [s, []])) as unknown as Record<DefinitionSection, string[]>;
}

export function emptyDefinition(intent = ''): FunctionDefinition {
  return { contract: DEFINITION_CONTRACT, intent, sections: emptySections() };
}

const lines = (value: unknown): string[] => (Array.isArray(value)
  ? value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
  : []);

/** Reads a stored definition. Anything missing or malformed reads as empty,
 *  so a row written by an older or broken client still opens. */
export function readDefinition(raw: unknown): FunctionDefinition {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const rawSections = obj.sections && typeof obj.sections === 'object' && !Array.isArray(obj.sections)
    ? obj.sections as Record<string, unknown> : {};
  const sections = emptySections();
  for (const s of DEFINITION_SECTIONS) sections[s] = lines(rawSections[s]);
  return { contract: DEFINITION_CONTRACT, intent: typeof obj.intent === 'string' ? obj.intent : '', sections };
}

/** The definition with one section's lines replaced, blank lines dropped. */
export function withSection(def: FunctionDefinition, section: DefinitionSection, next: readonly string[]): FunctionDefinition {
  return { ...def, sections: { ...def.sections, [section]: lines([...next]) } };
}

/** What still has to be written before a function can be published: an
 *  intent, something it keeps, and something that happens to it. */
export function publishGaps(def: FunctionDefinition): string[] {
  const gaps: string[] = [];
  if (!def.intent.trim()) gaps.push('Write what this function is for.');
  if (def.sections.things.length === 0) gaps.push('Add at least one thing it keeps track of.');
  if (def.sections.commitments.length === 0 && def.sections.facts.length === 0) gaps.push('Add at least one commitment or fact.');
  return gaps;
}

/** The order_index that puts a new row after the last one. */
export function nextOrder(rows: readonly { order_index: number | null }[]): number {
  let last = 0;
  for (const r of rows) if (r.order_index != null && r.order_index > last) last = r.order_index;
  return last + 1;
}

/** A status change as the row stores it: publishing stamps the time, going
 *  back to a draft clears it. */
export function statusPatch(status: FunctionStatus, now = new Date()): { status: FunctionStatus; published_at: string | null } {
  return { status, published_at: status === 'published' ? now.toISOString() : null };
}
