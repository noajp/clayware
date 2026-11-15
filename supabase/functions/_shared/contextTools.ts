import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorMessage, quoteFilterValue, resolveElementId, type BoardActor, type ToolDef, type ToolResult } from "./boardTools.ts";
import { htmlToMarkdown } from "./readableText.ts";
import { linkOf, placedFilesOf } from "./recordLinks.ts";

// Reads that let an AI find its way around the record the way a person does
// in the app: who it is working as, every comment and the history of an
// Element, one search across Elements, Objects, Strategies and Notes, and the
// Notes themselves (Notebook → Section → Page). Everything runs with the
// caller's JWT, so RLS decides what is seen.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure. A limit within [1, max], `fallback` when absent or not a number. */
export function clampLimit(v: unknown, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1), max) : fallback;
}

/** Pure. A non-negative whole offset. */
export function offsetOf(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Pure. An ilike pattern for a user's words, wildcards escaped. */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
}

/** Pure. A Note node's kind as the app names it. */
export function noteKind(type: string | null): "notebook" | "section" | "page" {
  return type === "folder" ? "notebook" : type === "section" ? "section" : "page";
}

export const SEARCH_KINDS = ["element", "object", "strategy", "note"] as const;
type SearchKind = (typeof SEARCH_KINDS)[number];

