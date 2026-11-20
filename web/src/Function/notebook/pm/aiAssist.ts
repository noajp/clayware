import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { schema } from './schema';
import {
  reconcileGhostText,
  resolveProposalTargets,
  splitFirstClause,
  type ResolvedProposal,
} from '../noteAiModel';
import type { SelectionEditResult } from '@/hooks/noteAi';

// ProseMirror plugins for Dynamic AI Note:
//   1. Ghost-text inline Tab completion (Cursor Tab style)
//   2. Pinpoint block-level AI revision proposal highlights & apply commands

export interface GhostState {
  pos: number;
  text: string;
}

export const ghostKey = new PluginKey<GhostState | null>('note-ai-ghost');

export function setGhostCompletion(view: EditorView, ghost: GhostState | null): void {
  view.dispatch(view.state.tr.setMeta(ghostKey, ghost));
}

/** Inline ghost-text completion rendered as a widget decoration right at the caret.
 *  Never touches the document, Yjs state, or undo history until accepted with Tab. */
export function ghostCompletionPlugin(): Plugin<GhostState | null> {
  return new Plugin<GhostState | null>({
    key: ghostKey,
    state: {
      init: () => null,
      apply(tr, prev, oldState, newState) {
        const meta = tr.getMeta(ghostKey) as GhostState | null | undefined;
        if (meta !== undefined) return meta;
        if (!prev) return null;

        if (tr.docChanged) {
          // If the user typed characters right at the ghost anchor that match
          // its prefix, consume the prefix smoothly with zero flicker.
          if (
            oldState.selection.empty &&
            newState.selection.empty &&
            oldState.selection.from === prev.pos &&
            newState.selection.from > prev.pos
          ) {
            const inserted = newState.doc.textBetween(prev.pos, newState.selection.from, '\n');
            const rest = reconcileGhostText(prev.text, inserted);
            return rest ? { pos: newState.selection.from, text: rest } : null;
          }
          return null;
        }

        if (tr.selectionSet) {
          if (!newState.selection.empty || newState.selection.from !== prev.pos) {
            return null;
          }
        }
        return prev;
      },
    },
    props: {
      decorations(state: EditorState) {
        const ghost = ghostKey.getState(state);
        if (!ghost || !ghost.text) return null;
        if (ghost.pos < 0 || ghost.pos > state.doc.content.size) return null;

        const widget = Decoration.widget(
          ghost.pos,
          () => {
            const wrap = document.createElement('span');
            wrap.className = 'note-ghost-completion';
            wrap.setAttribute('aria-hidden', 'true');
            wrap.contentEditable = 'false';

            const textEl = document.createElement('span');
            textEl.className = 'note-ghost-text';
            textEl.textContent = ghost.text;

            const badge = document.createElement('kbd');
            badge.className = 'note-ghost-kbd';
            badge.textContent = 'Tab';

            wrap.append(textEl, badge);
            return wrap;
          },
          { side: 1, key: `ghost:${ghost.pos}:${ghost.text.slice(0, 24)}` },
        );
        return DecorationSet.create(state.doc, [widget]);
      },
      handleKeyDown(view, event) {
        if (event.isComposing) return false;
        const ghost = ghostKey.getState(view.state);
        if (!ghost || !ghost.text) return false;

        if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          const tr = view.state.tr
            .insertText(ghost.text, ghost.pos, ghost.pos)
            .setMeta(ghostKey, null)
            .scrollIntoView();
          view.dispatch(tr);
          return true;
        }

        if ((event.metaKey || event.ctrlKey) && event.key === 'ArrowRight') {
          event.preventDefault();
          const { head, tail } = splitFirstClause(ghost.text);
          if (!head) return false;
          const nextGhost: GhostState | null = tail ? { pos: ghost.pos + head.length, text: tail } : null;
          const tr = view.state.tr
            .insertText(head, ghost.pos, ghost.pos)
            .setMeta(ghostKey, nextGhost)
            .scrollIntoView();
          view.dispatch(tr);
          return true;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          setGhostCompletion(view, null);
          return true;
        }

        return false;
      },
    },
  });
}

