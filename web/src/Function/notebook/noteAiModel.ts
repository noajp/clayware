import type { Node as PMNode } from 'prosemirror-model';
import { schema } from './pm/schema';
import type { NoteBlockSummary, NoteProposal, NoteProposalBlockType, NoteProposalKind } from '@/hooks/noteAi';

// Pure logic behind the Dynamic AI Note:
//   - extracting caret context for Tab ghost-text completion
//   - extracting line/block units for pinpoint AI revision proposals
//   - detecting when a Note has grown dense ("キツキツ")
//   - reconciling user typing against ghost text & splitting clauses for ⌘→
//   - resolving proposals safely onto live ProseMirror positions
//   - transcript delta tracking & auto-structuring thresholds

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
}

export interface EditorCaretContext {
  prefix: string;
  suffix: string;
  currentBlockText: string;
  blockType: string;
}

export interface EditableUnit {
  index: number;
  type: 'paragraph' | 'heading' | 'bullet' | 'numbered' | 'checklist';
  nodePos: number;
  nodeSize: number;
  textFrom: number;
  textTo: number;
  text: string;
  /** Parent list position & attrs when this unit is a list_item. */
  listPos: number | null;
  listChecklist: boolean;
}

export interface ResolvedProposal {
  id: string;
  kind: NoteProposalKind;
  originalText: string;
  proposedText: string;
  proposedBlockType: NoteProposalBlockType;
  reason: string;
  unit: EditableUnit;
}

const MAX_PREFIX_CHARS = 2000;
const MAX_SUFFIX_CHARS = 500;

/** Extracts plain text around `pos` for inline Tab completion. */
export function extractEditorContext(doc: PMNode, pos: number): EditorCaretContext {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);
  const parent = $pos.parent;

  let blockType: string = parent.type.name;
  for (let d = $pos.depth; d > 0; d--) {
    const ancestor = $pos.node(d);
    if (ancestor.type === schema.nodes.bullet_list) {
      blockType = ancestor.attrs.checklist ? 'checklist' : 'bullet';
      break;
    }
    if (ancestor.type === schema.nodes.ordered_list) {
      blockType = 'numbered';
      break;
    }
    if (ancestor.type === schema.nodes.heading) {
      blockType = `heading_${ancestor.attrs.level}`;
      break;
    }
  }

  const rawPrefix = doc.textBetween(0, clamped, '\n', ' ');
  const rawSuffix = doc.textBetween(clamped, doc.content.size, '\n', ' ');
  const prefix = rawPrefix.length > MAX_PREFIX_CHARS ? rawPrefix.slice(-MAX_PREFIX_CHARS) : rawPrefix;
  const suffix = rawSuffix.length > MAX_SUFFIX_CHARS ? rawSuffix.slice(0, MAX_SUFFIX_CHARS) : rawSuffix;
  const currentBlockText = parent.isTextblock ? parent.textContent : '';

  return { prefix, suffix, currentBlockText, blockType };
}

/** Walks a Note document and returns editable leaf units (paragraphs, headings,
 *  and unlinked list items). Skips embeds, code blocks, tables, and linked
 *  Elements so AI proposals never touch structured widgets or linked rows. */
