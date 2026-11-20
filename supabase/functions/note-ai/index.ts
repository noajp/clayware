// Dynamic AI Note assistant:
//   - mode: "structure" — turns newly spoken transcript into structured minutes HTML to append to the note
//   - mode: "complete"  — ultra-fast inline ghost-text Tab completion at the caret
//   - mode: "propose"   — pinpoint block-level revision proposals for dense / rough notes
//   - mode: "edit"      — pinpoint rewrite of a selected range from a quick action or freeform prompt
//
// Uses Claude via the Anthropic Messages API, with the answer held to a JSON schema
// (output_config), as strategy-gap does.
//
// Every call is charged to the Space's monthly AI budget (the one run-agent
// keeps): refused once the month is spent, and written to note_ai_usage after.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { athenaAllowed, callerClient, PLAN_REFUSAL } from "../_shared/plan.ts";
import { costOf, type AgentModel, type ModelUsage } from "../_shared/aiPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FAST_MODEL: AgentModel = "claude-haiku-5-5";
const SMART_MODEL: AgentModel = "claude-sonnet-5-5";

/** A person's own monthly budget where the Note is in no Space (as run-agent has it). */
const USER_MONTHLY_BUDGET_USD = 20;

const BUDGET_REFUSAL = {
  error: "This month's AI budget is used up. The Space's owner can raise it in Settings.",
  code: "ai_budget_spent",
} as const;

type Mode = "structure" | "complete" | "propose" | "edit";

interface BlockInput {
  index: number;
  type: string;
  text: string;
}

interface RequestBody {
  mode?: Mode;
  spaceId?: unknown;
  title?: string;
  language?: string;
  // structure
  existingText?: string;
  transcriptDelta?: string;
  fullTranscript?: string;
  regroup?: boolean;
  minutesHtml?: string;
  // complete
  prefix?: string;
  suffix?: string;
  currentBlockText?: string;
  blockType?: string;
  recentTranscript?: string;
  // propose
  blocks?: BlockInput[];
  focus?: "dense" | "clarity" | "actions" | "all";
  // edit
  selectedText?: string;
  beforeContext?: string;
  afterContext?: string;
  instruction?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: ModelUsage;
}

/** What one request spent, added up for the usage record. */
interface Spend { model: AgentModel; usd: number }

function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.length > max ? value.slice(0, max) : value;
}

function clampTail(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.length > max ? value.slice(-max) : value;
}

function langInstruction(language?: string): string {
  if (language?.toLowerCase().startsWith("en")) {
    return "Respond in concise, natural English matching the note's tone.";
  }
  return "自然で簡潔な日本語で出力してください（原文が英語中心なら英語に合わせる）。";
}

/** A schema as structured output takes it: every object closed, every field
 *  required, and no array length limits (the handlers trim the lists). */
function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "maxItems" || key === "minItems") continue;
    out[key] = strictSchema(value);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as Record<string, unknown>);
  }
  return out;
}

