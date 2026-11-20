// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { docToHtml, htmlToDoc } from '@/Function/notebook/pm/html';
import { schema } from '@/Function/notebook/pm/schema';
import { noteKeymap, pmRedo, pmUndo } from '@/Function/notebook/pm/plugins';
import {
  analyzeNoteDensity,
  computeTranscriptDelta,
  extractEditableUnits,
  extractEditorContext,
  formatElapsed,
  reconcileGhostText,
  resolveProposalTargets,
  shouldAutoStructure,
  splitFirstClause,
} from '@/Function/notebook/noteAiModel';
import {
  applyProposalToView,
  applySelectionEditToView,
  ghostCompletionPlugin,
  ghostKey,
  pinpointProposalsPlugin,
  proposalsKey,
  setGhostCompletion,
  setProposalsState,
} from '@/Function/notebook/pm/aiAssist';

function makeView(html: string, focusText?: string, offset?: number) {
  const doc = htmlToDoc(html);
  const state = EditorState.create({
    schema,
    doc,
    plugins: [
      ghostCompletionPlugin(),
      pinpointProposalsPlugin(() => {}),
      ...noteKeymap(pmUndo, pmRedo),
    ],
  });
  const view = new EditorView(document.createElement('div'), { state });
  if (focusText !== undefined) {
    let at = -1;
    doc.descendants((node, pos) => {
      if (at < 0 && node.isTextblock && node.textContent === focusText) {
        at = pos + 1 + (offset ?? focusText.length);
      }
      return at < 0;
    });
    if (at >= 0) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    }
  }
  return view;
}