export function extractEditableUnits(doc: PMNode): EditableUnit[] {
  const units: EditableUnit[] = [];
  const { paragraph, heading, bullet_list, ordered_list, list_item } = schema.nodes;

  const visit = (node: PMNode, pos: number, listInfo: { pos: number; kind: 'bullet' | 'numbered' | 'checklist' } | null) => {
    if (node.type === paragraph || node.type === heading) {
      const text = node.textContent.trim();
      if (text) {
        units.push({
          index: units.length,
          type: node.type === heading ? 'heading' : 'paragraph',
          nodePos: pos,
          nodeSize: node.nodeSize,
          textFrom: pos + 1,
          textTo: pos + node.nodeSize - 1,
          text,
          listPos: null,
          listChecklist: false,
        });
      }
      return;
    }

    if (node.type === bullet_list || node.type === ordered_list) {
      const kind: 'bullet' | 'numbered' | 'checklist' =
        node.type === ordered_list ? 'numbered' : node.attrs.checklist ? 'checklist' : 'bullet';
      let offset = pos + 1;
      node.forEach((child) => {
        if (child.type === list_item) {
          const first = child.firstChild;
          // Skip items linked to an Element — those are live domain records.
          if (!child.attrs.elementId && first && first.type === paragraph) {
            const text = first.textContent.trim();
            if (text) {
              units.push({
                index: units.length,
                type: kind,
                nodePos: offset,
                nodeSize: child.nodeSize,
                textFrom: offset + 2,
                textTo: offset + 1 + first.nodeSize - 1,
                text,
                listPos: pos,
                listChecklist: kind === 'checklist',
              });
            }
          }
          // Also inspect nested lists inside this list_item.
          let innerOffset = offset + 1;
          child.forEach((grand, _off, idx) => {
            if (idx > 0 && (grand.type === bullet_list || grand.type === ordered_list)) {
              visit(grand, innerOffset, { pos: offset, kind });
            }
            innerOffset += grand.nodeSize;
          });
        }
        offset += child.nodeSize;
      });
      return;
    }

    if (node.type === schema.nodes.blockquote) {
      let offset = pos + 1;
      node.forEach((child) => {
        visit(child, offset, listInfo);
        offset += child.nodeSize;
      });
    }
  };

  let offset = 0;
  doc.forEach((child) => {
    visit(child, offset, null);
    offset += child.nodeSize;
  });

  return units;
}

/** Converts EditableUnits into the compact summary payload sent to the Edge Function. */
export function toBlockSummaries(units: EditableUnit[]): NoteBlockSummary[] {
  return units.map((u) => ({ index: u.index, type: u.type, text: u.text }));
}

export interface DensityReport {
  isDense: boolean;
  totalChars: number;
  longBlockCount: number;
  unitCount: number;
}

/** Heuristic for when a Note has grown dense ("内容がキツキツ") and benefits
 *  from pinpoint refinement or line-by-line completion rather than raw dumps. */
export function analyzeNoteDensity(doc: PMNode): DensityReport {
  const units = extractEditableUnits(doc);
  let totalChars = 0;
  let longBlockCount = 0;
  let headingCount = 0;

  for (const u of units) {
    totalChars += u.text.length;
    if (u.type === 'heading') headingCount++;
    if (u.type !== 'heading' && u.text.length >= 140) longBlockCount++;
  }

  const isDense =
    longBlockCount >= 2 ||
    (totalChars >= 600 && headingCount === 0 && units.length >= 5) ||
    totalChars >= 1100;

  return { isDense, totalChars, longBlockCount, unitCount: units.length };
}

/** Matches AI proposals onto live EditableUnits in `doc`. Verifies exact text
 *  at `blockIndex` first, then falls back to exact text match anywhere in the
 *  document (in case the user inserted lines while the AI was thinking). */
export function resolveProposalTargets(doc: PMNode, proposals: NoteProposal[]): ResolvedProposal[] {
  const units = extractEditableUnits(doc);
  const usedUnits = new Set<number>();
  const resolved: ResolvedProposal[] = [];

  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

  for (const p of proposals) {
    if (!p.proposedText.trim()) continue;
    const targetNorm = normalize(p.originalText);

    // 1. Direct index match
    let unit: EditableUnit | undefined = units[p.blockIndex];
    if (unit && targetNorm && normalize(unit.text) !== targetNorm) {
      unit = undefined;
    }

    // 2. Fallback: exact text match across units
    if (!unit && targetNorm) {
      unit = units.find((u) => !usedUnits.has(u.index) && normalize(u.text) === targetNorm);
    }

    // 3. Fallback: substring match if model slightly trimmed punctuation
    if (!unit && targetNorm.length >= 12) {
      unit = units.find(
        (u) => !usedUnits.has(u.index) && (normalize(u.text).includes(targetNorm) || targetNorm.includes(normalize(u.text))),
      );
    }

    if (!unit || usedUnits.has(unit.index)) continue;

    // Ignore no-op proposals that don't actually change anything.
    if (
      p.kind !== 'missing' &&
      normalize(p.proposedText) === normalize(unit.text) &&
      (p.proposedBlockType === 'same' || p.proposedBlockType === unit.type)
    ) {
      continue;
    }

    usedUnits.add(unit.index);
    resolved.push({
      id: p.id,
      kind: p.kind,
      originalText: unit.text,
      proposedText: p.proposedText.trim(),
      proposedBlockType: p.proposedBlockType,
      reason: p.reason,
      unit,
    });
  }

  return resolved;
}

