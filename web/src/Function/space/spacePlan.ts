// A Space's plan, as the app reads it. The plan itself is kept on the Space
// row and moves only through the service; the Domain limit and Athena's gate
// are enforced there too (supabase/migrations/20270116090000_space_plans.sql,
// supabase/functions/_shared/plan.ts). What is here only says the same rules
// on screen, so a person learns the limit before they meet the refusal.

export type SpacePlan = 'free' | 'team' | 'enterprise';

export const SPACE_PLANS: readonly SpacePlan[] = ['free', 'team', 'enterprise'];

export interface PlanTerms {
  id: SpacePlan;
  /** Yen per member per month for the work itself; null for a contract price. */
  yenPerMember: number | null;
  /** Domains a Space may hold; null for no limit. */
  domainLimit: number | null;
  athena: boolean;
}

export const PLAN_TERMS: Record<SpacePlan, PlanTerms> = {
  free: { id: 'free', yenPerMember: 0, domainLimit: 2, athena: false },
  team: { id: 'team', yenPerMember: 500, domainLimit: null, athena: true },
  enterprise: { id: 'enterprise', yenPerMember: null, domainLimit: null, athena: true },
};

/** Pure. A stored value as a plan; anything unknown is read as free, the plan that allows least. */
export function planOf(value: unknown): SpacePlan {
  return SPACE_PLANS.includes(value as SpacePlan) ? (value as SpacePlan) : 'free';
}

/** Pure. Whether a Space on this plan, holding this many Domains, may add one more. */
export function canAddDomain(plan: SpacePlan, domainCount: number): boolean {
  const limit = PLAN_TERMS[plan].domainLimit;
  return limit === null || domainCount < limit;
}

/** Pure. Whether Athena works in a Space on this plan. */
export function planHasAthena(plan: SpacePlan): boolean {
  return PLAN_TERMS[plan].athena;
}

/** Pure. Whether an error is the server's Domain-limit refusal. */
export function isDomainLimitError(error: unknown): boolean {
  const e = error as { hint?: unknown; message?: unknown } | null;
  return !!e && (e.hint === 'plan_domain_limit' || (typeof e.message === 'string' && e.message.includes('Free plan holds up to')));
}
