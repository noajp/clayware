import { describe, expect, it } from 'vitest';

// MCP beyond tools: pictures in results, clayware:// resources, prompts,
// and turning a Note's HTML into Markdown.
const protocol = await import(new URL('../../supabase/functions/clayware-mcp/protocol.ts', import.meta.url).pathname);
const resources = await import(new URL('../../supabase/functions/clayware-mcp/resources.ts', import.meta.url).pathname);
const prompts = await import(new URL('../../supabase/functions/clayware-mcp/prompts.ts', import.meta.url).pathname);
const { mcpTools } = await import(new URL('../../supabase/functions/clayware-mcp/tools.ts', import.meta.url).pathname);
const text = await import(new URL('../../supabase/functions/_shared/readableText.ts', import.meta.url).pathname);
const context = await import(new URL('../../supabase/functions/_shared/contextTools.ts', import.meta.url).pathname);
const files = await import(new URL('../../supabase/functions/_shared/fileTools.ts', import.meta.url).pathname);

const UUID = '93fb2fb0-a7a1-434e-9211-af4db709a247';
type Result = { ok: true; data: unknown; images?: { mimeType: string; data: string }[] } | { ok: false; error: string };

function host(answer: (name: string, args: Record<string, unknown>) => Result, access: 'read' | 'read_write' = 'read_write') {
  const calls: [string, Record<string, unknown>][] = [];
  return {
    calls,
    tools: mcpTools(access),
    call: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return answer(name, args); },
  };
}

describe('pictures in tool results', () => {
  it('follows the JSON text with each picture as image content', () => {
    expect(protocol.toCallResult({ ok: true, data: { name: 'shot.png' }, images: [{ mimeType: 'image/png', data: 'AAA' }] })).toEqual({
      content: [{ type: 'text', text: JSON.stringify({ name: 'shot.png' }, null, 2) }, { type: 'image', data: 'AAA', mimeType: 'image/png' }],
      isError: false,
    });
  });

  it('knows which pictures a model can be shown, and encodes bytes as base64', () => {
    expect(files.isViewableImage('image/png')).toBe(true);
    expect(files.isViewableImage('image/svg+xml')).toBe(false);
    expect(files.isViewableImage(null)).toBe(false);
    expect(files.toBase64(new TextEncoder().encode('hello'))).toBe('aGVsbG8=');
    const big = new Uint8Array(100_000).fill(65);
    expect(atob(files.toBase64(big)).length).toBe(100_000);
  });
});

describe('clayware:// resources', () => {
  it('parses a record URI and refuses anything else', () => {
    expect(resources.parseResourceUri('clayware://element/ELE_OBJ-012')).toEqual({ kind: 'element', id: 'ELE_OBJ-012' });
    expect(resources.parseResourceUri('clayware://table/x')).toBeNull();
    expect(resources.parseResourceUri('https://clayware.app/?element=x')).toBeNull();
  });

  it('reads a record through its read tool, a Note as Markdown and a picture as a blob', async () => {
    const h = host((name) => name === 'readNote'
      ? { ok: true, data: { name: 'Plan', markdown: '- a' } }
      : name === 'readFile'
        ? { ok: true, data: { image: true }, images: [{ mimeType: 'image/png', data: 'QQ==' }] }
        : { ok: true, data: { id: UUID } });
    const el = await handle(h, 'resources/read', { uri: `clayware://object/${UUID}` });
    expect(el.result.contents[0]).toMatchObject({ mimeType: 'application/json' });
    expect(h.calls[0]).toEqual(['getObject', { id: UUID }]);
    const note = await handle(h, 'resources/read', { uri: `clayware://note/${UUID}` });
    expect(note.result.contents[0]).toEqual({ uri: `clayware://note/${UUID}`, mimeType: 'text/markdown', text: '# Plan\n\n- a' });
    const pic = await handle(h, 'resources/read', { uri: `clayware://file/${UUID}` });
    expect(pic.result.contents[0]).toEqual({ uri: `clayware://file/${UUID}`, mimeType: 'image/png', blob: 'QQ==' });
  });

  it('answers a missing record with an error, and lists the templates and the visible Objects', async () => {
    const h = host((name) => name === 'listObjects' ? { ok: true, data: [{ id: UUID, name: '修正点', prefix: 'OBJ' }] } : { ok: false, error: 'Object not found' });
    const missing = await handle(h, 'resources/read', { uri: `clayware://object/${UUID}` });
    expect(missing.error).toMatchObject({ code: protocol.RPC.INVALID_PARAMS, message: 'Object not found' });
    const list = await handle(h, 'resources/list', {});
    expect(list.result.resources).toEqual([{ uri: `clayware://object/${UUID}`, name: '修正点', title: '修正点 (OBJ)', mimeType: 'application/json' }]);
    const templates = await handle(h, 'resources/templates/list', {});
    expect(templates.result.resourceTemplates.map((t: { uriTemplate: string }) => t.uriTemplate)).toContain('clayware://element/{id}');
  });
});