/** When the user types `inserted` right at the ghost-text anchor, returns the
 *  remaining ghost text if `inserted` matches its prefix, or null otherwise. */
export function reconcileGhostText(ghostText: string, inserted: string): string | null {
  if (!inserted || !ghostText) return null;
  if (!ghostText.startsWith(inserted)) return null;
  const rest = ghostText.slice(inserted.length);
  return rest.length > 0 ? rest : null;
}

/** Splits the first natural phrase/word from ghost text for partial acceptance (⌘→).
 *  Handles both Japanese punctuation/clauses and Latin word boundaries. */
export function splitFirstClause(text: string): { head: string; tail: string } {
  if (!text) return { head: '', tail: '' };

  // Japanese punctuation boundary (、 。 ・ ： ； ） 」)
  const jpPunct = text.search(/[、。・：；）」!！?？]/);
  if (jpPunct >= 0 && jpPunct < 28) {
    return { head: text.slice(0, jpPunct + 1), tail: text.slice(jpPunct + 1) };
  }

  // English / space-delimited word (include leading/trailing space cleanly)
  const wordMatch = text.match(/^(\s*\S+\s?)/);
  if (wordMatch && wordMatch[1].length < text.length && wordMatch[1].length <= 24) {
    return { head: wordMatch[1], tail: text.slice(wordMatch[1].length) };
  }

  // Fallback for continuous Japanese without punctuation: accept ~8 chars
  if (text.length > 12) {
    return { head: text.slice(0, 8), tail: text.slice(8) };
  }

  return { head: text, tail: '' };
}

/** Formats transcript segments into readable lines and extracts the incremental
 *  delta since `lastProcessedCount`. */
export function computeTranscriptDelta(
  segments: TranscriptSegment[],
  lastProcessedCount: number,
): { deltaText: string; fullText: string; unprocessedChars: number } {
  const format = (list: TranscriptSegment[]) =>
    list
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join('\n');

  const unprocessed = segments.slice(Math.max(0, lastProcessedCount));
  const deltaText = format(unprocessed);
  const fullText = format(segments);
  const unprocessedChars = unprocessed.reduce((acc, s) => acc + s.text.trim().length, 0);
  return { deltaText, fullText, unprocessedChars };
}

/** Pure. Whether the words written as spoken are due to be organized into a
 *  section: enough for a topic to have taken shape, or a shorter run followed
 *  by a pause. Never sooner than 8s after the last round. */
export function shouldAutoStructure(args: {
  unprocessedChars: number;
  msSinceLastSpeech: number;
  msSinceLastStructure: number;
}): boolean {
  if (args.unprocessedChars <= 0) return false;
  if (args.msSinceLastStructure < 8000) return false;
  if (args.unprocessedChars >= 240) return true;
  if (args.unprocessedChars >= 60 && args.msSinceLastSpeech >= 10000) return true;
  return false;
}

/** The longest minutes sent to be regrouped in one go. */
export const REGROUP_MAX_CHARS = 12000;

/** Pure. Whether the minutes are due to be grouped again: three sections
 *  since the last time (two when recording has stopped), and enough written
 *  for regrouping to shorten anything. Minutes that hold more than text are
 *  left as they are. */
export function shouldRegroup(args: {
  rounds: number;
  minutesChars: number;
  plain: boolean;
  last: boolean;
}): boolean {
  if (!args.plain) return false;
  if (args.minutesChars < 600 || args.minutesChars > REGROUP_MAX_CHARS) return false;
  return args.rounds >= (args.last ? 2 : 3);
}

/** Formats seconds as mm:ss for the voice timer. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}
