-- Gap checks: what Athena found when it read a Strategy against the work
-- under it — the Elements, Objects and Strategies below that have drifted
-- from what the Strategy says, and what the Strategy asks for that no work
-- is doing.
--
-- A check is a record, never an edit: it says what was found at one moment,
-- and the Strategy's Gap tab shows the newest one beside the gaps it reads
-- on its own (broken bases, unserved conditions). Rows are written only by
-- the strategy-gap Edge Function (service role), after it has read the
-- Strategy as the caller — so a finding is what the model said, not what a
-- client typed. Everyone who can read the Strategy reads its checks.
-- Guarded for preview replay: the base schema may be absent.
do $$
begin
  if to_regclass('public.strategies') is null
     or to_regprocedure('public.user_can_read_strategy(uuid)') is null then
    raise notice 'strategy_gap_checks skipped: strategies / user_can_read_strategy not present';
    return;
  end if;

  execute $ddl$
    create table if not exists public.strategy_gap_checks (
      id uuid primary key default gen_random_uuid(),
      strategy_id uuid not null references public.strategies(id) on delete cascade,
      activity_space_id uuid,
      checked_by uuid default auth.uid(),
      summary text not null default '' check (char_length(summary) <= 4000),
      findings jsonb not null default '[]' check (jsonb_typeof(findings) = 'array'),
      uncovered jsonb not null default '[]' check (jsonb_typeof(uncovered) = 'array'),
      scope jsonb not null default '{}' check (jsonb_typeof(scope) = 'object'),
      model text,
      cost_usd numeric not null default 0,
      created_at timestamptz not null default now()
    )
  $ddl$;
  execute 'create index if not exists strategy_gap_checks_strategy on public.strategy_gap_checks (strategy_id, created_at desc)';
  execute 'create index if not exists strategy_gap_checks_space on public.strategy_gap_checks (activity_space_id, created_at desc)';
  execute 'alter table public.strategy_gap_checks enable row level security';
  execute 'drop policy if exists strategy_gap_checks_select on public.strategy_gap_checks';
  execute 'create policy strategy_gap_checks_select on public.strategy_gap_checks for select to authenticated using (public.user_can_read_strategy(strategy_id))';
end $$;
