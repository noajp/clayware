// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from '@/Function/notebook/pm/schema';
import { docToHtml, htmlToDoc } from '@/Function/notebook/pm/html';
import {
  appendSpoken,
  newVoiceAnchor,
  placeVoiceFile,
  readMinutes,
  replaceMinutes,
  replaceSpoken,
  spokenChars,
  takeSpoken,
  textBeforeSpoken,
  voiceRegionPlugin,
  type VoiceAnchor,
} from '@/Function/notebook/pm/voiceRegion';

function makeView(html: string) {
  const anchor: { current: VoiceAnchor | null } = { current: newVoiceAnchor() };
  const plugins = [voiceRegionPlugin(() => anchor.current)];
  const view = new EditorView(document.createElement('div'), { state: EditorState.create({ schema, doc: htmlToDoc(html), plugins }) });
  // A shared Note rebound to another's document: a new state, the same content.
  const rebind = () => view.updateState(EditorState.create({ schema, doc: htmlToDoc(docToHtml(view.state.doc)), plugins }));
  return { view, a: anchor.current!, anchor, rebind };
}

const html = (view: EditorView) => docToHtml(view.state.doc);
const spokenShown = (view: EditorView) => view.dom.querySelectorAll('.note-voice-spoken').length;

describe('voice minutes in the Note', () => {
  it('writes words as spoken above the empty last line, and leaves the rest alone', () => {
    const { view, a } = makeView('<p>Agenda</p><p></p>');
    appendSpoken(view, a, 'we open the beta in december');
    appendSpoken(view, a, 'pricing is still open');
    expect(html(view)).toBe('<p>Agenda</p><p>we open the beta in december</p><p>pricing is still open</p><p></p>');
    expect(spokenChars(view.state, a)).toBe('we open the beta in december\npricing is still open'.length);
    expect(textBeforeSpoken(view.state, a)).toBe('Agenda');
    expect(spokenShown(view)).toBe(2);
  });

  it('keeps finding the words after the Note is laid down anew', () => {
    const { view, a, rebind } = makeView('<p>Agenda</p>');
    appendSpoken(view, a, 'one');
    rebind();
    appendSpoken(view, a, 'two');
    expect(html(view)).toBe('<p>Agenda</p><p>one</p><p>two</p>');
    expect(spokenShown(view)).toBe(2);
    const taken = takeSpoken(view, a)!;
    rebind();
    expect(replaceSpoken(view, a, '<h2>Numbers</h2>', taken)).toBe('done');
    expect(html(view)).toBe('<p>Agenda</p><pre data-lang="transcript">one\ntwo</pre><h2>Numbers</h2>');
  });

  it('folds the words it took above the section made from them, keeping what was spoken meanwhile', () => {
    const { view, a } = makeView('<p>Agenda</p>');
    appendSpoken(view, a, 'we open the beta in december');
    const taken = takeSpoken(view, a)!;
    appendSpoken(view, a, 'pricing is still open');
    expect(replaceSpoken(view, a, '<h2>Launch</h2><ul><li>Beta opens in December</li></ul>', taken)).toBe('done');
    expect(html(view)).toBe('<p>Agenda</p><pre data-lang="transcript">we open the beta in december</pre><h2>Launch</h2><ul><li>Beta opens in December</li></ul><p>pricing is still open</p>');
    expect(spokenChars(view.state, a)).toBe('pricing is still open'.length);
    expect(textBeforeSpoken(view.state, a)).toBe('Agenda\nLaunch\nBeta opens in December');
    expect(readMinutes(view.state, a)?.html).toBe('<h2>Launch</h2><ul><li>Beta opens in December</li></ul>');
  });

  it('folds words nothing was made of, all the same', () => {
    const { view, a } = makeView('<p></p>');
    appendSpoken(view, a, 'um, right');
    expect(replaceSpoken(view, a, '', takeSpoken(view, a)!)).toBe('done');
    expect(html(view)).toBe('<pre data-lang="transcript">um, right</pre><p></p>');
    expect(readMinutes(view.state, a)).toBeNull();
  });

  it('leaves words alone when they were corrected after being taken', () => {
    const { view, a } = makeView('<p></p>');
    appendSpoken(view, a, 'the beta opens in decembar');
    const taken = takeSpoken(view, a)!;
    view.dispatch(view.state.tr.insertText('!', 1 + 'the beta opens in decembar'.length));
    expect(replaceSpoken(view, a, '<h2>Launch</h2>', taken)).toBe('changed');
    expect(html(view)).toBe('<p>the beta opens in decembar!</p><p></p>');
  });

  it('regroups the sections under their transcripts and keeps the words still waiting', () => {
    const { view, a } = makeView('<p>Agenda</p>');
    appendSpoken(view, a, 'one');
    expect(replaceSpoken(view, a, '<h2>A</h2><p>one</p>', takeSpoken(view, a)!)).toBe('done');
    appendSpoken(view, a, 'two');
    expect(replaceSpoken(view, a, '<h2>B</h2><p>two</p>', takeSpoken(view, a)!)).toBe('done');
    appendSpoken(view, a, 'three');
    const minutes = readMinutes(view.state, a)!;
    expect(minutes.plain).toBe(true);
    expect(minutes.html).toBe('<h2>A</h2><p>one</p><h2>B</h2><p>two</p>');
    expect(replaceMinutes(view, a, '<h2>A and B</h2><p>one, two</p>', minutes.key)).toBe('done');
    expect(html(view)).toBe('<p>Agenda</p><pre data-lang="transcript">one</pre><pre data-lang="transcript">two</pre><h2>A and B</h2><p>one, two</p><p>three</p>');
    expect(spokenChars(view.state, a)).toBe(5);
  });

  it('does not regroup minutes that were edited since they were read', () => {
    const { view, a } = makeView('<p></p>');
    appendSpoken(view, a, 'one');
    replaceSpoken(view, a, '<h2>A</h2><p>one</p>', takeSpoken(view, a)!);
    const minutes = readMinutes(view.state, a)!;
    view.dispatch(view.state.tr.insertText('X', 6));
    expect(replaceMinutes(view, a, '<h2>Z</h2>', minutes.key)).toBe('changed');
    expect(html(view)).toContain('one');
  });

  it('places the transcript file above the minutes, and replaces it when placed again', () => {
    const { view, a } = makeView('<p>Agenda</p>');
    appendSpoken(view, a, 'one');
    replaceSpoken(view, a, '<h2>A</h2>', takeSpoken(view, a)!);
    const file = (id: string) => schema.nodes.code_block.create({ lang: 'clayware' }, schema.text(`{"view":"file","id":"${id}"}`));
    placeVoiceFile(view, a, file('a'));
    appendSpoken(view, a, 'two');
    placeVoiceFile(view, a, file('b'));
    expect(html(view)).toBe('<p>Agenda</p><pre data-lang="clayware">{"view":"file","id":"b"}</pre><pre data-lang="transcript">one</pre><h2>A</h2><p>two</p>');
    expect(spokenChars(view.state, a)).toBe(3);
  });

  it('writes nothing as its own once recording has ended', () => {
    const { view, anchor } = makeView('<p>Agenda</p>');
    appendSpoken(view, anchor.current!, 'one');
    anchor.current = null;
    view.dispatch(view.state.tr);
    expect(spokenShown(view)).toBe(0);
    expect(html(view)).toBe('<p>Agenda</p><p>one</p>');
  });
});
