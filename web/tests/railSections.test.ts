import { describe, expect, it } from 'vitest';
import { RAIL_SECTIONS, railSectionOf } from '@/Frame/railSections';

describe('railSectionOf', () => {
  it('puts each screen under its place on the rail', () => {
    expect(railSectionOf('ai')).toBe('assistant');
    expect(railSectionOf('inbox')).toBe('inbox');
    expect(['vision', 'strategy', 'phase', 'timeline'].map(railSectionOf)).toEqual(Array(4).fill('strategy'));
    expect(['domain-overview', 'objects', 'domain-elements', 'domains'].map(railSectionOf)).toEqual(Array(4).fill('execution'));
    expect(['team', 'workload'].map(railSectionOf)).toEqual(['team', 'team']);
  });
  it('leaves Settings and the tools under none of them', () => {
    expect(['settings', 'sustainment', 'my-elements', 'calendar', 'profile', 'note', 'tables', 'files', 'slides', 'nope'].map(railSectionOf)).toEqual(Array(10).fill(null));
  });
  it('lists Athena, Strategy, Execution, Team at the top and Inbox at the foot', () => {
    expect(RAIL_SECTIONS.filter((s) => !s.foot).map((s) => s.id)).toEqual(['assistant', 'strategy', 'execution', 'team']);
    expect(RAIL_SECTIONS.filter((s) => s.foot).map((s) => s.id)).toEqual(['inbox']);
  });
});
