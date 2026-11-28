import { describe, expect, it } from 'vitest';

import {
  DEFINITION_SECTIONS, emptyDefinition, nextOrder, publishGaps, readDefinition, statusPatch, withSection,
} from '@/Function/sustainment/definition';
import { BUSINESS_TEMPLATES, definitionFromTemplate, say } from '@/Function/sustainment/businessTemplates';
import { parseItemIcon } from '@/Function/shared/itemIcon/itemIconValue';

describe('readDefinition', () => {
  it('reads a missing or malformed definition as empty', () => {
    for (const raw of [null, undefined, 'text', [], { sections: 'no' }]) {
      const def = readDefinition(raw);
      expect(def.intent).toBe('');
      expect(Object.values(def.sections).flat()).toEqual([]);
      expect(Object.keys(def.sections)).toEqual([...DEFINITION_SECTIONS]);
    }
  });
  it('keeps only non-empty text lines of the sections it knows', () => {
    const def = readDefinition({ intent: 'Bill customers', sections: { things: [' Invoice ', '', 3, null], other: ['x'] } });
    expect(def.intent).toBe('Bill customers');
    expect(def.sections.things).toEqual(['Invoice']);
    expect(Object.values(def.sections).flat()).toEqual(['Invoice']);
  });
});

describe('withSection', () => {
  it('replaces one section and drops blank lines, leaving the rest', () => {
    const base = withSection(emptyDefinition('x'), 'facts', ['Deposit']);
    const next = withSection(base, 'things', ['Account', '  ', ' Contact ']);
    expect(next.sections.things).toEqual(['Account', 'Contact']);
    expect(next.sections.facts).toEqual(['Deposit']);
    expect(base.sections.things).toEqual([]);
  });
});

describe('publishGaps', () => {
  it('asks for an intent, a thing, and a commitment or fact', () => {
    expect(publishGaps(emptyDefinition())).toHaveLength(3);
    const def = withSection(withSection(emptyDefinition('Bill customers'), 'things', ['Invoice']), 'facts', ['Invoice sent']);
    expect(publishGaps(def)).toEqual([]);
    expect(publishGaps(withSection(emptyDefinition('x'), 'things', ['Invoice']))).toEqual(['Add at least one commitment or fact.']);
  });
});

describe('nextOrder', () => {
  it('puts a new function after the last one', () => {
    expect(nextOrder([])).toBe(1);
    expect(nextOrder([{ order_index: 2 }, { order_index: null }])).toBe(3);
  });
});

describe('statusPatch', () => {
  it('stamps the time on publishing and clears it on going back to a draft', () => {
    const now = new Date('2026-11-28T03:00:00.000Z');
    expect(statusPatch('published', now)).toEqual({ status: 'published', published_at: '2026-11-28T03:00:00.000Z' });
    expect(statusPatch('draft', now)).toEqual({ status: 'draft', published_at: null });
  });
});

const FUNCTION_TEMPLATES = BUSINESS_TEMPLATES.flatMap((b) => b.functions);

describe('business templates', () => {
  it('gives every template and function a unique key and an icon the app can draw', () => {
    const keys = [...BUSINESS_TEMPLATES.map((b) => b.key), ...FUNCTION_TEMPLATES.map((f) => f.key)];
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of [...BUSINESS_TEMPLATES, ...FUNCTION_TEMPLATES]) expect(parseItemIcon(item.icon), item.key).not.toBeNull();
  });
  it('starts every function with a definition that can be published as it is', () => {
    for (const f of FUNCTION_TEMPLATES) {
      for (const locale of ['en', 'ja']) expect(publishGaps(definitionFromTemplate(f, locale)), `${f.key}:${locale}`).toEqual([]);
    }
  });
  it('writes the definition in Japanese for ja and English otherwise', () => {
    const f = FUNCTION_TEMPLATES.find((t) => t.key === 'accounting.invoicing')!;
    expect(definitionFromTemplate(f, 'ja').intent).toBe(f.intent.ja);
    expect(definitionFromTemplate(f, 'fr').intent).toBe(f.intent.en);
    expect(say(BUSINESS_TEMPLATES[0].name, 'ja')).toBe('顧客管理');
  });
});