async function callClaudeTool<T>(args: {
  apiKey: string;
  spend: Spend;
  model: AgentModel;
  maxTokens: number;
  system: string;
  userPrompt: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
}): Promise<T> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: args.maxTokens,
      system: `${args.system}\n\n出力: ${args.tool.description}`,
      output_config: { format: { type: "json_schema", schema: strictSchema(args.tool.input_schema) } },
      messages: [{ role: "user", content: args.userPrompt }],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const detail = await response.text().then((t) => t.slice(0, 300), () => "");
    throw new Error(`The model returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const result = (await response.json()) as AnthropicResponse;
  args.spend.model = args.model;
  args.spend.usd += costOf(args.model, result.usage ?? {});
  if (result.stop_reason === "refusal") throw new Error("The model declined this request.");
  // An answer cut off at the token limit is half a JSON object: never written into a Note.
  if (result.stop_reason === "max_tokens") {
    throw new Error("The answer was too long to finish. Try again with less text.");
  }
  try {
    const parsed = JSON.parse(result.content?.find((b) => b.type === "text")?.text ?? "");
    if (parsed && typeof parsed === "object") return parsed as T;
  } catch {
    // falls through to the error below
  }
  throw new Error("The model returned no answer.");
}

// ── Mode 1: Dynamic Voice → Structured Minutes ─────────────────────────────
//
// The Note holds the words as they were spoken. The answer is the section
// placed below them, where they stay folded as a transcript: the rest of the
// Note is read for context and never rewritten, so nothing a person typed —
// and nothing the model cannot write (links, images, tables, linked
// Elements) — is lost.

const STRUCTURE_TOOL = {
  name: "emit_minutes_section",
  description: "Return the minutes section, as HTML, that summarizes the newly spoken transcript and is placed below it in the note.",
  input_schema: {
    type: "object",
    properties: {
      html: {
        type: "string",
        description:
          "Clean semantic HTML for the NEW content only, using ONLY h2, h3, p, ul, ol, li, blockquote, strong, em, code, and checklist ul[data-checklist='true'] > li[data-checked='false']. No <html>/<body>/<script>/<style>. Empty string only when the transcript is nothing but filler.",
      },
      suggestedTitle: {
        type: "string",
        description: "Concise meeting title ONLY when the current title is empty or Untitled; otherwise an empty string.",
      },
      summaryNote: {
        type: "string",
        description: "One short sentence summarizing what was added.",
      },
    },
    required: ["html", "summaryNote"],
  },
};

async function handleStructure(apiKey: string, spend: Spend, body: RequestBody) {
  const title = clampText(body.title, 200).trim();
  // The end of the Note is what the new lines continue from.
  const existingText = clampTail(body.existingText, 8000).trim();
  const transcriptDelta = clampTail(body.transcriptDelta, 12000).trim();
  const fullTranscript = clampTail(body.fullTranscript, 6000).trim();

  if (!transcriptDelta) {
    return jsonResponse({ error: "transcriptDelta is required" }, 400);
  }

  const system = `あなたはリアルタイム議事録の構造化アシスタントです。
ノートには話された言葉がそのまま書かれています。その書き起こしを、話題を表す見出しで括った議事のセクションに要約します。書き起こしはノートに折りたたんで残り、出力はそのすぐ下に置かれます。

ルール:
- ${langInstruction(body.language)}
- 出力は新しい書き起こしをまとめたセクションだけ。それより前のノートは参照用で、書き直したり繰り返したりしない
- 言い回しは書き起こしに残るので、ここには要旨だけを書く。結論・理由・数字・固有名詞・誰が何をするかは落とさない。相づちやフィラーだけで中身がないときは html を空文字にする
- 話題を短く言い表す <h2> で始め、その下に要点を箇条書きで置く。直前のノートの最後の見出しと同じ話題が続いているときは、見出しを繰り返さず箇条書きだけを返す
- 話し言葉のフィラー（「えー」「あのー」「まあ」等）や言い直しは取り除き、要点だけを簡潔にまとめる
- 決定事項はそれと分かる形で書き、アクションアイテムは必ずチェックリスト形式で書く: <ul data-checklist="true"><li data-checked="false">担当者: 内容（期限）</li></ul>
- 使用してよい HTML タグは <h2> <h3> <p> <ul> <ol> <li> <blockquote> <strong> <em> <code> のみ。<h1> や <div> <span> <style> は使わない
- 話していない事実や固有名詞を創作しない`;

  const userPrompt = [
    `現在のタイトル: ${title || "(無題)"}`,
    existingText ? `\nここまでのノートの末尾（参照用。出力に含めない）:\n${existingText}` : "\nここまでのノート: (空)",
    `\n新しく話された書き起こし（これをセクションにまとめる）:\n${transcriptDelta}`,
    fullTranscript && fullTranscript !== transcriptDelta
      ? `\nこれまでの書き起こしの末尾（文脈参照用）:\n${fullTranscript}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const output = await callClaudeTool<{
    html?: string;
    suggestedTitle?: string | null;
    summaryNote?: string;
  }>({
    apiKey,
    spend,
    model: SMART_MODEL,
    maxTokens: 4096,
    system,
    userPrompt,
    tool: STRUCTURE_TOOL,
  });

  return jsonResponse({
    html: typeof output.html === "string" ? output.html.trim() : "",
    suggestedTitle: typeof output.suggestedTitle === "string" && output.suggestedTitle.trim() ? output.suggestedTitle.trim() : null,
    summaryNote: typeof output.summaryNote === "string" ? output.summaryNote.trim() : "",
  });
}

// Regrouping: the sections written so far, grouped again and said once.

