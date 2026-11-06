-- WoW: Charakter-Gruppen (per Drag & Drop sortierbar) und Spielversionen (Retail, Classic, Forever …).

create table if not exists public.wow_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.wow_groups enable row level security;

drop policy if exists "wow_groups: own rows" on public.wow_groups;
create policy "wow_groups: own rows" on public.wow_groups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.wow_characters
  add column if not exists game text not null default 'retail'
    check (game in ('retail', 'classic', 'classic1x', 'classicann', 'forever')),
  add column if not exists group_id uuid references public.wow_groups (id) on delete set null,
  add column if not exists position int not null default 0;

-- Derselbe Name kann auf Retail und Classic existieren: Spielversion gehört zur Eindeutigkeit.
alter table public.wow_characters drop constraint if exists wow_characters_user_id_region_realm_name_key;
alter table public.wow_characters drop constraint if exists wow_characters_user_game_region_realm_name_key;
alter table public.wow_characters
  add constraint wow_characters_user_game_region_realm_name_key unique (user_id, game, region, realm, name);

-- PostgREST-Schema-Cache neu laden, damit die neuen Spalten sofort sichtbar sind.
notify pgrst, 'reload schema';
