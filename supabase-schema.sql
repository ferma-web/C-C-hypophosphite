-- Run this once in your Supabase project: SQL Editor -> New query -> paste
-- and run. Creates the table that drafts.js reads/writes, with an access
-- policy matching an "anyone with the site link can add/see structures"
-- model (no login) -- see README.md for the trade-offs of that model.

create table if not exists public.drafts (
  id text primary key,
  category integer,
  name text not null,
  formula text,
  cas text,
  loading_umol double precision,
  yield_analyt double precision,
  yield_iso double precision,
  note text,
  smiles text,
  reactions jsonb default '[]'::jsonb,
  image text,               -- data: URL (PNG), rendered client-side by SmilesDrawer
  created_at timestamptz default now()
);

alter table public.drafts enable row level security;

-- Anyone holding the anon key (i.e. anyone who has the deployed site, since
-- it's checked into config.js) can read every draft...
create policy "drafts are readable by anyone with the anon key"
  on public.drafts for select
  to anon
  using (true);

-- ...and can add new ones...
create policy "drafts are insertable by anyone with the anon key"
  on public.drafts for insert
  to anon
  with check (true);

-- ...and can delete any of them (there's no per-user identity to restrict
-- this to "your own" without adding real auth -- see README if you want
-- that later). Remove this policy if you'd rather drafts only be removable
-- by hand in the Supabase table editor.
create policy "drafts are deletable by anyone with the anon key"
  on public.drafts for delete
  to anon
  using (true);