export const CONTEXT_TOOLS: ToolDef[] = [
  {
    name: "getMe",
    description: "接続している本人：ユーザー id、本人の Worker（Space ごと）、参加している Space。担当で絞るとき（listElements の assigneeWorkerId）や、自分の仕事を探すときに使う。",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listElementComments",
    description: "Element のコメントを古い順にすべて読む（getElement は直近10件だけ）。返信は parent_id で親を指す。",
    input_schema: {
      type: "object",
      properties: {
        elementId: { type: "string", description: "Element UUID または display_id" },
        limit: { type: "number", description: "最大件数（既定 50、最大 200）" },
        offset: { type: "number", description: "前の答えの nextOffset" },
      },
      required: ["elementId"],
      additionalProperties: false,
    },
  },
  {
    name: "getElementHistory",
    description: "Element の変更履歴（誰が・いつ・何を変えたか。ステータス・担当・期限・本文などの変化）を新しい順に返す。",
    input_schema: {
      type: "object",
      properties: {
        elementId: { type: "string", description: "Element UUID または display_id" },
        limit: { type: "number", description: "最大件数（既定 50、最大 200）" },
        offset: { type: "number", description: "前の答えの nextOffset" },
      },
      required: ["elementId"],
      additionalProperties: false,
    },
  },
  {
    name: "search",
    description: "Element・Object・Strategy・Note を名前と本文で横断して探す。結果は種類・id・名前・アプリで開く url。種類を絞るときは kinds。ファイルの中身で探すときは searchFiles。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "探す言葉" },
        kinds: { type: "array", items: { type: "string", enum: [...SEARCH_KINDS] }, description: "探す種類（省略ですべて）" },
        limit: { type: "number", description: "種類ごとの最大件数（既定 10、最大 50）" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "listNotes",
    description: "Note の一覧。引数なしなら Notebook の一覧。parentId を渡すとその中（Notebook なら Section と Page、Section なら Page）、objectId を渡すとその Object に結び付いた Note、query で名前を探す。",
    input_schema: {
      type: "object",
      properties: {
        parentId: { type: "string", description: "Notebook か Section の UUID" },
        objectId: { type: "string", description: "Object UUID" },
        query: { type: "string", description: "名前の一部" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "readNote",
    description: "Note の Page を Markdown で読む。本文に置かれたファイル（画像など）は placedFiles に並び、readFile で読める。Notebook や Section を渡すと、その中の一覧を返す。",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "Note の UUID" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

export const CONTEXT_TOOL_NAMES = new Set(CONTEXT_TOOLS.map((t) => t.name));

async function noteChildren(db: SupabaseClient, parentId: string) {
  const { data, error } = await db.from("notes")
    .select("id, type, name, parent_id, linked_object_id, updated_at")
    .eq("parent_id", parentId).order("order_index", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { type: string | null }[]).map((n) => ({ ...n, kind: noteKind(n.type) }));
}

export async function runContextTool(
  db: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
  actor: BoardActor,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "getMe": {
        let userId = actor.userId;
        if (!userId) {
          const { data } = await db.auth.getUser();
          userId = data.user?.id ?? null;
        }
        if (!userId) return { ok: false, error: "Not signed in" };
        const [workers, spaces] = await Promise.all([
          db.from("workers").select("id, name, type, activity_space_id, email").eq("user_id", userId),
          db.from("activity_space_members").select("activity_space_id, role, space:activity_spaces(id, name)").eq("user_id", userId),
        ]);
        return {
          ok: true,
          data: { userId, actingAs: actor.agent, workers: workers.data ?? [], spaces: spaces.data ?? [] },
        };
      }

      case "listElementComments": {
        const elementId = await resolveElementId(db, String(input.elementId ?? ""));
        if (!elementId) return { ok: false, error: "Element not found" };
        const limit = clampLimit(input.limit, 50, 200);
        const offset = offsetOf(input.offset);
        const { data, error, count } = await db.from("element_comments")
          .select("id, parent_id, author_name, author_kind, content, is_pinned, created_at, updated_at", { count: "exact" })
          .eq("element_id", elementId)
          .order("created_at", { ascending: true })
          .range(offset, offset + limit - 1);
        if (error) throw error;
        const rows = data ?? [];
        const total = count ?? null;
        const next = total !== null && offset + rows.length < total ? offset + rows.length : null;
        return { ok: true, data: { elementId, comments: rows, nextOffset: next, total }, meta: { rows: rows.length, nextOffset: next, total } };
      }

      case "getElementHistory": {
        const elementId = await resolveElementId(db, String(input.elementId ?? ""));
        if (!elementId) return { ok: false, error: "Element not found" };
        const limit = clampLimit(input.limit, 50, 200);
        const offset = offsetOf(input.offset);
        const { data, error, count } = await db.from("element_activity")
          .select("id, kind, detail, author, created_at", { count: "exact" })
          .eq("element_id", elementId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw error;
        const rows = data ?? [];
        const total = count ?? null;
        const next = total !== null && offset + rows.length < total ? offset + rows.length : null;
        return { ok: true, data: { elementId, history: rows, nextOffset: next, total }, meta: { rows: rows.length, nextOffset: next, total } };
      }

      case "search": {
        const query = String(input.query ?? "").trim();
        if (!query) return { ok: false, error: "query is required" };
        const asked = Array.isArray(input.kinds) ? (input.kinds as unknown[]).filter((k): k is SearchKind => (SEARCH_KINDS as readonly string[]).includes(String(k))) : [];
        const kinds = new Set<SearchKind>(asked.length ? asked : SEARCH_KINDS);
        const limit = clampLimit(input.limit, 10, 50);
        const p = quoteFilterValue(likePattern(query));
        const or = (cols: string[]) => cols.map((c) => `${c}.ilike.${p}`).join(",");
        const [els, objs, strats, notes] = await Promise.all([
          kinds.has("element")
            ? db.from("elements").select("id, display_id, title, status, object_id, updated_at").or(or(["title", "description", "display_id"])).order("updated_at", { ascending: false }).limit(limit)
            : null,
          kinds.has("object")
            ? db.from("objects").select("id, name, prefix, domain_id, updated_at").is("archived_at", null).or(or(["name", "description"])).order("updated_at", { ascending: false }).limit(limit)
            : null,
          kinds.has("strategy")
            ? db.from("strategies").select("id, name, status, updated_at").or(or(["name", "description"])).order("updated_at", { ascending: false }).limit(limit)
            : null,
          kinds.has("note")
            ? db.from("notes").select("id, type, name, parent_id, updated_at").ilike("name", likePattern(query)).order("updated_at", { ascending: false }).limit(limit)
            : null,
        ]);
        for (const r of [els, objs, strats, notes]) if (r?.error) throw r.error;
        type Row = Record<string, unknown> & { id: string };
        const results = [
          ...((els?.data ?? []) as Row[]).map((e) => ({ kind: "element", id: e.id, displayId: e.display_id, name: e.title, status: e.status, objectId: e.object_id, url: linkOf("element", e.id) })),
          ...((objs?.data ?? []) as Row[]).map((o) => ({ kind: "object", id: o.id, name: o.name, prefix: o.prefix, domainId: o.domain_id, url: linkOf("object", o.id) })),
          ...((strats?.data ?? []) as Row[]).map((s) => ({ kind: "strategy", id: s.id, name: s.name, status: s.status, url: linkOf("strategy", s.id) })),
          ...((notes?.data ?? []) as Row[]).map((n) => ({ kind: "note", noteKind: noteKind(n.type as string | null), id: n.id, name: n.name, parentId: n.parent_id })),
        ];
        return { ok: true, data: results, meta: { rows: results.length } };
      }

      case "listNotes": {
        const parentId = typeof input.parentId === "string" ? input.parentId.trim() : "";
        const objectId = typeof input.objectId === "string" ? input.objectId.trim() : "";
        const query = typeof input.query === "string" ? input.query.trim() : "";
        let q = db.from("notes").select("id, type, name, parent_id, linked_object_id, updated_at").order("order_index", { ascending: true }).limit(200);
        if (parentId) {
          if (!UUID.test(parentId)) return { ok: false, error: "Note not found" };
          q = q.eq("parent_id", parentId);
        } else if (objectId) {
          if (!UUID.test(objectId)) return { ok: false, error: "Object not found" };
          q = q.eq("linked_object_id", objectId);
        } else if (query) {
          q = q.ilike("name", likePattern(query));
        } else {
          q = q.eq("type", "folder").is("parent_id", null);
        }
        const { data, error } = await q;
        if (error) throw error;
        const rows = ((data ?? []) as { type: string | null }[]).map((n) => ({ ...n, kind: noteKind(n.type) }));
        return { ok: true, data: rows, meta: { rows: rows.length } };
      }

      case "readNote": {
        const id = String(input.id ?? "").trim();
        if (!UUID.test(id)) return { ok: false, error: "Note not found" };
        const { data: note, error } = await db.from("notes")
          .select("id, type, name, parent_id, linked_object_id, created_at, updated_at").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!note) return { ok: false, error: "Note not found" };
        const kind = noteKind((note as { type: string | null }).type);
        if (kind !== "page") return { ok: true, data: { ...note, kind, children: await noteChildren(db, id) } };
        const { data: content } = await db.from("note_contents").select("html, updated_at").eq("note_id", id).maybeSingle();
        const markdown = htmlToMarkdown((content as { html?: string } | null)?.html ?? "");
        return {
          ok: true,
          data: { ...note, kind, markdown, placedFiles: await placedFilesOf(db, markdown), contentUpdatedAt: (content as { updated_at?: string } | null)?.updated_at ?? null },
        };
      }
    }
    return { ok: false, error: `Unknown tool: ${name}` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