describe('prompts', () => {
  it('offers the writing prompt only to a connection that can write', () => {
    const rw = prompts.listPrompts(mcpTools('read_write')).map((p: { name: string }) => p.name);
    const ro = prompts.listPrompts(mcpTools('read')).map((p: { name: string }) => p.name);
    expect(rw).toEqual(['work-on-element', 'review-object', 'my-work']);
    expect(ro).toEqual(['review-object', 'my-work']);
  });

  it('fills the arguments into the opening message and refuses a missing one', async () => {
    const h = host(() => ({ ok: true, data: null }));
    const got = await handle(h, 'prompts/get', { name: 'work-on-element', arguments: { element: 'ELE_OBJ-012' } });
    expect(got.result.messages[0].content.text).toContain('ELE_OBJ-012');
    const missing = await handle(h, 'prompts/get', { name: 'work-on-element', arguments: {} });
    expect(missing.error.code).toBe(protocol.RPC.INVALID_PARAMS);
  });
});

describe('readable text', () => {
  it('finds the files placed in a text, each once', () => {
    const body = `前\n\n\`\`\`clayware\n{"view":"file","id":"${UUID}"}\n\`\`\`\n\n\`\`\`clayware\n{"view":"table","id":"x"}\n\`\`\`\n\`\`\`clayware\n{"view":"file","id":"${UUID}"}\n\`\`\``;
    expect(text.placedFileIds(body)).toEqual([UUID]);
    expect(text.placedFileIds('```clayware\nnot json\n```')).toEqual([]);
    expect(text.placedFileIds(null)).toEqual([]);
  });

  it('turns a Note page into Markdown, keeping checklists and file blocks', () => {
    const html = '<h2>計画</h2><p>本文 <strong>太字</strong> &amp; <a href="https://x.test">リンク</a></p>'
      + '<ul data-checklist="true"><li data-checked="true"><p>済み</p></li><li data-checked="false"><p>未</p></li></ul>'
      + `<pre data-lang="clayware">{"view":"file","id":"${UUID}"}</pre>`;
    const md = text.htmlToMarkdown(html);
    expect(md).toContain('## 計画');
    expect(md).toContain('本文 **太字** & [リンク](https://x.test)');
    expect(md).toContain('- [x] 済み');
    expect(md).toContain('- [ ] 未');
    expect(text.placedFileIds(md)).toEqual([UUID]);
  });

  it('builds the address that opens a record in the app', () => {
    expect(text.appLink(text.appOrigin(undefined), 'element', UUID)).toBe(`https://clayware.app/?element=${UUID}`);
    expect(text.appOrigin('https://staging.example.test/')).toBe('https://staging.example.test');
  });
});

describe('context tool helpers', () => {
  it('clamps limits and offsets, escapes search wildcards and names Note kinds', () => {
    expect(context.clampLimit(undefined, 50, 200)).toBe(50);
    expect(context.clampLimit(999, 50, 200)).toBe(200);
    expect(context.clampLimit(0, 50, 200)).toBe(1);
    expect(context.offsetOf(-3)).toBe(0);
    expect(context.offsetOf(12.7)).toBe(12);
    expect(context.likePattern('50%_off')).toBe('%50\\%\\_off%');
    expect(context.noteKind('folder')).toBe('notebook');
    expect(context.noteKind('section')).toBe('section');
    expect(context.noteKind('file')).toBe('page');
  });
});

async function handle(h: ReturnType<typeof host>, method: string, params: Record<string, unknown>) {
  const res = await protocol.handleBody(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), h);
  // deno-lint-ignore no-explicit-any
  return res.body as any;
}
