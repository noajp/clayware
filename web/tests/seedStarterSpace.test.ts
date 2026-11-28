import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every write the seed makes, in order, with the id it got back.
const { calls, record, reset } = vi.hoisted(() => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  let nextId = 0;
  const record = (kind: string) => async (input: Record<string, unknown>) => {
    const id = `${kind}-${++nextId}`;
    calls.push([kind, { ...input, id }]);
    return { id };
  };
  const reset = () => { calls.length = 0; nextId = 0; };
  return { calls, record, reset };
});

vi.mock('@/hooks/useSupabase', () => ({
  createDomain: vi.fn(record('domain')),
  createObject: vi.fn(record('object')),
  createElement: vi.fn(record('element')),
}));
vi.mock('@/hooks/visionData', () => ({
  createVision: vi.fn(async (name: string, description: string | null, spaceId: string) => record('vision')({ name, description, spaceId })),
}));
vi.mock('@/hooks/strategyData', () => ({
  createStrategy: vi.fn(async (input: Record<string, unknown>, objectIds: string[]) => record('portfolio')({ ...input, objectIds })),
  addStrategyChild: vi.fn(async (parent: string, child: string) => { calls.push(['child', { parent, child }]); }),
}));

import { seedStarterSpace } from '@/Function/space/seedStarterSpace';
import { starterContent } from '@/Function/space/starterContent';

describe('seedStarterSpace', () => {
  beforeEach(reset);

  it('writes the Vision before any Portfolio, and every Portfolio into it', async () => {
    await seedStarterSpace('space-1', 'user-1', 'en');
    const content = starterContent('en');

    const visions = calls.filter(([kind]) => kind === 'vision');
    expect(visions).toHaveLength(1);
    const [, vision] = visions[0];
    expect(vision).toMatchObject({ name: content.vision.name, description: content.vision.description, spaceId: 'space-1' });

    const firstPortfolio = calls.findIndex(([kind]) => kind === 'portfolio');
    expect(calls.findIndex(([kind]) => kind === 'vision')).toBeLessThan(firstPortfolio);

    const portfolios = calls.filter(([kind]) => kind === 'portfolio').map(([, p]) => p);
    const expectedCount = content.portfolios.reduce((n, g) => n + 1 + g.children.length, 0);
    expect(portfolios).toHaveLength(expectedCount);
    for (const p of portfolios) expect(p.vision_id).toBe(vision.id);
  });

  it('nests each Portfolio under its group, linked to the Objects it names', async () => {
    await seedStarterSpace('space-1', 'user-1', 'en');
    const content = starterContent('en');
    const objectIdByName = new Map(calls.filter(([k]) => k === 'object').map(([, o]) => [o.name, o.id]));
    const objectIdByKey = new Map(content.objects.map((o) => [o.key, objectIdByName.get(o.name)]));
    const portfolioByName = new Map(calls.filter(([k]) => k === 'portfolio').map(([, p]) => [p.name, p]));
    const children = calls.filter(([k]) => k === 'child').map(([, c]) => [c.parent, c.child]);

    for (const group of content.portfolios) {
      const parent = portfolioByName.get(group.name)!;
      expect(parent.objectIds).toEqual([]);
      for (const portfolio of group.children) {
        const child = portfolioByName.get(portfolio.name)!;
        expect(child.objectIds).toEqual(portfolio.objectKeys.map((key) => objectIdByKey.get(key)));
        expect(children).toContainEqual([parent.id, child.id]);
      }
    }
    // Groups sit at the top of the Vision: nothing holds them.
    const groupIds = content.portfolios.map((g) => portfolioByName.get(g.name)!.id);
    for (const [, child] of children) expect(groupIds).not.toContain(child);
  });
});
