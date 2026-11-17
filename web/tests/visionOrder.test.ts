import { describe, expect, it } from 'vitest';
import { visionsOfSpace } from '@/Function/strategy/visionOrder';
import type { Vision } from '@/types/database';

const v = (id: string, space: string, order: number | null, created: string): Vision => ({
  id, activity_space_id: space, name: id, description: null, icon: null, color: null, privacy: 'workspace',
  order_index: order, created_by: null, created_at: created, updated_at: created,
});

describe('visionsOfSpace', () => {
  it('keeps only the Space’s Visions, by order, unordered ones after, oldest first', () => {
    const all = [
      v('late', 's1', null, '2026-02-01'), v('b', 's1', 2, '2026-01-01'), v('other', 's2', 0, '2026-01-01'),
      v('a', 's1', 1, '2026-03-01'), v('early', 's1', null, '2026-01-15'),
    ];
    expect(visionsOfSpace(all, 's1').map((x) => x.id)).toEqual(['a', 'b', 'early', 'late']);
  });
  it('shows nothing without a Space', () => {
    expect(visionsOfSpace([v('a', 's1', 0, '2026-01-01')], null)).toEqual([]);
  });
});
