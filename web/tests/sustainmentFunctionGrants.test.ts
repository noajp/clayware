import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Who may publish or remove a function is decided from `created_by`, so the
// browser must not be able to rewrite it (nor move a function to another
// Sustainment or Space). The last migration that grants update on
// sustainment_functions must name its columns, and every column the hook
// writes must be among them.

const root = new URL('../../', import.meta.url).pathname;
const migrationsDir = join(root, 'supabase/migrations');

function lastUpdateGrant(): string {
  let last = '';
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    for (const m of sql.matchAll(/grant ([^;']*?) on public\.sustainment_functions to authenticated/gi)) {
      if (/update/i.test(m[1])) last = m[1];
    }
  }
  return last;
}

describe('sustainment_functions update grant', () => {
  const grant = lastUpdateGrant();
  const columns = (grant.match(/update \(([^)]+)\)/i)?.[1] ?? '').split(',').map((c) => c.trim()).filter(Boolean);

  it('names its columns, and leaves out who made it and where it belongs', () => {
    expect(columns.length).toBeGreaterThan(0);
    for (const locked of ['created_by', 'activity_space_id', 'sustainment_id', 'id']) expect(columns).not.toContain(locked);
  });

  it('covers every column the function page writes', () => {
    for (const written of ['name', 'icon', 'differences', 'definition', 'status', 'published_at']) expect(columns).toContain(written);
  });
});