const REGROUP_TOOL = {
  name: "emit_regrouped_minutes",
  description: "Return the minutes regrouped and condensed, as HTML that takes the place of the minutes given.",
  input_schema: {
    type: "object",
    properties: {
      html: {
        type: "string",
        description:
          "Clean semantic HTML for the whole regrouped minutes, using ONLY h2, h3, p, ul, ol, li, blockquote, strong, em, code, and checklist ul[data-checklist='true'] > li[data-checked]. No <html>/<body>/<script>/<style>.",
      },
    },
    required: ["html"],
  },
};

async function handleRegroup(apiKey: string, spend: Spend, body: RequestBody) {
  const title = clampText(body.title, 200).trim();
  const minutesHtml = typeof body.minutesHtml === "string" ? body.minutesHtml.trim() : "";
  if (!minutesHtml) return jsonResponse({ error: "minutesHtml is required" }, 400);
  // Cut short it would come back with its end missing, and that would be what is kept.
  if (minutesHtml.length > 40000) return jsonResponse({ html: "" });

  const system = `あなたは会議の議事を整える編集者です。
ここまでに話題ごとに書かれた議事のセクションを受け取り、全体を括り直して短くします。出力はノートの中で元の議事と置き換わります。

ルール:
- ${langInstruction(body.language)}
- 同じ話題や近い話題のセクションは一つの <h2> の下にまとめる。必要なら <h3> で小分けにする。話題の順番は話された流れを保つ
- 同じことの繰り返しは一度だけ書く。細かい経過は端折り、結論・理由・数字・固有名詞・未決の論点は残す
- 決定事項はそれと分かる形で残す
- チェックリスト（<ul data-checklist="true"><li data-checked="...">）の項目は一つも落とさず、data-checked の値も変えない。同じ項目が重なっているときだけ一つにする
- 元の議事にない事実や固有名詞を足さない
- 使用してよい HTML タグは <h2> <h3> <p> <ul> <ol> <li> <blockquote> <strong> <em> <code> のみ。<h1> や <div> <span> <style> は使わない`;

  const userPrompt = [
    `ノートのタイトル: ${title || "(無題)"}`,
    `\nここまでの議事（HTML。これを括り直す）:\n${minutesHtml}`,
  ].join("\n");

  const output = await callClaudeTool<{ html?: string }>({
    apiKey,
    spend,
    model: SMART_MODEL,
    maxTokens: 8192,
    system,
    userPrompt,
    tool: REGROUP_TOOL,
  });

  return jsonResponse({ html: typeof output.html === "string" ? output.html.trim() : "" });
}

// ── Mode 2: Inline Ghost-Text Tab Completion ───────────────────────────────

const COMPLETE_TOOL = {
  name: "emit_completion",
  description: "Return a short inline ghost-text continuation starting immediately at the caret.",
  input_schema: {
    type: "object",
    properties: {
      completion: {
        type: "string",
        description:
          "Plain text continuation to insert directly at the caret (0-90 chars), including a leading space when a new word starts right after a word. Return empty string if no natural completion helps.",
      },
    },
    required: ["completion"],
  },
};