// ── Pinpoint Block-Level Proposals ─────────────────────────────────────────

export interface ProposalsState {
  items: ResolvedProposal[];
  activeId: string | null;
}

export const proposalsKey = new PluginKey<ProposalsState>('note-ai-proposals');

export function setProposalsState(view: EditorView, state: ProposalsState): void {
  view.dispatch(view.state.tr.setMeta(proposalsKey, state));
}

export function pinpointProposalsPlugin(
  onFocusProposal: (id: string) => void,
): Plugin<ProposalsState> {
  return new Plugin<ProposalsState>({
    key: proposalsKey,
    state: {
      init: () => ({ items: [], activeId: null }),
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(proposalsKey) as ProposalsState | undefined;
        if (meta !== undefined) return meta;
        if (!prev.items.length || !tr.docChanged) return prev;

        // Re-anchor remaining proposals after any edit so stale ones drop out safely.
        const remapped = resolveProposalTargets(
          newState.doc,
          prev.items.map((p) => ({
            id: p.id,
            blockIndex: p.unit.index,
            kind: p.kind,
            originalText: p.originalText,
            proposedText: p.proposedText,
            proposedBlockType: p.proposedBlockType,
            reason: p.reason,
          })),
        );
        const activeId = remapped.some((p) => p.id === prev.activeId)
          ? prev.activeId
          : (remapped[0]?.id ?? null);
        return { items: remapped, activeId };
      },
    },
    props: {
      decorations(state: EditorState) {
        const { items, activeId } = proposalsKey.getState(state) ?? { items: [], activeId: null };
        if (!items.length) return null;
        const decos: Decoration[] = [];
        for (const item of items) {
          const from = item.unit.nodePos;
          const to = from + item.unit.nodeSize;
          if (from < 0 || to > state.doc.content.size) continue;
          const isActive = item.id === activeId;
          decos.push(
            Decoration.node(from, to, {
              class: isActive ? 'note-proposal-active' : 'note-proposal-target',
              'data-proposal-id': item.id,
            }),
          );
        }
        return decos.length ? DecorationSet.create(state.doc, decos) : null;
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const { items } = proposalsKey.getState(view.state) ?? { items: [] };
          if (!items.length) return false;
          const target = (event.target as HTMLElement | null)?.closest?.('[data-proposal-id]');
          const id = target?.getAttribute('data-proposal-id');
          if (!id) return false;
          onFocusProposal(id);
          return false;
        },
      },
    },
  });
}

// ── Apply Commands (Single Undoable Transactions) ──────────────────────────

function splitLinesClean(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•・]|\[[ xX]?\]|\d+\.)\s+/, '').trim())
    .filter(Boolean);
}

function makeListItems(lines: string[], checked: boolean | null): PMNode[] {
  const { paragraph, list_item } = schema.nodes;
  return lines.map((line) =>
    list_item.create({ checked, elementId: null }, paragraph.create(null, line ? schema.text(line) : null)),
  );
}

