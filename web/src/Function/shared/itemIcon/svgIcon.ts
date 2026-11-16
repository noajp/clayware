// An icon someone uploaded as SVG, or asked Athena to draw.
//
// What is kept is only a drawing: the shapes (path, circle, ellipse, rect,
// line, polyline, polygon, in groups) and how they are stroked and filled.
// Everything else — scripts, styles, links, images, text, references to other
// elements, unknown attributes — is dropped, and every colour becomes
// `currentColor`, so the icon takes the colour chosen for it like the
// product's own icons do. The kept drawing is written back out in one plain
// form (`svg:<svg viewBox="…">…</svg>`) and read again by the same rules
// when it is drawn: what is stored is never trusted as markup, and the app
// draws it with React elements, not innerHTML.
//
// Pure, so the same rules hold in the picker, on every surface and in tests.

export const SVG_PREFIX = 'svg:';
/** The most a stored icon may be: enough for a detailed icon, not a picture. */
const MAX_SVG_ICON = 8000;
/** The most of a file that is read at all. */
export const MAX_SVG_SOURCE = 200_000;
const MAX_NODES = 300;

export interface SvgNode { tag: string; attrs: [string, string][]; children: SvgNode[] }
export interface SvgIcon { viewBox: string; attrs: [string, string][]; children: SvgNode[] }

export type SvgCheck = { ok: true; value: string; icon: SvgIcon } | { ok: false; reason: 'empty' | 'invalid' | 'too-large' };

const SHAPES: Record<string, string[]> = {
  g: [],
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
};
const PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform'];
const ENUMS: Record<string, string[]> = {
  'stroke-linecap': ['butt', 'round', 'square'],
  'stroke-linejoin': ['miter', 'round', 'bevel', 'arcs', 'miter-clip'],
  'fill-rule': ['nonzero', 'evenodd'],
  'clip-rule': ['nonzero', 'evenodd'],
};

/** Numbers written with at most two decimals: exported drawings carry far more than an icon shows. */
const shorten = (v: string) => v.replace(/-?\d*\.\d+(?:e-?\d+)?/gi, (n) => {
  const r = Math.round(Number(n) * 100) / 100;
  return Number.isFinite(r) ? String(r) : n;
});

function cleanValue(name: string, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (name === 'fill' || name === 'stroke') {
    if (v === 'none' || v === 'transparent') return 'none';
    return 'currentColor';
  }
  if (ENUMS[name]) return ENUMS[name].includes(v) ? v : null;
  if (name === 'd') return /^[MmZzLlHhVvCcSsQqTtAa\d\s,.eE+-]+$/.test(v) ? shorten(v.replace(/\s+/g, ' ')) : null;
  if (name === 'points') return /^[\d\s,.eE+-]+$/.test(v) ? shorten(v.replace(/\s+/g, ' ')) : null;
  if (name === 'transform') {
    if (!/^[a-zA-Z\d\s,.()eE+-]+$/.test(v)) return null;
    const fns = v.match(/[a-zA-Z]+(?=\s*\()/g) ?? [];
    return fns.every((f) => ['matrix', 'translate', 'scale', 'rotate', 'skewX', 'skewY'].includes(f)) ? shorten(v.replace(/\s+/g, ' ')) : null;
  }
  // Every other attribute is one number (a length in px at most).
  const n = v.replace(/px$/, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(n)) return null;
  if (name.endsWith('opacity')) return String(Math.max(0, Math.min(1, Number(n))));
  return shorten(n);
}

/** The attributes kept on an element: its own geometry and the paint, from
 *  attributes and from a style="" of the same properties. */
function cleanAttrs(tag: string, raw: Record<string, string>): [string, string][] {
  const merged: Record<string, string> = { ...raw };
  if (raw.style) {
    for (const decl of raw.style.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) merged[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
    }
  }
  const allowed = [...(SHAPES[tag] ?? []), ...PAINT];
  const out: [string, string][] = [];
  for (const name of allowed) {
    if (merged[name] === undefined) continue;
    const v = cleanValue(name, merged[name]);
    if (v !== null) out.push([name, v]);
  }
  return out;
}

interface Token { kind: 'open' | 'close'; tag: string; attrs: Record<string, string>; selfClosing: boolean }

/** The tags of a piece of XML in order; comments, declarations, CDATA and text left out. */
function tokens(src: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); if (e < 0) return null; i = e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); if (e < 0) return null; i = e + 3; continue; }
    if (src[lt + 1] === '?' || src[lt + 1] === '!') { const e = src.indexOf('>', lt); if (e < 0) return null; i = e + 1; continue; }
    // A tag runs to the first '>' outside quotes.
    let j = lt + 1;
    let quote: string | null = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === quote) quote = null; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break;
    }
    if (j >= src.length) return null;
    const body = src.slice(lt + 1, j).trim();
    i = j + 1;
    if (body.startsWith('/')) { out.push({ kind: 'close', tag: body.slice(1).trim().toLowerCase().replace(/^.*:/, ''), attrs: {}, selfClosing: false }); continue; }
    const selfClosing = body.endsWith('/');
    const inner = selfClosing ? body.slice(0, -1) : body;
    const m = /^([A-Za-z][\w:.-]*)/.exec(inner);
    if (!m) return null;
    const attrs: Record<string, string> = {};
    const re = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    const rest = inner.slice(m[1].length);
    while ((a = re.exec(rest))) attrs[a[1].toLowerCase()] = (a[3] ?? a[4] ?? '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    out.push({ kind: 'open', tag: m[1].toLowerCase().replace(/^.*:/, ''), attrs, selfClosing });
  }
  return out;
}

