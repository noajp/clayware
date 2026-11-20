// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from '@/Function/notebook/pm/schema';
import { docToHtml, htmlToDoc } from '@/Function/notebook/pm/html';
import {
  appendSpoken,
  beginVoice,
  endVoice,
  placeVoiceFile,
  readMinutes,
  reanchorVoiceRegion,
  replaceMinutes,
  replaceSpoken,
  spokenChars,
  takeSpoken,
  textBeforeSpoken,
  voiceKey,
  voiceRegionPlugin,
} from '@/Function/notebook/pm/voiceRegion';

function makeView(html: string) {
  const state = EditorState.create({ schema, doc: htmlToDoc(html), plugins: [voiceRegionPlugin()] });
  return new EditorView(document.createElement('div'), { state });
}

const html = (view: EditorView) => docToHtml(view.state.doc);

describe('voice minutes in the Note', () => {
  it('writes words as spoken above the empty last line, and leaves the rest alone', () => {
    const view = makeView('<p>Agenda</p><p></p>');
    beginVoice(view);
    appendSpoken(view, 'we open the beta in december');
    appendSpoken(view, 'pricing is still open');
    expect(html(view)).toBe('<p>Agenda</p><p>we open the beta in december</p><p>pricing is still open</p><p></p>');
    expect(spokenChars(view.state)).toBe('we open the beta in december\npricing is still open'.length);
    expect(textBeforeSpoken(view.state)).toBe('Agenda');
  });

  it('folds the words it took above the section made from them, keeping what was spoken meanwhile', () => {
    const view = makeView('<p>Agenda</p>');
    beginVoice(view);
    appendSpoken(view, 'we open the beta in december');
    const taken = takeSpoken(view)!;
    appendSpoken(view, 'pricing is still open');
    expect(replaceSpoken(view, '<h2>Launch</h2><ul><li>Beta opens in December</li></ul>', taken)).toBe('done');
    expect(html(view)).toBe('<p>Agenda</p><pre data-lang="transcript">we open the beta in december</pre><h2>Launch</h2><ul><li>Beta opens in December</li></ul><p>pricing is still open</p>');
    expect(textBeforeSpoken(view.state)).toBe('Agenda\nLaunch\nBeta opens in December');
    expect(spokenChars(view.state)).toBe('pricing is still open'.length);
    expect(readMinutes(view.state)?.html).toBe('<h2>Launch</h2><ul><li>Beta opens in December</li></ul>');
  });

  it('leaves words alone when they were corrected after being taken', () => {
    const view = makeView('<p></p>');
    beginVoice(view);
    appendSpoken(view, 'the beta opens in decembar');
    const taken = takeSpoken(view)!;
    const region = voiceKey.getState(view.state)!;
    view.dispatch(view.state.tr.insertText('!', region.end - 1));
    expect(replaceSpoken(view, '<h2>Launch</h2>', taken)).toBe('changed');
    expect(html(view)).toBe('<p>the beta opens in decembar!</p><p></p>');
    expect(voiceKey.getState(view.state)?.cut).toBeNull();
  });

  it('folds words nothing was made of, all the same', () => {
    const view = makeView('<p></p>');
    beginVoice(view);
    appendSpoken(view, 'um, right');
    expect(replaceSpoken(view, '', takeSpoken(view)!)).toBe('done');
    expect(html(view)).toBe('<pre data-lang="transcript">um, right</pre><p></p>');
    expect(readMinutes(view.state)).toBeNull();
  });

  it('regroups the sections under their transcripts and keeps the words still waiting', () => {
    const view = makeView('<p>Agenda</p>');
    beginVoice(view);
    appendSpoken(view, 'one');
    expect(replaceSpoken(view, '<h2>A</h2><p>one</p>', takeSpoken(view)!)).toBe('done');
    appendSpoken(view, 'two');
    expect(replaceSpoken(view, '<h2>B</h2><p>two</p>', takeSpoken(view)!)).toBe('done');
    appendSpoken(view, 'three');
    const minutes = readMinutes(view.state)!;
    expect(minutes.plain).toBe(true);
    expect(minutes.html).toBe('<h2>A</h2><p>one</p><h2>B</h2><p>two</p>');
    expect(replaceMinutes(view, '<h2>A and B</h2><p>one, two</p>', minutes.key)).toBe('done');
    expect(html(view)).toBe('<p>Agenda</p><pre data-lang="transcript">one</pre><pre data-lang="transcript">two</pre><h2>A and B</h2><p>one, two</p><p>three</p>');
    expect(spokenChars(view.state)).toBe(5);
  });

  it('does not regroup minutes that were edited since they were read', () => {
    const view = makeView('<p></p>');
    beginVoice(view);
    appendSpoken(view, 'one');
    replaceSpoken(view, '<h2>A</h2><p>one</p>', takeSpoken(view)!);
    const minutes = readMinutes(view.state)!;
    view.dispatch(view.state.tr.insertText('X', 2));
    expect(replaceMinutes(view, '<h2>Z</h2>', minutes.key)).toBe('changed');
    expect(html(view)).toContain('one');
  });

  it('follows typing above the region and stops rewriting once ended', () => {
    const view = makeView('<p>Agenda</p>');
    beginVoice(view);
    appendSpoken(view, 'one');
    view.dispatch(view.state.tr.insert(0, schema.nodes.paragraph.create(null, schema.text('typed above'))));
    appendSpoken(view, 'two');
    expect(html(view)).toBe('<p>typed above</p><p>Agenda</p><p>one</p><p>two</p>');
    endVoice(view);
    expect(takeSpoken(view)).toBeNull();
    expect(html(view)).toBe('<p>typed above</p><p>Agenda</p><p>one</p><p>two</p>');
  });

  it('places the transcript file above what voice wrote, and replaces it when placed again', () => {
    const view = makeView('<p>Agenda</p>');
    beginVoice(view);
    appendSpoken(view, 'one');
    const file = (id: string) => schema.nodes.code_block.create({ lang: 'clayware' }, schema.text(`{"view":"file","id":"${id}"}`));
    placeVoiceFile(view, file('a'));
    appendSpoken(view, 'two');
    placeVoiceFile(view, file('b'));
    expect(html(view)).toBe('<p>Agenda</p><pre data-lang="clayware">{"view":"file","id":"b"}</pre><p>one</p><p>two</p>');
    expect(spokenChars(view.state)).toBe('one\ntwo'.length);
  });

  it('finds the region again after the whole document is laid down anew', () => {
    const before = htmlToDoc('<p>Agenda</p><h2>A</h2><p>one</p><p>spoken</p><p>tail</p>');
    const kids = Array.from({ length: before.childCount }, (_, i) => before.child(i));
    const sizes = kids.map((k) => k.nodeSize);
    const at = (i: number) => sizes.slice(0, i).reduce((a, b) => a + b, 0);
    const region = { start: at(1), mid: at(3), end: at(4), cut: null, interim: '' };
    // Someone else wrote a line at the top: every block comes back as it was, one further down.
    const added = schema.nodes.paragraph.create(null, schema.text('from someone else'));
    const after = schema.nodes.doc.create(null, [added, ...kids]);
    const next = reanchorVoiceRegion(region, before, after);
    expect(next.start).toBe(region.start + added.nodeSize);
    expect(next.mid).toBe(region.mid + added.nodeSize);
    expect(next.end).toBe(region.end + added.nodeSize);
  });
});