async function handleComplete(apiKey: string, spend: Spend, body: RequestBody) {
  const title = clampText(body.title, 200).trim();
  const prefix = clampTail(body.prefix, 2400);
  const suffix = clampText(body.suffix, 600);
  const currentBlockText = clampText(body.currentBlockText, 600);
  const blockType = clampText(body.blockType, 40) || "paragraph";
  const recentTranscript = clampTail(body.recentTranscript, 2400).trim();

  if (!prefix.trim() && !recentTranscript && !title) {
    return jsonResponse({ completion: "" });
  }

  const system = `あなたはノートエディタのインライン Tab 補完エンジンです（Cursor Tab のような 1 行単位の自然な補完）。

ルール:
- ${langInstruction(body.language)}
- カーソル位置（<CARET>）の直後にそのまま繋げられるプレーンテキストだけを返す
- カーソル直前の文字（prefix の末尾）は絶対に繰り返さない
- 返す文字列は <CARET> の位置にそのまま挿入される。直前が単語の終わり（英数字や句読点で、空白ではない）で、続きが新しい単語から始まるときは、先頭に半角スペースを 1 つ入れる。単語の途中から続けるとき、直前が空白のとき、日本語の文中では入れない
- 1 文または 1 箇条書き項目以内（最大 60〜90 文字程度）で簡潔にする。複数行や Markdown 記号（#, -, * 等）は書かない
- 直近の音声書き起こしがある場合は、会話で出た具体的な決定・数字・担当者・未記入の要点を優先して補完する
- すでに行が完結している・不自然な補完になりそうな場合は空文字 "" を返す
- 事実の創作はしない`;

  const userPrompt = [
    `ノートタイトル: ${title || "(無題)"}`,
    `現在のブロック種別: ${blockType}`,
    `現在の行のテキスト: ${currentBlockText || "(空行)"}`,
    recentTranscript ? `\n直近の音声書き起こし:\n${recentTranscript}` : "",
    `\nカーソル前後の本文:\n${prefix}<CARET>${suffix}`,
  ]
    .filter(Boolean)
    .join("\n");

  const output = await callClaudeTool<{ completion?: string }>({
    apiKey,
    spend,
    model: FAST_MODEL,
    maxTokens: 200,
    system,
    userPrompt,
    tool: COMPLETE_TOOL,
  });

  // Strip stray leading/trailing newlines so ghost text stays cleanly inline.
  const raw = typeof output.completion === "string" ? output.completion.replace(/\r?\n+/g, " ") : "";
  return jsonResponse({ completion: raw.slice(0, 160) });
}

// ── Mode 3: Pinpoint Block-Level Revision Proposals ────────────────────────

const PROPOSE_TOOL = {
  name: "emit_proposals",
  description: "Emit up to 5 pinpoint, high-value block-level improvement proposals for the note.",
  input_schema: {
    type: "object",
    properties: {
      proposals: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            blockIndex: {
              type: "integer",
              description: "The exact [index] of the target block from the provided block list.",
            },
            kind: {
              type: "string",
              enum: ["condense", "clarify", "structure", "action", "missing"],
              description:
                "condense=圧縮/重複整理, clarify=明確化, structure=箇条書き・見出し化, action=チェックリスト化, missing=書き起こしから漏れた要点の補足(blockIndexの直後に挿入)",
            },
            originalText: {
              type: "string",
              description: "Exact verbatim text of the target block at blockIndex.",
            },
            proposedText: {
              type: "string",
              description:
                "Replacement plain text for the block (use \\n between items when proposedBlockType is bullet or checklist). For kind='missing', the new line to insert after blockIndex.",
            },
            proposedBlockType: {
              type: "string",
              enum: ["same", "paragraph", "bullet", "checklist", "heading"],
              description: "Target block shape after applying the proposal.",
            },
            reason: {
              type: "string",
              description: "Short 1-line rationale (<= 45 chars).",
            },
          },
          required: ["blockIndex", "kind", "originalText", "proposedText", "proposedBlockType", "reason"],
        },
      },
    },
    required: ["proposals"],
  },
};

