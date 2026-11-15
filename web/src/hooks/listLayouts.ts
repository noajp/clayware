'use client';

// A person's list layouts (columns shown, their order and widths, the sort),
// kept with their preferences so a list looks the same wherever they sign
// in. The lists hold the layouts themselves (useListColumns); this reads
// them once and writes one list's layout a little after it last changed.

import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

/** Every saved layout by list key, or null when nobody is signed in or the
 *  read failed (the lists then keep what this browser remembers). */
export async function fetchListLayouts(): Promise<Record<string, Json> | null> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return null;
    const { data, error } = await supabase.from('user_preferences').select('list_layouts').maybeSingle();
    if (error) return null;
    const layouts = (data as { list_layouts?: Json } | null)?.list_layouts;
    return layouts && typeof layouts === 'object' && !Array.isArray(layouts) ? (layouts as Record<string, Json>) : {};
  } catch {
    return null;
  }
}

const SAVE_AFTER_MS = 800;
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; layout: Json }>();

/** Saves one list's layout once it has stopped changing. A failed save is
 *  dropped: the browser still has the layout, and the next change sends it. */
export function saveListLayout(key: string, layout: Json): void {
  const waiting = pending.get(key);
  if (waiting) clearTimeout(waiting.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    void supabase.rpc('set_list_layout', { p_key: key, p_layout: layout }).then(({ error }) => {
      if (error) console.error('Failed to save the list layout', error);
    });
  }, SAVE_AFTER_MS);
  pending.set(key, { timer, layout });
}
