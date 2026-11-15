import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { appLink, appOrigin, placedFileIds, type LinkKind } from "./readableText.ts";

// What a read hands an AI alongside a record's text: the address that opens
// it in the app, and the files placed in the text (with names, for readFile).

export function linkOf(kind: LinkKind, id: string): string {
  return appLink(appOrigin(typeof Deno !== "undefined" ? Deno.env.get("APP_URL") : undefined), kind, id);
}

/** The files placed in a text, in order, with their names; one no longer there says so. */
export async function placedFilesOf(db: SupabaseClient, text: string | null | undefined) {
  const ids = placedFileIds(text);
  if (!ids.length) return [];
  const { data } = await db.from("attachments").select("id, name, mime_type, size").in("id", ids).is("deleted_at", null);
  const byId = new Map(((data ?? []) as { id: string }[]).map((f) => [f.id, f]));
  return ids.map((id) => byId.get(id) ?? { id, name: null, unavailable: true });
}
