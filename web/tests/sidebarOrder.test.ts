import { describe, expect, it } from 'vitest';
import { moveSidebarItem, normalizeSidebarOrder, SIDEBAR_ITEMS } from '@/Frame/sidebarOrder';

describe('normalizeSidebarOrder', () => {
  it('starts from Inbox, My Elements, Calendar', () => {
    expect(normalizeSidebarOrder(null)).toEqual(['inbox', 'my-elements', 'calendar']);
  });
  it('keeps a saved order, drops unknown and repeated rows, and places new ones by default', () => {
    expect(normalizeSidebarOrder(['calendar', 'ai', 'strategy', 'calendar'])).toEqual(['inbox', 'my-elements', 'calendar']);
    expect(normalizeSidebarOrder([...SIDEBAR_ITEMS].reverse())).toEqual([...SIDEBAR_ITEMS].reverse());
  });
});

describe('moveSidebarItem', () => {
  const order = [...SIDEBAR_ITEMS];
  it('moves a row before or after another', () => {
    expect(moveSidebarItem(order, 'calendar', 'inbox', 'before').slice(0, 2)).toEqual(['calendar', 'inbox']);
    expect(moveSidebarItem(order, 'inbox', 'calendar', 'after').at(-1)).toBe('inbox');
  });
  it('leaves the order alone on a drop onto itself', () => {
    expect(moveSidebarItem(order, 'inbox', 'inbox', 'before')).toEqual(order);
  });
});
