// Pictures a tool returns (readFile on an image: boardTools' ToolResult
// .images), carried into the tool_result Clayware's own AI receives. The
// Messages API takes a tool_result's content as a string or as blocks;
// a result with pictures becomes [text, image, …]. A model that cannot
// take pictures (a Worker's own model endpoint, which speaks the Messages
// shape but may drop or refuse image blocks) gets the text and a line
// saying the pictures could not be passed.
//
// Pictures live only in the turn being driven. A saved transcript keeps
// a placeholder in each picture's place (stripToolResultImages): base64
// would grow every save of the run's row, and a later turn that needs the
// picture again reads the file again.

import type { Block, Msg } from "./agentLoop.ts";

export interface ToolImage { mimeType: string; data: string }

export type ToolResultBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/** The image types the Messages API accepts. */
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export const IMAGES_NOT_PASSED = (n: number) =>
  `（画像 ${n} 枚は、このモデルには渡せませんでした。画像の中身は見ていません。中身について答えるときは、見ていないことを伝えてください。）`;

export const IMAGE_PLACEHOLDER = (mediaType: string) =>
  `[画像 ${mediaType} — 経過の保存では外しました。もう一度見るには readFile を呼んでください]`;

/**
 * Pure. A tool_result's content: the text alone when there are no
 * pictures; text then one image block per picture when the model takes
 * them; otherwise the text with a line saying how many were not passed.
 * A picture of a type the API does not accept is counted as not passed.
 */
export function toolResultContent(text: string, images: ToolImage[] | undefined, acceptsImages: boolean): string | ToolResultBlock[] {
  const all = (images ?? []).filter((i) => i && typeof i.data === "string" && i.data.length > 0);
  if (all.length === 0) return text;
  const usable = acceptsImages ? all.filter((i) => ACCEPTED.has(i.mimeType)) : [];
  const dropped = all.length - usable.length;
  const body = dropped > 0 ? `${text}\n${IMAGES_NOT_PASSED(dropped)}` : text;
  if (usable.length === 0) return body;
  return [
    { type: "text", text: body },
    ...usable.map((i): ToolResultBlock => ({ type: "image", source: { type: "base64", media_type: i.mimeType, data: i.data } })),
  ];
}

/** Pure. The text of a tool_result's content, whichever form it has. */
export function toolResultText(content: string | ToolResultBlock[] | Block[]): string {
  if (typeof content === "string") return content;
  return (content as { type: string; text?: unknown }[])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string).join("\n");
}

/** Pure. One tool_result with each image block replaced by its placeholder; the same object when it has none. */
function withoutImages<T extends object>(r: T): T {
  const raw = (r as { content?: unknown }).content;
  if (!Array.isArray(raw)) return r;
  const inner = raw as { type: string; source?: { media_type?: unknown } }[];
  if (!inner.some((x) => x.type === "image")) return r;
  return {
    ...r,
    content: inner.map((x) => x.type === "image"
      ? { type: "text", text: IMAGE_PLACEHOLDER(typeof x.source?.media_type === "string" ? x.source.media_type : "image") }
      : x),
  };
}

/**
 * Pure. The messages as a transcript keeps them: each image block inside
 * a tool_result becomes a text placeholder. Everything else is the same
 * object (no copy where nothing changed); the input is never mutated, so
 * the turn in flight still holds its pictures.
 */
export function stripToolResultImages(messages: Msg[]): Msg[] {
  return messages.map((m) => {
    if (m.role !== "user" || !Array.isArray(m.content)) return m;
    let changed = false;
    const content = m.content.map((b) => {
      if (b.type !== "tool_result") return b;
      const next = withoutImages(b);
      if (next !== b) changed = true;
      return next;
    });
    return changed ? { ...m, content } : m;
  });
}

/**
 * Pure. A pending approval as a transcript keeps it: the turn's results
 * already run (partial) and an approved batch's results lose their
 * pictures the same way, so a turn that read an image and then asked
 * for approval saves no base64 either.
 */
export function stripPendingImages<P extends { partial: object[]; results?: object[] }>(p: P): P {
  return {
    ...p,
    partial: p.partial.map(withoutImages),
    ...(p.results ? { results: p.results.map(withoutImages) } : {}),
  };
}
