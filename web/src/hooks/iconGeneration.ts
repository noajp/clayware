'use client';

// Asks Athena to draw icons from words (the generate-icon function), with the
// person's own choice of model and effort. Returns the drafts as SVG source;
// the caller keeps only what svgIcon.readSvgIcon accepts.

import { supabase } from '@/lib/supabase';
import { getAthenaSettings } from '@/Function/shared/athenaSettings';

export interface IconDraft { name: string; svg: string }

export async function generateIconDrafts(prompt: string): Promise<IconDraft[]> {
  const { data, error } = await supabase.functions.invoke('generate-icon', { body: { prompt, ...getAthenaSettings() } });
  if (error) {
    // The function's own message, when it sent one, says what went wrong.
    const context = (error as { context?: Response }).context;
    const body = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    throw new Error(body?.error ?? error.message);
  }
  return Array.isArray(data?.icons) ? data.icons.filter((i: unknown): i is IconDraft =>
    !!i && typeof (i as IconDraft).name === 'string' && typeof (i as IconDraft).svg === 'string') : [];
}
