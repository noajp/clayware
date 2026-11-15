import type { McpTool } from "./protocol.ts";

// Ways of working a person can start from their client: Claude Code shows
// each prompt as a slash command (/clayware:work-on-element). A prompt is
// only the opening message; the work runs through the tools, under the
// same boundary. A prompt whose steps write is offered only when the
// connection can write.

interface PromptDef {
  name: string;
  title: string;
  description: string;
  arguments: { name: string; description: string; required: boolean }[];
  /** A tool the prompt's steps need; without it the prompt is not offered. */
  needs: string;
  text(args: Record<string, string>): string;
}

const PROMPTS: PromptDef[] = [
  {
    name: "work-on-element",
    title: "Work on an Element",
    description: "Take an Element, do the work, and report the outcome on Clayware",
    arguments: [{ name: "element", description: "The Element's display_id (ELE_OBJ-012) or UUID", required: true }],
    needs: "claimElement",
    text: (a) => [
      `Clayware の Element ${a.element} を進めてください。`,
      "1. getElement で中身を読む。placedFiles があれば readFile で読む（画像も見られる）。コメントが多ければ listElementComments、経緯は getElementHistory。",
      "2. 何のための仕事か分からなければ、所属 Object を getObject で、Strategy を getInitiative で確かめる。",
      "3. claimElement で着手を宣言する（断られたら進めない）。",
      "4. 作業し、節目ごとに logProgress で記録する。",
      "5. reportOutcome（completed / partial / blocked）で締める。judge / decide / approve / answer の Element は人の仕事なので、材料を揃えて人に回す。",
    ].join("\n"),
  },
  {
    name: "review-object",
    title: "Review an Object",
    description: "Read an Object and its Elements, and say where it stands and what comes next",
    arguments: [{ name: "object", description: "The Object's name, display_id or UUID", required: true }],
    needs: "getObject",
    text: (a) => [
      `Clayware の Object「${a.object}」の状況をまとめてください。`,
      "1. id が分からなければ search（kinds: object）で探す。",
      "2. getObject で目的（description）と結び付いた Strategy を読み、placedFiles があれば readFile で見る。",
      "3. listElements（objectId）で Element を読み、滞っているもの・期限切れ・判断待ちを挙げる。",
      "4. 目的に照らして、足りていない Element と次の一手を提案する。書き込みはせず、提案に留める。",
    ].join("\n"),
  },
  {
    name: "my-work",
    title: "My work",
    description: "List what is assigned to me and what needs my judgement",
    arguments: [],
    needs: "listElements",
    text: () => [
      "Clayware で自分の仕事をまとめてください。",
      "1. listElements に assigneeWorkerId: \"me\" を渡し、done / cancelled 以外を読む（続きは nextOffset）。",
      "2. 期限切れ・今週期限・判断待ち（judge / decide / approve / answer）に分けて並べる。",
      "3. それぞれアプリで開く url を添える。",
    ].join("\n"),
  },
];

export function offeredPrompts(tools: readonly McpTool[]): PromptDef[] {
  return PROMPTS.filter((p) => tools.some((t) => t.name === p.needs));
}

export function listPrompts(tools: readonly McpTool[]) {
  return offeredPrompts(tools).map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args }));
}

/** prompts/get: the opening message, or why not. */
export function getPrompt(
  tools: readonly McpTool[],
  name: string,
  args: Record<string, unknown>,
): { ok: true; result: { description: string; messages: { role: "user"; content: { type: "text"; text: string } }[] } } | { ok: false; error: string } {
  const p = offeredPrompts(tools).find((x) => x.name === name);
  if (!p) return { ok: false, error: `Unknown prompt: ${name}` };
  const values: Record<string, string> = {};
  for (const a of p.arguments) {
    const v = typeof args[a.name] === "string" ? (args[a.name] as string).trim() : "";
    if (a.required && !v) return { ok: false, error: `Missing required argument: ${a.name}` };
    values[a.name] = v;
  }
  return { ok: true, result: { description: p.description, messages: [{ role: "user", content: { type: "text", text: p.text(values) } }] } };
}
