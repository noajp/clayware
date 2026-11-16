import { describe, expect, it } from 'vitest';
import { readSvgIcon, storedSvgIcon } from '@/Function/shared/itemIcon/svgIcon';
import { parseItemIcon } from '@/Function/shared/itemIcon/itemIconValue';

const ok = (src: string) => {
  const r = readSvgIcon(src);
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.value;
};

describe('readSvgIcon', () => {
  it('keeps a line icon as it is drawn, in one plain form', () => {
    const v = ok('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>');
    expect(v).toBe('svg:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>');
  });

  it('drops scripts, handlers, links, styles and everything inside what it drops', () => {
    const v = ok(`<?xml version="1.0"?><!DOCTYPE svg><svg viewBox="0 0 16 16" onload="alert(1)">
      <script>alert(1)</script><style>path{fill:red}</style>
      <a href="javascript:alert(1)"><path d="M0 0h4v4z"/></a>
      <foreignObject><div>x</div></foreignObject>
      <image href="https://example.com/x.png"/><use href="#p"/>
      <path id="p" d="M1 1L15 15" onclick="x()" data-x="1" fill="url(#g)"/></svg>`);
    expect(v).not.toMatch(/script|onload|onclick|href|style|image|use|foreign|data-x|url|javascript/i);
    expect(v).toBe('svg:<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 1L15 15" fill="currentColor"/></svg>');
  });

  it('turns every colour into currentColor, keeps none, and reads style="" paint', () => {
    const v = ok('<svg viewBox="0 0 10 10"><rect width="10" height="10" style="fill:#ff0000;stroke:none;opacity:2"/><circle cx="5" cy="5" r="2" fill="none" stroke="rgb(1,2,3)"/></svg>');
    expect(v).toContain('<rect width="10" height="10" fill="currentColor" stroke="none" opacity="1"/>');
    expect(v).toContain('<circle cx="5" cy="5" r="2" fill="none" stroke="currentColor"/>');
  });

  it('shortens long decimals and reads a viewBox from width and height', () => {
    const v = ok('<svg width="20px" height="20"><path d="M1.23456 2.98765L3.333333 4"/></svg>');
    expect(v).toBe('svg:<svg viewBox="0 0 20 20" fill="currentColor"><path d="M1.23 2.99L3.33 4"/></svg>');
  });

  it('refuses what is not a drawing', () => {
    expect(readSvgIcon('').ok).toBe(false);
    expect(readSvgIcon('<html><body>hi</body></html>')).toEqual({ ok: false, reason: 'invalid' });
    expect(readSvgIcon('<svg viewBox="0 0 24 24"><text>hi</text></svg>')).toEqual({ ok: false, reason: 'empty' });
    expect(readSvgIcon('<svg viewBox="0 0 24 24"><path d="M0 0" ')).toEqual({ ok: false, reason: 'invalid' });
    expect(readSvgIcon('<svg viewBox="0 0 24 24"><path d="M0 0 expression(alert(1))"/></svg>')).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses a drawing too large to be an icon', () => {
    const paths = Array.from({ length: 250 }, (_, i) => `<path d="M${i} 0L${i} 24L${i + 0.5} 12L${i} 18L${i + 3} 9"/>`).join('');
    const r = readSvgIcon(`<svg viewBox="0 0 24 24">${paths}</svg>`);
    expect(r).toEqual({ ok: false, reason: 'too-large' });
  });

  it('reads its own output back unchanged, and stored values go through the same rules', () => {
    const v = ok('<svg viewBox="0 0 24 24"><g transform="translate(2 2)"><path d="M0 0h20"/></g></svg>');
    expect(ok(v.slice(4))).toBe(v);
    expect(storedSvgIcon(v)?.children[0].tag).toBe('g');
    expect(storedSvgIcon('svg:<svg viewBox="0 0 24 24"><script>x</script></svg>')).toBeNull();
    expect(parseItemIcon(v)).toEqual({ kind: 'svg', value: v });
    expect(parseItemIcon('svg:<p>no</p>')).toBeNull();
  });
});
