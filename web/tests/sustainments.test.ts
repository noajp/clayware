import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { NOT_ALLOWED, assertChanged, isMissingTable, nextSustainmentOrder } from '@/hooks/useSustainments';

describe('nextSustainmentOrder', () => {
  it('puts a new Sustainment after the last one', () => {
    expect(nextSustainmentOrder([])).toBe(1);
    expect(nextSustainmentOrder([{ order_index: 1 }, { order_index: 3.5 }, { order_index: null }])).toBe(4.5);
  });
});

describe('isMissingTable', () => {
  it('reads a database without the sustainments table as having none', () => {
    expect(isMissingTable({ code: 'PGRST205', message: "Could not find the table 'public.sustainments' in the schema cache" })).toBe(true);
    expect(isMissingTable({ code: '42P01', message: 'relation "public.sustainments" does not exist' })).toBe(true);
  });
  it('keeps every other failure an error', () => {
    expect(isMissingTable(null)).toBe(false);
    expect(isMissingTable({ code: '42501', message: 'permission denied for table sustainments' })).toBe(false);
  });
});

describe('assertChanged', () => {
  it('reads a change that touched no row as refused', () => {
    expect(() => assertChanged([])).toThrow(NOT_ALLOWED);
    expect(() => assertChanged(null)).toThrow(NOT_ALLOWED);
  });
  it('lets a change that touched a row through', () => {
    expect(() => assertChanged([{ id: 'a' }])).not.toThrow();
  });
});
