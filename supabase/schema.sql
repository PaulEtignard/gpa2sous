-- Gpadesous schema
-- Run this in Supabase Dashboard → SQL Editor

-- =========================================================================
-- Tables
-- =========================================================================

-- Accounts (one user can have multiple accounts: current, savings, cards...)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bank text,
  currency text not null default 'EUR',
  initial_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Categories (each user defines their own; we seed defaults via trigger)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#94a3b8',
  icon text,
  kind text not null default 'expense' check (kind in ('income','expense','transfer')),
  parent_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Transactions
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  booked_at date not null,
  description text not null,
  amount numeric(14,2) not null,        -- signed: negative = expense, positive = income
  currency text not null default 'EUR',
  raw_label text,                       -- original CSV label, kept for re-categorization
  source text not null default 'csv' check (source in ('csv','pdf','manual','bridge','powens')),
  external_id text,                     -- bank-provided unique id when available
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, account_id, external_id)
);

create index if not exists transactions_user_booked_at_idx
  on public.transactions (user_id, booked_at desc);
create index if not exists transactions_account_idx
  on public.transactions (account_id);
create index if not exists transactions_category_idx
  on public.transactions (category_id);

-- Categorization rules
create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,                -- substring matched against description (case-insensitive)
  category_id uuid not null references public.categories(id) on delete cascade,
  priority int not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists rules_user_priority_idx
  on public.rules (user_id, priority);

-- Budgets (monthly target per category)
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  monthly_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, category_id)
);

-- Import batches (audit trail of CSV uploads)
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  filename text not null,
  row_count int not null default 0,
  inserted_count int not null default 0,
  duplicate_count int not null default 0,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.accounts        enable row level security;
alter table public.categories      enable row level security;
alter table public.transactions    enable row level security;
alter table public.rules           enable row level security;
alter table public.budgets         enable row level security;
alter table public.import_batches  enable row level security;

-- Helper macro: generic policies for "own rows only" on user_id
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'accounts','categories','transactions','rules','budgets','import_batches'
  ]) loop
    execute format($f$
      drop policy if exists "own_select" on public.%I;
      create policy "own_select" on public.%I
        for select using (auth.uid() = user_id);

      drop policy if exists "own_insert" on public.%I;
      create policy "own_insert" on public.%I
        for insert with check (auth.uid() = user_id);

      drop policy if exists "own_update" on public.%I;
      create policy "own_update" on public.%I
        for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

      drop policy if exists "own_delete" on public.%I;
      create policy "own_delete" on public.%I
        for delete using (auth.uid() = user_id);
    $f$, t, t, t, t, t, t, t, t);
  end loop;
end$$;

-- =========================================================================
-- Seed default categories on first signup
-- =========================================================================

create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, color, kind) values
    (new.id, 'Salaire',              '#16a34a', 'income'),
    (new.id, 'Autres revenus',       '#22c55e', 'income'),
    (new.id, 'Alimentation',         '#f59e0b', 'expense'),
    (new.id, 'Restaurants & bars',   '#f97316', 'expense'),
    (new.id, 'Transports',           '#3b82f6', 'expense'),
    (new.id, 'Logement',             '#8b5cf6', 'expense'),
    (new.id, 'Factures & abos',      '#a855f7', 'expense'),
    (new.id, 'Santé',                '#ec4899', 'expense'),
    (new.id, 'Shopping',             '#ef4444', 'expense'),
    (new.id, 'Loisirs',              '#14b8a6', 'expense'),
    (new.id, 'Voyages',              '#06b6d4', 'expense'),
    (new.id, 'Cadeaux & dons',       '#84cc16', 'expense'),
    (new.id, 'Retraits',             '#64748b', 'expense'),
    (new.id, 'Virements internes',   '#94a3b8', 'transfer'),
    (new.id, 'Autres dépenses',      '#6b7280', 'expense');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_default_categories();
