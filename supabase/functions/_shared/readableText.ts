// What an AI outside the app needs to read a record the way a person sees it:
// a Note's HTML as Markdown, the files placed in a text (```clayware blocks
// whose view is `file` — an image pasted into a description is one), and the
// address that opens the record in the app. Pure.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The app's origin. Links built here are the ones notification emails use (lib/deepLink.ts). */
export function appOrigin(env: string | undefined | null): string {
  const v = (env ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(v) ? v : "https://clayware.app";
}

export type LinkKind = "element" | "object" | "strategy";

/** The address that opens one record in the app. */
export function appLink(origin: string, kind: LinkKind, id: string): string {
  return `${origin}/?${kind}=${encodeURIComponent(id)}`;
}

/**
 * The ids of the files placed in a text, in order, each once. A placed file is
 * a ```clayware block holding JSON with `"view":"file"` and an `id`.
 */
export function placedFileIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = /```clayware\s*\n([\s\S]*?)```/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    try {
      const block = JSON.parse(m[1].trim()) as { view?: unknown; id?: unknown };
      if (block.view === "file" && typeof block.id === "string" && UUID.test(block.id) && !out.includes(block.id)) out.push(block.id);
    } catch {
      // Not JSON: an embed this reader does not know.
    }
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? decode(m[2] ?? m[3] ?? "") : null;
}

/**
 * A Note's HTML as Markdown: headings, paragraphs, lists (checklists keep
 * their boxes), links, emphasis, code blocks with their language (so a
 * ```clayware file block survives), tables as rows, images as links.
 * Unknown tags fall away and keep their text.
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  if (!html) return "";
  let s = html.replace(/\r\n?/g, "\n");

  // Code blocks first: their text is kept verbatim.
  const blocks: string[] = [];
  s = s.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi, (_all, preAttrs: string, inner: string) => {
    const codeTag = /<code\b[^>]*>/i.exec(inner)?.[0] ?? "";
    const lang = attr(preAttrs, "data-lang") ?? attr(preAttrs, "data-language") ?? attr(codeTag, "data-language")
      ?? /language-([\w-]+)/.exec(attr(codeTag, "class") ?? attr(preAttrs, "class") ?? "")?.[1] ?? "";
    const text = decode(inner.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n+$/, "");
    blocks.push(`\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`);
    return `\u0000${blocks.length - 1}\u0000`;
  });

  s = s
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_a, n: string, t: string) => `\n\n${"#".repeat(Number(n))} ${t.trim()}\n\n`)
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src = attr(tag, "src");
      return src ? `![${attr(tag, "alt") ?? ""}](${src})` : "";
    })
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_a, attrs: string, t: string) => {
      const href = attr(` ${attrs}`, "href");
      return href ? `[${t}](${href})` : t;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<(s|del|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, "~~$2~~")
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<li\b([^>]*)>/gi, (_a, attrs: string) => {
      const checked = attr(` ${attrs}`, "data-checked");
      if (checked !== null) return `\n- [${checked === "true" ? "x" : " "}] `;
      return "\n- ";
    })
    .replace(/<input\b[^>]*type\s*=\s*["']checkbox["'][^>]*>/gi, (tag) => (/\schecked\b/i.test(tag) ? "[x] " : "[ ] "))
    .replace(/<\/(li|ul|ol)>/gi, "\n")
    .replace(/<(ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_a, t: string) => `\n\n${t.trim().split("\n").map((l) => `> ${l}`).join("\n")}\n\n`)
    .replace(/<hr\b[^>]*>/gi, "\n\n---\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>\s*/gi, " | ")
    .replace(/<tr\b[^>]*>/gi, "\n| ")
    .replace(/<\/(p|div|tr|table|section|article|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  s = decode(s)
    .replace(/\u0000(\d+)\u0000/g, (_a, i: string) => blocks[Number(i)])
    .replace(/- \[( |x)\] \[( |x)\] /g, "- [$2] ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
