-- Схема базы для сайта (Supabase). Уже применена к проекту ltagfebavqqjjggwinzq;
-- файл лежит здесь для истории и на случай переезда в новый проект.
--
--   molecules          — все карточки сайта (и из OdanLab, и нарисованные вручную).
--                        Читать/добавлять/редактировать может любой, у кого есть ссылка.
--                        Удаление «мягкое»: deleted = true (карточку можно вернуть).
--   molecule_history   — журнал: старая версия строки при каждом изменении (для отката).
--   odanlab_reactions      — справочник всех реакций проекта OdanLab (по шифру).
--                        На сайте не показывается, используется только для «Создать по шифру».
--                        Заполняется Claude через коннектор OdanLab (раз в день).

create table if not exists public.molecules (
  id               text primary key default gen_random_uuid()::text,
  category         integer not null default 4 check (category between 1 and 4),
  name             text not null check (length(name) between 1 and 500),
  formula          text,
  cas              text,
  loading_umol     double precision,
  yield_analyt     double precision,
  yield_iso        double precision,
  mass_measured_mg double precision,
  melt_point_c     double precision,
  note             text,
  smiles           text,
  molfile          text,
  reactions        jsonb not null default '[]'::jsonb,   -- [{ "code": "AAP-36", "id": "<uuid реакции в OdanLab>" }]
  image            text,                                 -- путь в репо или data: URI; null → рисуем по smiles
  source           text not null default 'manual',       -- 'odanlab' | 'manual'
  deleted          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       text
);

create table if not exists public.molecule_history (
  hist_id     bigint generated always as identity primary key,
  molecule_id text not null,
  op          text not null,
  old_row     jsonb,
  changed_at  timestamptz not null default now(),
  changed_by  text
);

create table if not exists public.odanlab_reactions (
  code             text primary key,      -- короткий шифр, напр. AAP-36
  reaction_id      text not null,
  display_id       text,
  name             text,                  -- название основного продукта
  reagents         text,
  yield_analyt     double precision,
  yield_iso        double precision,
  mass_measured_mg double precision,
  loading_umol     double precision,
  formula          text,
  cas              text,
  smiles           text,
  created_at       timestamptz,
  updated_at       timestamptz,           -- время изменения в OdanLab
  synced_at        timestamptz not null default now()
);

-- updated_at + журнал изменений
create or replace function public.molecules_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.molecules_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.molecule_history (molecule_id, op, old_row, changed_by)
  values (new.id, tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          new.updated_by);
  return new;
end $$;

drop trigger if exists molecules_touch on public.molecules;
create trigger molecules_touch before update on public.molecules
  for each row execute function public.molecules_touch();
drop trigger if exists molecules_log on public.molecules;
create trigger molecules_log after insert or update on public.molecules
  for each row execute function public.molecules_log();

-- Когда в OdanLab меняются выходы, обновляем карточки с этим шифром —
-- но только те поля, которые никто не правил на сайте вручную
-- (т.е. значение в карточке всё ещё равно старому значению из OdanLab).
create or replace function public.odanlab_reactions_propagate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.molecules m set
    yield_analyt = case when m.yield_analyt is not distinct from old.yield_analyt then new.yield_analyt else m.yield_analyt end,
    yield_iso = case when m.yield_iso is not distinct from old.yield_iso then new.yield_iso else m.yield_iso end,
    mass_measured_mg = case when m.mass_measured_mg is not distinct from old.mass_measured_mg then new.mass_measured_mg else m.mass_measured_mg end,
    updated_by = 'OdanLab (авто)'
  where m.deleted = false
    and m.reactions -> 0 ->> 'code' = new.code
    and ((new.yield_analyt is distinct from old.yield_analyt and m.yield_analyt is not distinct from old.yield_analyt)
      or (new.yield_iso is distinct from old.yield_iso and m.yield_iso is not distinct from old.yield_iso)
      or (new.mass_measured_mg is distinct from old.mass_measured_mg and m.mass_measured_mg is not distinct from old.mass_measured_mg));
  return new;
end $$;

drop trigger if exists odanlab_reactions_propagate on public.odanlab_reactions;
create trigger odanlab_reactions_propagate after update on public.odanlab_reactions
  for each row execute function public.odanlab_reactions_propagate();

-- Доступ: «у кого есть ссылка — тот может смотреть и редактировать».
alter table public.molecules enable row level security;
alter table public.molecule_history enable row level security;
alter table public.odanlab_reactions enable row level security;

create policy "molecules: read" on public.molecules for select to anon, authenticated using (true);
create policy "molecules: insert" on public.molecules for insert to anon, authenticated with check (true);
create policy "molecules: update" on public.molecules for update to anon, authenticated using (true) with check (true);
-- DELETE намеренно не разрешён: удаление = deleted = true.

create policy "history: read" on public.molecule_history for select to anon, authenticated using (true);
create policy "odanlab_reactions: read" on public.odanlab_reactions for select to anon, authenticated using (true);

revoke delete, truncate on public.molecules from anon, authenticated;
revoke insert, update, delete, truncate on public.molecule_history from anon, authenticated;
revoke insert, update, delete, truncate on public.odanlab_reactions from anon, authenticated;

-- Триггерные функции не должны вызываться через REST.
revoke execute on function public.molecules_log(), public.odanlab_reactions_propagate(), public.molecules_touch() from public, anon, authenticated;
