// Whether Athena may work for a Space, by the Space's plan.
//
// A free Space has no Athena; team and enterprise do. Every function that
// calls a model asks here first, with the Space the work belongs to.
//
// The client passed in decides whose view the answer is from:
//   - a person's client (anon key + their JWT): a Space they are not a member
//     of is not found, so it is refused like a free one;
//   - the service client: the Space's plan alone, for work the server starts
//     (automations, the heartbeat).
// Where the work names no Space (a draft before it is filed anywhere), the
// person's own client is asked whether any Space they belong to has Athena.
// The plan column itself is in supabase/migrations/20270116092000_space_plans.sql.

export const ATHENA_PLANS = ["team", "enterprise"] as const;

/** The refusal every function returns, in the same shape. */
export const PLAN_REFUSAL = {
  error: "Athena is available from the Team plan. Ask the Space's owner to move it to Team.",
  code: "plan_requires_team",
} as const;
/** The same refusal, where it is written on a run's record. */
export const PLAN_REFUSAL_JA = "Athena は Team プランから使えます。Space のオーナーが Team に変えると使えるようになります（設定 › プラン）。";

// Any Supabase client: only from() is used, so callers on other client versions fit.
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Whether Athena may work in this Space (or, with no Space, for this person at all). */
export async function athenaAllowed(db: Db, spaceId: unknown): Promise<boolean> {
  if (isUuid(spaceId)) {
    const { data } = await db.from("activity_spaces").select("plan").eq("id", spaceId).maybeSingle();
    return !!data && (ATHENA_PLANS as readonly string[]).includes((data as { plan?: string }).plan ?? "");
  }
  const { data } = await db.from("activity_spaces").select("id").in("plan", ATHENA_PLANS as unknown as string[]).limit(1);
  return (data ?? []).length > 0;
}

/** A person's client from the request's Authorization header, or null when there is none. */
export async function callerClient(req: Request): Promise<Db | null> {
  const authorization = req.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !url || !anon) return null;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.86.2");
  return createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
}
