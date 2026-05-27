-- Migration 001 — Add 'pdf' to the allowed `source` values on transactions.
-- Run this in Supabase SQL Editor if you applied schema.sql before this migration existed.

alter table public.transactions
  drop constraint if exists transactions_source_check;

alter table public.transactions
  add constraint transactions_source_check
  check (source in ('csv','pdf','manual','bridge','powens'));
