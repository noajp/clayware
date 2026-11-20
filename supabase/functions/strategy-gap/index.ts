// strategy-gap — Athena reads a Strategy against the work under it and
// records where the two have drifted apart.
//
// Request (POST JSON, Authorization: Bearer <the person's Supabase JWT>):
//   { strategyId }
// Response: the strategy_gap_checks row it wrote.
//
// Everything is read as the caller (RLS): the Strategy, the Strategies
// below it, their Objects and the open Elements in them. What the caller
// cannot read, the model never sees, and a finding can only name what the
// model was given (gapBrief.readAnswer). Only the record itself is written
// with the service role, as code-changes writes its intent check.
//
// It is called by a person from the Strategy's Evaluation tab — never on a
// schedule — and it stops before the model when the Space's monthly AI
// budget is already spent.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { athenaAllowed, PLAN_REFUSAL } from "../_shared/plan.ts";
import { DEFAULT_AGENT_MODEL, costOf } from "../_shared/aiPricing.ts";
import {
  ANSWER_SCHEMA, briefOf, MAX_ELEMENTS, readAnswer, SYSTEM,
  type BriefElement, type BriefIntent, type BriefObject, type BriefStrategy, type GapInput,
} from "./gapBrief.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** How deep below the Strategy the check walks. */
const MAX_DEPTH = 4;
const CHUNK = 200;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

async function inChunks<T>(ids: string[], read: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await read(ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/** Everything the check reads, as the caller sees it. */
async function readScope(db: SupabaseClient, root: BriefStrategy): Promise<GapInput> {
  // The Strategies below, breadth first, each once at its shallowest depth.
  const below: BriefStrategy[] = [];
  const seen = new Set([root.id]);
  let frontier = [root.id];
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
    const links = await inChunks<{ child_strategy_id: string }>(frontier, (c) =>
      db.from("strategy_children").select("child_strategy_id").in("parent_strategy_id", c).order("order_index"));
    const ids = [...new Set(links.map((l) => l.child_strategy_id))].filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));
    const rows = await inChunks<{ id: string; name: string; description: string | null }>(ids, (c) =>
      db.from("strategies").select("id, name, description").in("id", c));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of ids) { const r = byId.get(id); if (r) below.push({ ...r, depth }); }
    frontier = ids.filter((id) => byId.has(id));
  }

  const strategyIds = [root.id, ...below.map((s) => s.id)];
  const links = await inChunks<{ strategy_id: string; object_id: string }>(strategyIds, (c) =>
    db.from("strategy_objects").select("strategy_id, object_id").in("strategy_id", c));
  const holder = new Map<string, string>();
  // An Object held by several is listed under the shallowest.
  for (const sid of strategyIds) for (const l of links) if (l.strategy_id === sid && !holder.has(l.object_id)) holder.set(l.object_id, sid);
  const objectRows = await inChunks<{ id: string; name: string; description: string | null }>([...holder.keys()], (c) =>
    db.from("objects").select("id, name, description").in("id", c).is("archived_at", null));
  const objects: BriefObject[] = objectRows.map((o) => ({ ...o, strategyId: holder.get(o.id)! }));
  const objectIds = objects.map((o) => o.id);

  const [junction, legacy] = await Promise.all([
    inChunks<{ element_id: string; object_id: string }>(objectIds, (c) => db.from("element_objects").select("element_id, object_id").in("object_id", c)),
    inChunks<{ id: string; object_id: string }>(objectIds, (c) => db.from("elements").select("id, object_id").in("object_id", c)),
  ]);
  const homeOf = new Map<string, string>();
  for (const l of legacy) homeOf.set(l.id, l.object_id);
  for (const j of junction) if (!homeOf.has(j.element_id)) homeOf.set(j.element_id, j.object_id);

  type ElementRow = { id: string; display_id: string | null; title: string; description: string | null; status: string | null; updated_at: string | null };
  const elementRows = (await inChunks<ElementRow>([...homeOf.keys()], (c) =>
    db.from("elements").select("id, display_id, title, description, status, updated_at").in("id", c)))
    .filter((e) => e.status !== "done" && e.status !== "cancelled")
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  const kept = elementRows.slice(0, MAX_ELEMENTS);

  const { data: intentRows, error: intentErr } = await db.from("intents")
    .select("id, kind, title, subtitle, verdict, superseded_by_intent_id")
    .eq("strategy_id", root.id).neq("kind", "master").order("order_index");
  if (intentErr) throw new Error(intentErr.message);
  const intents: BriefIntent[] = ((intentRows ?? []) as { id: string; kind: string; title: string; subtitle: string | null; verdict: string | null; superseded_by_intent_id: string | null }[])
    .map((r) => ({ id: r.id, kind: r.kind, title: r.title, subtitle: r.subtitle, verdict: r.verdict, superseded: !!r.superseded_by_intent_id }));
  const intentIds = new Set(intents.map((i) => i.id));
  const bindings = await inChunks<{ intent_id: string; target_id: string }>(kept.map((e) => e.id), (c) =>
    db.from("intent_bindings").select("intent_id, target_id").eq("target_type", "element").in("target_id", c));

  const elements: BriefElement[] = kept.map((e) => ({
    id: e.id, displayId: e.display_id, title: e.title, description: e.description, status: e.status ?? "todo",
    objectId: homeOf.get(e.id) ?? null,
    intentIds: bindings.filter((b) => b.target_id === e.id && intentIds.has(b.intent_id)).map((b) => b.intent_id),
  }));
  return { root, intents, below, objects, elements, skipped: elementRows.length - kept.length };
}

