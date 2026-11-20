import { describe, expect, it } from 'vitest';

const imgs = await import(new URL('../../supabase/functions/_shared/toolResultImages.ts', import.meta.url).pathname);
const loop = await import(new URL('../../supabase/functions/_shared/agentLoop.ts', import.meta.url).pathname);

const { toolResultContent, toolResultText, stripToolResultImages, stripPendingImages, IMAGES_NOT_PASSED, IMAGE_PLACEHOLDER } = imgs;
const png = { mimeType: 'image/png', data: 'iVBORw0KGgo=' };

describe('toolResultContent', () => {
  it('keeps plain text when there are no pictures', () => {
    expect(toolResultContent('{"a":1}', undefined, true)).toBe('{"a":1}');
    expect(toolResultContent('{"a":1}', [], true)).toBe('{"a":1}');
  });

  it('puts text first, then one image block per picture, when the model takes pictures', () => {
    expect(toolResultContent('{"name":"x.png"}', [png], true)).toEqual([
      { type: 'text', text: '{"name":"x.png"}' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.data } },
    ]);
  });

  it('drops pictures and says so when the model cannot take them', () => {
    const out = toolResultContent('{"name":"x.png"}', [png, png], false);
    expect(typeof out).toBe('string');
    expect(out).toContain('{"name":"x.png"}');
    expect(out).toContain(IMAGES_NOT_PASSED(2));
    expect(out).not.toContain(png.data);
  });

  it('counts a type the API does not accept as not passed', () => {
    const out = toolResultContent('t', [png, { mimeType: 'image/svg+xml', data: 'PHN2Zz4=' }], true);
    expect(Array.isArray(out)).toBe(true);
    expect(out[0]).toEqual({ type: 'text', text: `t\n${IMAGES_NOT_PASSED(1)}` });
    expect(out).toHaveLength(2);
  });
});

describe('toolResultText', () => {
  it('reads the text of either form', () => {
    expect(toolResultText('plain')).toBe('plain');
    expect(toolResultText(toolResultContent('hello', [png], true))).toBe('hello');
  });
});

describe('stripToolResultImages', () => {
  const withImage = {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 't1', content: toolResultContent('meta', [png], true) }],
  };
  const plain = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't0', content: 'ok' }] };
  const assistant = { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'readFile', input: {} }] };

  it('replaces each image with a placeholder and keeps no base64', () => {
    const out = stripToolResultImages([assistant, withImage]);
    expect(JSON.stringify(out)).not.toContain(png.data);
    expect(out[1].content[0].content).toEqual([
      { type: 'text', text: 'meta' },
      { type: 'text', text: IMAGE_PLACEHOLDER('image/png') },
    ]);
  });

  it('never mutates the messages the turn still holds', () => {
    const msgs = [assistant, withImage];
    stripToolResultImages(msgs);
    expect(JSON.stringify(msgs)).toContain(png.data);
  });

  it('returns the same objects where nothing changed', () => {
    const msgs = [assistant, plain, { role: 'user', content: 'hi' }];
    const out = stripToolResultImages(msgs);
    out.forEach((m: unknown, i: number) => expect(m).toBe(msgs[i]));
  });
});

describe('stripPendingImages', () => {
  it('strips the partial results a pending approval carries', () => {
    const pending = {
      calls: [{ id: 'w1', name: 'send', input: {} }],
      partial: [{ type: 'tool_result', tool_use_id: 't1', content: toolResultContent('meta', [png], true) }],
    };
    const out = stripPendingImages(pending);
    expect(JSON.stringify(out)).not.toContain(png.data);
    expect(out.calls).toBe(pending.calls);
    expect(JSON.stringify(pending)).toContain(png.data);
  });
});

describe('runLoop passes pictures by acceptsImages', () => {
  const turns = [
    { content: [{ type: 'tool_use', id: 'r1', name: 'readFile', input: { id: 'f' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: '猫の写真です' }], stop_reason: 'end_turn' },
  ];
  const run = async (acceptsImages: boolean | undefined) => {
    let i = 0;
    const sent: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: { messages: any[]; turns: number; nudges: number } = { messages: [{ role: 'user', content: '画像を見て' }], turns: 0, nudges: 0 };
    await loop.runLoop(state, {
      callModel: async (messages: unknown[]) => { sent.push(messages); return { ...turns[i++], usage: {} }; },
      kindOf: () => 'board',
      needsApproval: () => false,
      execute: async () => ({ content: '{"name":"cat.png"}', images: [png] }),
      onUsage: async () => {},
      budgetExceeded: () => false,
      cancelled: async () => false,
      ...(acceptsImages === undefined ? {} : { acceptsImages }),
    }, { maxTurnsThisCall: 5, maxTotalTurns: 5, deadline: Date.now() + 60_000 });
    return state.messages[2].content[0].content;
  };

  it('sends image blocks when the model takes them', async () => {
    const c = await run(true);
    expect(c[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.data } });
  });

  it('sends text with a note otherwise, and by default', async () => {
    for (const v of [false, undefined]) {
      const c = await run(v);
      expect(typeof c).toBe('string');
      expect(c).toContain(IMAGES_NOT_PASSED(1));
    }
  });
});