async function handlePropose(apiKey: string, spend: Spend, body: RequestBody) {
  const title = clampText(body.title, 200).trim();
  const blocks = Array.isArray(body.blocks) ? body.blocks.slice(0, 80) : [];
  const recentTranscript = clampTail(body.recentTranscript, 6000).trim();
  const focus = body.focus ?? "all";

  if (!blocks.length) {
    return jsonResponse({ proposals: [] });
  }

  const formattedBlocks = blocks
    .map((b) => `[${b.index}] (${b.type}) ${clampText(b.text, 800)}`)
    .join("\n");

  const focusGuide: Record<string, string> = {
    dense: "特に長すぎる段落・冗長な表現・重複を優先的に見つけ、箇条書き化や1行圧縮を提案する。",
    clarity: "曖昧な表現・主語や期限の抜け・読みにくい文をピンポイントで明確化する。",
    actions: "タスク・宿題・確認事項になりそうな行を見つけ、checklist 化や担当・期限の明示を提案する。",
    all: "長文の圧縮、曖昧表現の明確化、箇条書き/チェックリスト化、音声書き起こしからの漏れ補完をバランスよく最大5件までピンポイント提案する。",
  };

  const system = `あなたはノート全体の書き直しではなく、要所要所だけをピンポイントで修正提案する編集アシスタントです。

ルール:
- ${langInstruction(body.language)}
- ${focusGuide[focus] ?? focusGuide.all}
- すでに簡潔で整っているブロックは触らない。本当に価値が高い修正だけを最大 5 件に絞る
- originalText は入力ブロックのテキストと完全一致させる
- blockIndex は入力にある [index] をそのまま返す
- proposedText が originalText と同じになる無意味な提案は出さない
- 事実・固有名詞・数値・日付を創作しない（書き起こしにある情報のみ補足可）`;

  const userPrompt = [
    `タイトル: ${title || "(無題)"}`,
    `\nノートのブロック一覧:\n${formattedBlocks}`,
    recentTranscript ? `\n直近の音声書き起こし（漏れチェック用）:\n${recentTranscript}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const output = await callClaudeTool<{
    proposals?: Array<{
      blockIndex: number;
      kind: string;
      originalText: string;
      proposedText: string;
      proposedBlockType?: string;
      reason: string;
    }>;
  }>({
    apiKey,
    spend,
    model: SMART_MODEL,
    maxTokens: 2048,
    system,
    userPrompt,
    tool: PROPOSE_TOOL,
  });

  const validKinds = new Set(["condense", "clarify", "structure", "action", "missing"]);
  const validTypes = new Set(["same", "paragraph", "bullet", "checklist", "heading"]);

  const proposals = (output.proposals ?? [])
    .filter((p) => p && typeof p.blockIndex === "number" && typeof p.proposedText === "string" && p.proposedText.trim())
    .slice(0, 5)
    .map((p, idx) => ({
      id: `prop-${Date.now()}-${idx}`,
      blockIndex: p.blockIndex,
      kind: validKinds.has(p.kind) ? p.kind : "clarify",
      originalText: typeof p.originalText === "string" ? p.originalText : "",
      proposedText: p.proposedText.trim(),
      proposedBlockType: p.proposedBlockType && validTypes.has(p.proposedBlockType) ? p.proposedBlockType : "same",
      reason: typeof p.reason === "string" ? p.reason.trim().slice(0, 80) : "",
    }));

  return jsonResponse({ proposals });
}

// ── Mode 4: Pinpoint Selection AI Edit ─────────────────────────────────────

const EDIT_TOOL = {
  name: "emit_selection_edit",
  description: "Return a pinpoint replacement for the selected text based on the user's instruction.",
  input_schema: {
    type: "object",
    properties: {
      replacement: {
        type: "string",
        description:
          "The improved text to replace the selection (plain text; use \\n between lines if converting to multiple items).",
      },
      blockType: {
        type: "string",
        enum: ["same", "bullet", "checklist"],
        description: "Use 'bullet' or 'checklist' only when explicitly asked to convert to a list/checklist; otherwise 'same'.",
      },
      reason: {
        type: "string",
        description: "One short phrase describing the change.",
      },
    },
    required: ["replacement", "blockType", "reason"],
  },
};

async function handleEdit(apiKey: string, spend: Spend, body: RequestBody) {
  const title = clampText(body.title, 200).trim();
  const selectedText = clampText(body.selectedText, 4000).trim();
  const beforeContext = clampTail(body.beforeContext, 1000);
  const afterContext = clampText(body.afterContext, 1000);
  const instruction = clampText(body.instruction, 500).trim();
  const recentTranscript = clampTail(body.recentTranscript, 2500).trim();

  if (!selectedText || !instruction) {
    return jsonResponse({ error: "selectedText and instruction are required" }, 400);
  }

  const system = `あなたはノートの選択箇所だけをピンポイントで整える編集アシスタントです。

ルール:
- ${langInstruction(body.language)}
- ユーザーの指示に従い、選択されたテキストだけを過不足なく書き換える
- 選択箇所の外側の文章は返さない
- 事実・固有名詞・数値は変えず、創作しない（音声書き起こしにある情報での補足指示がある場合のみ参照可）
- 箇条書きやチェックリスト化の指示がある場合は、各項目を改行区切りで返し blockType に bullet / checklist を指定する（行頭の - や ・ は不要）`;

  const userPrompt = [
    `タイトル: ${title || "(無題)"}`,
    `指示: ${instruction}`,
    beforeContext ? `\n直前の文脈:\n${beforeContext}` : "",
    `\n修正対象の選択テキスト:\n${selectedText}`,
    afterContext ? `\n直後の文脈:\n${afterContext}` : "",
    recentTranscript ? `\n参考: 音声書き起こし:\n${recentTranscript}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const output = await callClaudeTool<{
    replacement?: string;
    blockType?: string;
    reason?: string;
  }>({
    apiKey,
    spend,
    model: SMART_MODEL,
    maxTokens: 1500,
    system,
    userPrompt,
    tool: EDIT_TOOL,
  });

  const blockType = output.blockType === "bullet" || output.blockType === "checklist" ? output.blockType : "same";
  return jsonResponse({
    replacement: typeof output.replacement === "string" ? output.replacement.trim() : selectedText,
    blockType,
    reason: typeof output.reason === "string" ? output.reason.trim() : "",
  });
}

// ── Budget & usage ─────────────────────────────────────────────────────────

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function monthStartIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Whether the month's AI budget still has room: the Space's, counted with its
 *  agent runs; or, for a Note in no Space, the person's own. */
async function budgetLeft(admin: SupabaseClient, spaceId: string | null, userId: string): Promise<boolean> {
  const since = monthStartIso();
  let budget = USER_MONTHLY_BUDGET_USD;
  let runs = admin.from("agent_runs").select("cost_usd").gte("created_at", since);
  let notes = admin.from("note_ai_usage").select("cost_usd").gte("created_at", since);
  if (spaceId) {
    const { data: space } = await admin.from("activity_spaces").select("ai_monthly_budget_usd").eq("id", spaceId).maybeSingle();
    budget = Number((space as { ai_monthly_budget_usd?: number | string | null } | null)?.ai_monthly_budget_usd ?? USER_MONTHLY_BUDGET_USD);
    runs = runs.eq("activity_space_id", spaceId);
    notes = notes.eq("activity_space_id", spaceId);
  } else {
    runs = runs.is("activity_space_id", null).eq("triggered_by", userId);
    notes = notes.is("activity_space_id", null).eq("user_id", userId);
  }
  const [{ data: runRows }, { data: noteRows }] = await Promise.all([runs, notes]);
  const spent = [...(runRows ?? []), ...(noteRows ?? [])]
    .reduce((sum: number, r: { cost_usd: number | string | null }) => sum + Number(r.cost_usd || 0), 0);
  return spent < budget;
}

// ── Entrypoint ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const mode = body.mode;
    if (!mode || !["structure", "complete", "propose", "edit"].includes(mode)) {
      return jsonResponse({ error: "mode must be one of structure, complete, propose, edit" }, 400);
    }

    const caller = await callerClient(req);
    if (!caller) return jsonResponse({ error: "Sign in to use AI." }, 401);
    if (!(await athenaAllowed(caller, body.spaceId))) return jsonResponse(PLAN_REFUSAL, 403);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!supabaseUrl || !serviceKey || !anthropicKey) {
      return jsonResponse({ error: "AI is not configured on this server" }, 500);
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who } = await admin.auth.getUser(token);
    const userId = who?.user?.id;
    if (!userId) return jsonResponse({ error: "Sign in to use AI." }, 401);
    // athenaAllowed read the Space as the caller, so a Space id here is one they belong to.
    const spaceId = isUuid(body.spaceId) ? body.spaceId : null;
    if (!(await budgetLeft(admin, spaceId, userId))) return jsonResponse(BUDGET_REFUSAL, 402);

    const spend: Spend = { model: mode === "complete" ? FAST_MODEL : SMART_MODEL, usd: 0 };
    try {
      if (mode === "structure") {
        return body.regroup
          ? await handleRegroup(anthropicKey, spend, body)
          : await handleStructure(anthropicKey, spend, body);
      }
      if (mode === "complete") return await handleComplete(anthropicKey, spend, body);
      if (mode === "propose") return await handlePropose(anthropicKey, spend, body);
      return await handleEdit(anthropicKey, spend, body);
    } finally {
      // What was spent is recorded whether or not the answer was usable.
      if (spend.usd > 0) {
        const { error } = await admin.from("note_ai_usage").insert({
          activity_space_id: spaceId, user_id: userId, mode, model: spend.model, cost_usd: spend.usd,
        });
        if (error) console.error("[note-ai] usage not recorded", error.message);
      }
    }
  } catch (err) {
    console.error("[note-ai] unhandled error", err);
    return jsonResponse({ error: (err as Error).message || "AI request failed" }, 500);
  }
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