/** Whether the Space's monthly AI budget still has room, counted as run-agent counts it. */
async function budgetLeft(admin: SupabaseClient, spaceId: string | null): Promise<boolean> {
  if (!spaceId) return true;
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const since = monthStart.toISOString();
  const [{ data: space }, { data: runs }, { data: checks }] = await Promise.all([
    admin.from("activity_spaces").select("ai_monthly_budget_usd").eq("id", spaceId).maybeSingle(),
    admin.from("agent_runs").select("cost_usd").eq("activity_space_id", spaceId).gte("created_at", since),
    admin.from("strategy_gap_checks").select("cost_usd").eq("activity_space_id", spaceId).gte("created_at", since),
  ]);
  const budget = Number((space as { ai_monthly_budget_usd?: number | string | null } | null)?.ai_monthly_budget_usd ?? 20);
  const spent = [...(runs ?? []), ...(checks ?? [])].reduce((s: number, r: { cost_usd: number | string | null }) => s + Number(r.cost_usd || 0), 0);
  return spent < budget;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey || !apiKey) return json({ error: "server env not configured" }, 500);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }

  const jwt = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!jwt || jwt === anonKey) return json({ error: "Sign in to use AI." }, 401);
  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authErr } = await userDb.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "session expired or invalid" }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const strategyId = typeof body.strategyId === "string" ? body.strategyId : "";
  if (!strategyId) return json({ error: "strategyId is required" }, 400);
  const { data: strategy } = await userDb.from("strategies")
    .select("id, name, description, activity_space_id").eq("id", strategyId).maybeSingle();
  if (!strategy) return json({ error: "Strategy not found" }, 404);
  const row = strategy as { id: string; name: string; description: string | null; activity_space_id: string | null };

  if (!(await athenaAllowed(userDb, row.activity_space_id))) return json(PLAN_REFUSAL, 403);
  if (!(await budgetLeft(admin, row.activity_space_id))) {
    return json({ error: "This month's AI budget for the Space is used up. Raise it in Settings to check again.", code: "budget_exceeded" }, 402);
  }

  try {
    const input = await readScope(userDb, { id: row.id, name: row.name, description: row.description, depth: 0 });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_AGENT_MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: ANSWER_SCHEMA } },
        messages: [{ role: "user", content: briefOf(input) }],
      }),
      signal: AbortSignal.timeout(140_000),
    });
    if (!res.ok) {
      const detail = await res.text().then((t) => t.slice(0, 300), () => "");
      return json({ error: `The model returned ${res.status}${detail ? `: ${detail}` : ""}` }, 502);
    }
    const out = await res.json() as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: Record<string, number> };
    if (out.stop_reason === "refusal") return json({ error: "The model declined to read this Strategy" }, 502);
    let raw: unknown;
    try { raw = JSON.parse(out.content?.find((b) => b.type === "text")?.text ?? ""); } catch { return json({ error: "The model returned no answer" }, 502); }
    const answer = readAnswer(input, raw);

    const { data: saved, error: saveErr } = await admin.from("strategy_gap_checks").insert({
      strategy_id: row.id,
      activity_space_id: row.activity_space_id,
      checked_by: user.id,
      summary: answer.summary,
      findings: answer.findings,
      uncovered: answer.uncovered,
      scope: { strategies: 1 + input.below.length, objects: input.objects.length, elements: input.elements.length, skipped: input.skipped },
      model: DEFAULT_AGENT_MODEL,
      cost_usd: costOf(DEFAULT_AGENT_MODEL, out.usage ?? {}),
    }).select("*").single();
    if (saveErr) return json({ error: saveErr.message }, 500);
    return json(saved);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
