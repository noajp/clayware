import { describe, expect, it } from 'vitest';
import { RAIL_SECTIONS, railSectionOf } from '@/Frame/railSections';

describe('railSectionOf', () => {
  it('puts each screen under its place on the rail', () => {
    expect(['inbox', 'ai', 'my-elements', 'calendar', 'profile'].map(railSectionOf)).toEqual(Array(5).fill('assistant'));
    expect(['vision', 'strategy', 'phase', 'timeline'].map(railSectionOf)).toEqual(Array(4).fill('strategy'));
    expect(['domain-overview', 'objects', 'domain-elements', 'domains'].map(railSectionOf)).toEqual(Array(4).fill('execution'));
    expect(['team', 'workload'].map(railSectionOf)).toEqual(['team', 'team']);
  });
  it('leaves Settings and the tools under none of them', () => {
    expect(['settings', 'sustainment', 'note', 'tables', 'files', 'slides', 'nope'].map(railSectionOf)).toEqual(Array(7).fill(null));
  });
  it('lists Athena, Strategy, Execution, Team in that order', () => {
    expect(RAIL_SECTIONS.map((s) => s.id)).toEqual(['assistant', 'strategy', 'execution', 'team']);
  });
});
