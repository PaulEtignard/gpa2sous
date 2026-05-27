-- Job queue for long-running background tasks (AI categorization, etc.)
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null default 'ai_categorize',
  status      text not null default 'pending'
                check (status in ('pending','running','done','error')),
  result      jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jobs_user_status_idx on public.jobs (user_id, status, updated_at desc);

alter table public.jobs enable row level security;

drop policy if exists "own_select" on public.jobs;
create policy "own_select" on public.jobs for select using (auth.uid() = user_id);

drop policy if exists "own_insert" on public.jobs;
create policy "own_insert" on public.jobs for insert with check (auth.uid() = user_id);

drop policy if exists "own_update" on public.jobs;
create policy "own_update" on public.jobs for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_delete" on public.jobs;
create policy "own_delete" on public.jobs for delete using (auth.uid() = user_id);