function press(view: EditorView, key: string, mods: { metaKey?: boolean; shiftKey?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', { key, ...mods });
  return view.someProp('handleKeyDown', (handle) => handle(view, event)) ?? false;
}

describe('extractEditableUnits & extractEditorContext', () => {
  it('extracts paragraphs, headings, and unlinked list items while skipping linked Elements and embeds', () => {
    const doc = htmlToDoc(
      '<h2>会議メモ</h2>' +
      '<p>背景の共有</p>' +
      '<ul data-checklist="true"><li data-element-id="el-1">既存Element</li><li data-checked="false">田中さんが資料作成</li></ul>' +
      '<pre data-lang="mermaid">graph LR; A-->B</pre>',
    );
    const units = extractEditableUnits(doc);
    expect(units.map((u) => [u.type, u.text])).toEqual([
      ['heading', '会議メモ'],
      ['paragraph', '背景の共有'],
      ['checklist', '田中さんが資料作成'],
    ]);
  });

  it('extracts caret prefix, suffix, and blockType inside lists', () => {
    const view = makeView('<h2>議題</h2><ul><li>来週のリリース</li></ul>', '来週のリリース', 3);
    const ctx = extractEditorContext(view.state.doc, view.state.selection.from);
    expect(ctx.blockType).toBe('bullet');
    expect(ctx.currentBlockText).toBe('来週のリリース');
    expect(ctx.prefix).toContain('来週の');
    expect(ctx.suffix).toBe('リリース');
  });
});

describe('analyzeNoteDensity', () => {
  it('detects dense notes with long blocks or many unstructured paragraphs', () => {
    const shortDoc = htmlToDoc('<h2>決定</h2><ul><li>案Aで進行</li></ul>');
    expect(analyzeNoteDensity(shortDoc).isDense).toBe(false);

    const longPara = 'あ'.repeat(160);
    const denseDoc = htmlToDoc(`<p>${longPara}</p><p>${longPara}</p>`);
    const report = analyzeNoteDensity(denseDoc);
    expect(report.isDense).toBe(true);
    expect(report.longBlockCount).toBe(2);
  });
});

describe('reconcileGhostText & splitFirstClause', () => {
  it('consumes matching typed prefixes without losing remaining ghost text', () => {
    expect(reconcileGhostText('リリース日を確定する', 'リリース')).toBe('日を確定する');
    expect(reconcileGhostText('abc', 'abc')).toBeNull();
    expect(reconcileGhostText('abc', 'x')).toBeNull();
  });

  it('splits Japanese clauses on punctuation and English on word boundaries', () => {
    expect(splitFirstClause('来週火曜までに、デザイン案を共有する')).toEqual({
      head: '来週火曜までに、',
      tail: 'デザイン案を共有する',
    });
    expect(splitFirstClause('confirm the launch date')).toEqual({
      head: 'confirm ',
      tail: 'the launch date',
    });
  });
});

describe('ghostCompletionPlugin', () => {
  it('accepts full completion on Tab and clears ghost state', () => {
    const view = makeView('<p>決定事項：</p>', '決定事項：');
    setGhostCompletion(view, { pos: view.state.selection.from, text: '来週月曜にベータ公開' });
    expect(ghostKey.getState(view.state)?.text).toBe('来週月曜にベータ公開');

    expect(press(view, 'Tab')).toBe(true);
    expect(docToHtml(view.state.doc)).toBe('<p>決定事項：来週月曜にベータ公開</p>');
    expect(ghostKey.getState(view.state)).toBeNull();
  });

  it('accepts clause-by-clause on Mod-ArrowRight and dismisses on Escape', () => {
    const view = makeView('<p>次回：</p>', '次回：');
    setGhostCompletion(view, { pos: view.state.selection.from, text: '見積りを確認し、承認をもらう' });

    expect(press(view, 'ArrowRight', { metaKey: true })).toBe(true);
    expect(docToHtml(view.state.doc)).toBe('<p>次回：見積りを確認し、</p>');
    expect(ghostKey.getState(view.state)?.text).toBe('承認をもらう');

    expect(press(view, 'Escape')).toBe(true);
    expect(ghostKey.getState(view.state)).toBeNull();
  });

  it('smoothly trims ghost text when the user types its matching prefix', () => {
    const view = makeView('<p>担当：</p>', '担当：');
    setGhostCompletion(view, { pos: view.state.selection.from, text: '佐藤さん' });
    const pos = view.state.selection.from;
    view.dispatch(view.state.tr.insertText('佐藤', pos, pos));
    expect(ghostKey.getState(view.state)?.text).toBe('さん');
  });
});

describe('pinpoint proposals resolution & apply', () => {
  it('anchors proposals even when a block shifts index, and ignores no-ops', () => {
    const doc = htmlToDoc('<p>新しく足した行</p><p>とても長くて冗長な文章です</p>');
    const resolved = resolveProposalTargets(doc, [
      {
        id: 'p1',
        blockIndex: 0, // shifted after user inserted a line above
        kind: 'condense',
        originalText: 'とても長くて冗長な文章です',
        proposedText: '簡潔な要点',
        proposedBlockType: 'same',
        reason: '1行に圧縮',
      },
      {
        id: 'noop',
        blockIndex: 0,
        kind: 'clarify',
        originalText: '新しく足した行',
        proposedText: '新しく足した行',
        proposedBlockType: 'same',
        reason: '変更なし',
      },
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe('p1');
    expect(resolved[0].unit.index).toBe(1);
  });

  it('applies condense, checklist conversion, and missing-line insertion cleanly', () => {
    const view = makeView('<p>AとBを確認して金曜までに送る必要がある</p><p>補足メモ</p>');
    const resolved = resolveProposalTargets(view.state.doc, [
      {
        id: 'act',
        blockIndex: 0,
        kind: 'action',
        originalText: 'AとBを確認して金曜までに送る必要がある',
        proposedText: 'Aを確認する（金曜）\nBを送付する（金曜）',
        proposedBlockType: 'checklist',
        reason: 'チェックリスト化',
      },
    ]);
    expect(resolved).toHaveLength(1);
    setProposalsState(view, { items: resolved, activeId: 'act' });
    expect(proposalsKey.getState(view.state)?.items).toHaveLength(1);

    expect(applyProposalToView(view, resolved[0])).toBe(true);
    expect(docToHtml(view.state.doc)).toBe(
      '<ul data-checklist="true"><li data-checked="false">Aを確認する（金曜）</li><li data-checked="false">Bを送付する（金曜）</li></ul><p>補足メモ</p>',
    );
  });

  it('inserts a missing point right after the anchored line', () => {
    const view = makeView('<ul><li>案Aで合意</li></ul>');
    const [proposal] = resolveProposalTargets(view.state.doc, [
      {
        id: 'miss',
        blockIndex: 0,
        kind: 'missing',
        originalText: '案Aで合意',
        proposedText: '予算上限は50万円まで',
        proposedBlockType: 'same',
        reason: '会話で出た予算条件を補足',
      },
    ]);
    expect(applyProposalToView(view, proposal)).toBe(true);
    expect(docToHtml(view.state.doc)).toBe('<ul><li>案Aで合意</li><li>予算上限は50万円まで</li></ul>');
  });

  it('applies pinpoint selection edits inline and as checklists', () => {
    const view = makeView('<p>ここはすごく長くて分かりにくい表現です</p>');
    const ok = applySelectionEditToView(
      view,
      { from: 1, to: 20 },
      { replacement: '簡潔な表現です', blockType: 'same', reason: '短縮' },
    );
    expect(ok).toBe(true);
    expect(docToHtml(view.state.doc)).toBe('<p>簡潔な表現です</p>');
  });
});

describe('transcript delta, auto-structure thresholds', () => {
  it('computes delta since last processed segment and auto-structure timing', () => {
    const segments = [
      { id: '1', text: 'まず今月の目標を確認します', timestamp: 1000 },
      { id: '2', text: 'A案で行くことに決定しました。担当は鈴木さんで来週水曜まで。', timestamp: 2000 },
    ];
    const d = computeTranscriptDelta(segments, 1);
    expect(d.deltaText).toBe('A案で行くことに決定しました。担当は鈴木さんで来週水曜まで。');
    expect(d.unprocessedChars).toBe(30);

    expect(shouldAutoStructure({ unprocessedChars: 260, msSinceLastSpeech: 1000, msSinceLastStructure: 10000 })).toBe(true);
    expect(shouldAutoStructure({ unprocessedChars: 120, msSinceLastSpeech: 1000, msSinceLastStructure: 10000 })).toBe(false);
    expect(shouldAutoStructure({ unprocessedChars: 70, msSinceLastSpeech: 11000, msSinceLastStructure: 10000 })).toBe(true);
    expect(shouldAutoStructure({ unprocessedChars: 260, msSinceLastSpeech: 1000, msSinceLastStructure: 3000 })).toBe(false);
    expect(formatElapsed(125)).toBe('02:05');
  });
});