/** Pure. The drawing kept from SVG source, or why there is none. */
export function readSvgIcon(source: string): SvgCheck {
  const src = source.trim();
  if (!src) return { ok: false, reason: 'empty' };
  if (src.length > MAX_SVG_SOURCE) return { ok: false, reason: 'too-large' };
  const list = tokens(src);
  if (!list) return { ok: false, reason: 'invalid' };
  const rootAt = list.findIndex((t) => t.kind === 'open' && t.tag === 'svg');
  if (rootAt < 0) return { ok: false, reason: 'invalid' };
  const root = list[rootAt];

  let viewBox = (root.attrs.viewbox ?? '').trim().replace(/[\s,]+/g, ' ');
  if (!/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(viewBox)) {
    const w = parseFloat(root.attrs.width ?? ''), h = parseFloat(root.attrs.height ?? '');
    if (!(w > 0 && h > 0)) return { ok: false, reason: 'invalid' };
    viewBox = `0 0 ${w} ${h}`;
  }
  viewBox = shorten(viewBox);
  const rootAttrs = cleanAttrs('g', root.attrs).filter(([n]) => n !== 'transform');
  // An SVG fills black when it says nothing: here it fills with the icon's colour.
  if (!rootAttrs.some(([n]) => n === 'fill')) rootAttrs.unshift(['fill', 'currentColor']);

  const top: SvgNode = { tag: 'svg', attrs: [], children: [] };
  const stack: { node: SvgNode | null; tag: string }[] = [{ node: top, tag: 'svg' }];
  let count = 0;
  if (!root.selfClosing) {
    for (let k = rootAt + 1; k < list.length; k++) {
      const t = list[k];
      if (t.kind === 'close') {
        // Close back to the matching open tag; a stray close is ignored.
        const at = stack.map((s) => s.tag).lastIndexOf(t.tag);
        if (at <= 0) { if (t.tag === 'svg' && at === 0) break; continue; }
        stack.length = at;
        continue;
      }
      const parent = stack[stack.length - 1].node;
      // Inside something dropped, everything is dropped with it.
      const kept = parent && t.tag in SHAPES ? { tag: t.tag, attrs: cleanAttrs(t.tag, t.attrs), children: [] } as SvgNode : null;
      if (kept) {
        if (++count > MAX_NODES) return { ok: false, reason: 'too-large' };
        parent!.children.push(kept);
      }
      if (!t.selfClosing) stack.push({ node: kept, tag: t.tag });
    }
  }
  const children = prune(top.children);
  if (!children.length) return { ok: false, reason: 'empty' };
  const icon: SvgIcon = { viewBox, attrs: rootAttrs, children };
  const value = SVG_PREFIX + writeSvg(icon);
  if (value.length > MAX_SVG_ICON) return { ok: false, reason: 'too-large' };
  return { ok: true, value, icon };
}

/** Shapes without what draws them (a path with no d) and empty groups go. */
function prune(nodes: SvgNode[]): SvgNode[] {
  return nodes.flatMap((n) => {
    if (n.tag === 'g') {
      const children = prune(n.children);
      return children.length ? [{ ...n, children }] : [];
    }
    const need = SHAPES[n.tag];
    return need.every((a) => a === 'rx' || a === 'ry' || a === 'x' || a === 'y' || a === 'cx' || a === 'cy' || a === 'x1' || a === 'y1' || a === 'x2' || a === 'y2' || n.attrs.some(([k]) => k === a)) ? [n] : [];
  });
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const attrText = (attrs: [string, string][]) => attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
function writeNode(n: SvgNode): string {
  return n.children.length ? `<${n.tag}${attrText(n.attrs)}>${n.children.map(writeNode).join('')}</${n.tag}>` : `<${n.tag}${attrText(n.attrs)}/>`;
}
function writeSvg(icon: SvgIcon): string {
  return `<svg viewBox="${icon.viewBox}"${attrText(icon.attrs)}>${icon.children.map(writeNode).join('')}</svg>`;
}

const cache = new Map<string, SvgIcon | null>();
/** Pure (cached). A stored `svg:` icon read back under the same rules, or null. */
export function storedSvgIcon(stored: string): SvgIcon | null {
  if (!stored.startsWith(SVG_PREFIX)) return null;
  const hit = cache.get(stored);
  if (hit !== undefined) return hit;
  const check = readSvgIcon(stored.slice(SVG_PREFIX.length));
  const icon = check.ok ? check.icon : null;
  if (cache.size > 500) cache.clear();
  cache.set(stored, icon);
  return icon;
}

/** An attribute's name as React writes it (stroke-width → strokeWidth). */
export function reactAttr(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
