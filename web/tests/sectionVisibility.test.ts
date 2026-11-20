import { describe, expect, it } from 'vitest';
import { toggledSections } from '@/Function/shared/sectionVisibility';

describe('toggledSections', () => {
  it('hides a shown section and shows a hidden one', () => {
    expect(toggledSections([], 'vision-artifacts')).toEqual(['vision-artifacts']);
    expect(toggledSections(['vision-artifacts', 'vision-portfolios'], 'vision-artifacts')).toEqual(['vision-portfolios']);
  });
});
