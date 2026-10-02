-- Cache of ALL reactions from the OdanLab project (149 total, generated 2026-10-02).
-- Not shown on the site by default. Lets the 'add by code' button on add.html
-- look up a reaction by its short code (e.g. AAP-36), prefill the add form, AND
-- show the structure picture automatically (as a data: URI SVG) without redrawing it.
--
-- Run this FIRST in Supabase's SQL Editor (same place you ran supabase-schema.sql).
-- It only creates the table / policy and clears existing rows -- it does NOT
-- insert anything. After this, run 01.sql, 02.sql, ... in order (each is a
-- separate SQL Editor query -- the full dataset is too large for Supabase's
-- SQL Editor to run as a single query, hence the split into small files).

create table if not exists public.odanlab_cache (
  code text primary key,
  reaction_id text,
  name text,
  reagents text,
  yield_analyt double precision,
  already_tracked boolean default false,
  structure_image text,
  created_at timestamptz
);

-- Safe to run even if the table already exists from an earlier version of this file
-- (without the structure_image column).
alter table public.odanlab_cache add column if not exists structure_image text;

alter table public.odanlab_cache enable row level security;
drop policy if exists "odanlab_cache is readable by anyone with the anon key" on public.odanlab_cache;
create policy "odanlab_cache is readable by anyone with the anon key"
  on public.odanlab_cache for select to anon using (true);

truncate table public.odanlab_cache;