/** Applies a single pinpoint ResolvedProposal as an undoable ProseMirror transaction. */
export function applyProposalToView(view: EditorView, proposal: ResolvedProposal): boolean {
  const { paragraph, heading, bullet_list } = schema.nodes;
  const { unit, kind, proposedText, proposedBlockType } = proposal;
  const lines = splitLinesClean(proposedText);
  if (!lines.length) return false;

  const tr = view.state.tr;
  const targetType = proposedBlockType === 'same' ? unit.type : proposedBlockType;
  const isInsideList = unit.listPos !== null;

  if (kind === 'missing') {
    const insertAt = unit.nodePos + unit.nodeSize;
    if (isInsideList) {
      const checked = unit.listChecklist ? false : null;
      const items = makeListItems(lines, checked);
      tr.insert(insertAt, Fragment.from(items));
    } else if (targetType === 'bullet' || targetType === 'checklist') {
      const list = bullet_list.create(
        { checklist: targetType === 'checklist', dashed: false },
        Fragment.from(makeListItems(lines, targetType === 'checklist' ? false : null)),
      );
      tr.insert(insertAt, list);
    } else {
      const nodes = lines.map((line) => paragraph.create(null, schema.text(line)));
      tr.insert(insertAt, Fragment.from(nodes));
    }
    const nextPos = Math.min(insertAt + 2, tr.doc.content.size);
    tr.setSelection(TextSelection.near(tr.doc.resolve(nextPos)));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  // Replacing an existing unit
  if (!isInsideList && (targetType === 'bullet' || targetType === 'checklist')) {
    const list = bullet_list.create(
      { checklist: targetType === 'checklist', dashed: false },
      Fragment.from(makeListItems(lines, targetType === 'checklist' ? false : null)),
    );
    tr.replaceWith(unit.nodePos, unit.nodePos + unit.nodeSize, list);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(unit.nodePos + 2, tr.doc.content.size))));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  if (!isInsideList && targetType === 'heading') {
    const h = heading.create({ level: 2 }, schema.text(lines.join(' ')));
    tr.replaceWith(unit.nodePos, unit.nodePos + unit.nodeSize, h);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(unit.nodePos + 1, tr.doc.content.size))));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  if (isInsideList && lines.length > 1) {
    const checked = unit.listChecklist ? false : null;
    const items = makeListItems(lines, checked);
    tr.replaceWith(unit.nodePos, unit.nodePos + unit.nodeSize, Fragment.from(items));
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(unit.nodePos + 2, tr.doc.content.size))));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  // In-place text replacement (preserves surrounding list/heading structure)
  const replacement = lines.join(' ');
  tr.insertText(replacement, unit.textFrom, unit.textTo);
  if (isInsideList && targetType === 'checklist' && !unit.listChecklist && unit.listPos !== null) {
    const listNode = tr.doc.nodeAt(unit.listPos);
    if (listNode && listNode.type === bullet_list) {
      tr.setNodeMarkup(unit.listPos, undefined, { ...listNode.attrs, checklist: true });
      const mappedItemPos = tr.mapping.map(unit.nodePos);
      const itemNode = tr.doc.nodeAt(mappedItemPos);
      if (itemNode && itemNode.type === schema.nodes.list_item && !itemNode.attrs.elementId) {
        tr.setNodeMarkup(mappedItemPos, undefined, { ...itemNode.attrs, checked: false });
      }
    }
  }
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Applies a pinpoint selection AI edit over `[from, to]` as a single undoable transaction. */
export function applySelectionEditToView(
  view: EditorView,
  range: { from: number; to: number },
  edit: SelectionEditResult,
): boolean {
  const { from, to } = range;
  const max = view.state.doc.content.size;
  if (from < 0 || to > max || from > to) return false;

  const { bullet_list } = schema.nodes;
  const tr = view.state.tr;

  if (edit.blockType === 'bullet' || edit.blockType === 'checklist') {
    const lines = splitLinesClean(edit.replacement);
    if (!lines.length) return false;
    const list = bullet_list.create(
      { checklist: edit.blockType === 'checklist', dashed: false },
      Fragment.from(makeListItems(lines, edit.blockType === 'checklist' ? false : null)),
    );
    const $from = view.state.doc.resolve(from);
    const $to = view.state.doc.resolve(to);
    const blockStart = $from.depth > 0 ? $from.before(1) : from;
    const blockEnd = $to.depth > 0 ? $to.after(1) : to;
    tr.replaceWith(blockStart, blockEnd, list);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(blockStart + 2, tr.doc.content.size))));
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  tr.insertText(edit.replacement, from, to);
  tr.setSelection(TextSelection.create(tr.doc, Math.min(from + edit.replacement.length, tr.doc.content.size)));
  view.dispatch(tr.scrollIntoView());
  return true;
}
