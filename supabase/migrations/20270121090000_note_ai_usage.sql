-- What the Note's AI (voice minutes, line completion, refinements) spent,
-- one row per call, so it counts against the same monthly AI budget as
-- agent runs (activity_spaces.ai_monthly_budget_usd).
--
-- Rows are written and read only by the note-ai Edge Function (service
-- role): row level security is on with no policy, so no client reads them.
-- Guarded for preview replay: the base schema may be absent.
do $$
begin
  if to_regclass('public.activity_spaces') is null then
    raise notice 'note_ai_usage skipped: activity_spaces not present';
    return;
  end if;

  execute $ddl$
    create table if not exists public.note_ai_usage (
      id uuid primary key default gen_random_uuid(),
      activity_space_id uuid references public.activity_spaces(id) on delete cascade,
      user_id uuid not null,
      mode text not null check (mode in ('structure', 'complete', 'propose', 'edit')),
      model text not null,
      cost_usd numeric not null default 0 check (cost_usd >= 0),
      created_at timestamptz not null default now()
    )
  $ddl$;
  execute 'create index if not exists note_ai_usage_space on public.note_ai_usage (activity_space_id, created_at desc)';
  execute 'create index if not exists note_ai_usage_user on public.note_ai_usage (user_id, created_at desc)';
  execute 'alter table public.note_ai_usage enable row level security';
end $$;
