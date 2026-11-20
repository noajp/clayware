import type { ToolHost } from "./protocol.ts";

// Clayware's records as MCP resources: clayware://<kind>/<id>. A client that
// lets a person point at a resource (Claude Code's @-mentions) reads the
// record the way the matching read tool returns it — the same call, so RLS
// and the read-only boundary apply unchanged. resources/list offers the
// Objects the person can see; the templates reach any record by id.

export const RESOURCE_TEMPLATES = [
  { uriTemplate: "clayware://element/{id}", name: "element", title: "Element", description: "An Element with its description, Sub-elements, assignees and recent comments (id: UUID or display_id)", mimeType: "application/json" },
  { uriTemplate: "clayware://object/{id}", name: "object", title: "Object", description: "An Object with its description, span, Lead, linked Strategies and Element counts", mimeType: "application/json" },
  { uriTemplate: "clayware://strategy/{id}", name: "strategy", title: "Strategy", description: "A Strategy's purpose, success conditions, premises and decisions, and the Objects that execute it", mimeType: "application/json" },
  { uriTemplate: "clayware://note/{id}", name: "note", title: "Note", description: "A Note page as Markdown, or a Notebook / Section with what it holds", mimeType: "text/markdown" },
  { uriTemplate: "clayware://file/{id}", name: "file", title: "File", description: "A file's text, or the picture itself for an image", mimeType: "application/octet-stream" },
] as const;

const READ_OF: Record<string, { tool: string; arg: string }> = {
  element: { tool: "getElement", arg: "id" },
  object: { tool: "getObject", arg: "id" },
  strategy: { tool: "getInitiative", arg: "id" },
  note: { tool: "readNote", arg: "id" },
  file: { tool: "readFile", arg: "id" },
};

/** Pure. A clayware:// URI's kind and id, or null. */
export function parseResourceUri(uri: string): { kind: string; id: string } | null {
  const m = /^clayware:\/\/([a-z]+)\/([^/?#]+)$/.exec(uri.trim());
  if (!m || !READ_OF[m[1]]) return null;
  try {
    return { kind: m[1], id: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

export type ResourceContent =
  | { uri: string; mimeType: string; text: string }
  | { uri: string; mimeType: string; blob: string };

/** resources/read: the record behind a URI, or an error message for the caller. */
export async function readResource(uri: string, host: ToolHost): Promise<{ ok: true; contents: ResourceContent[] } | { ok: false; error: string }> {
  const parsed = parseResourceUri(uri);
  if (!parsed) return { ok: false, error: `Unknown resource: ${uri}` };
  const { tool, arg } = READ_OF[parsed.kind];
  if (!host.tools.some((t) => t.name === tool)) return { ok: false, error: `Unknown resource: ${uri}` };
  const r = await host.call(tool, { [arg]: parsed.id });
  if (!r.ok) return { ok: false, error: r.error };
  if (r.images?.length) return { ok: true, contents: r.images.map((i) => ({ uri, mimeType: i.mimeType, blob: i.data })) };
  const data = r.data as Record<string, unknown> | null;
  if (parsed.kind === "note" && data && typeof data.markdown === "string") {
    return { ok: true, contents: [{ uri, mimeType: "text/markdown", text: `# ${String(data.name ?? "")}\n\n${data.markdown}` }] };
  }
  if (parsed.kind === "file" && data && typeof data.text === "string") {
    return { ok: true, contents: [{ uri, mimeType: "text/plain", text: data.text }] };
  }
  return { ok: true, contents: [{ uri, mimeType: "application/json", text: JSON.stringify(r.data, null, 2) }] };
}

/** resources/list: the Objects the person can see, as resources. */
export async function listResources(host: ToolHost): Promise<{ uri: string; name: string; title: string; mimeType: string }[]> {
  if (!host.tools.some((t) => t.name === "listObjects")) return [];
  const r = await host.call("listObjects", {});
  if (!r.ok || !Array.isArray(r.data)) return [];
  return (r.data as { id: string; name: string; prefix?: string | null }[]).slice(0, 200).map((o) => ({
    uri: `clayware://object/${o.id}`,
    name: o.name,
    title: o.prefix ? `${o.name} (${o.prefix})` : o.name,
    mimeType: "application/json",
  }));
}
