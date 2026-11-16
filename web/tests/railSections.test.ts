import { describe, expect, it } from 'vitest';
import { RAIL_SECTIONS, railSectionOf } from '@/Frame/railSections';

describe('railSectionOf', () => {
  it('puts each screen under its place on the rail', () => {
    expect(['inbox', 'ai', 'my-elements', 'calendar', 'profile'].map(railSectionOf)).toEqual(Array(5).fill('home'));
    expect(['strategy', 'phase', 'timeline'].map(railSectionOf)).toEqual(Array(3).fill('execution'));
    expect(['domain-overview', 'objects', 'domain-elements', 'domains'].map(railSectionOf)).toEqual(Array(4).fill('execution'));
    expect(['team', 'workload'].map(railSectionOf)).toEqual(['team', 'team']);
  });
  it('leaves Settings and the tools under none of them', () => {
    expect(['settings', 'note', 'tables', 'files', 'slides', 'nope'].map(railSectionOf)).toEqual(Array(6).fill(null));
  });
  it('lists Home, Execution, Team in that order', () => {
    expect(RAIL_SECTIONS.map((s) => s.id)).toEqual(['home', 'execution', 'team']);
  });
});
