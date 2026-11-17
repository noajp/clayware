import type { Vision } from '@/types/database';

/** Pure. A Space's Visions in the order it keeps them: order_index, those
 *  without one after, then oldest first. */
export function visionsOfSpace(visions: readonly Vision[], spaceId: string | null): Vision[] {
  return visions.filter((v) => v.activity_space_id === spaceId)
    .sort((a, b) => (a.order_index ?? Infinity) - (b.order_index ?? Infinity) || a.created_at.localeCompare(b.created_at));
}
