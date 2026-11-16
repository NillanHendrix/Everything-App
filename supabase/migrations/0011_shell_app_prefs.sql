-- Shell: Reihenfolge der Apps (Drag & Drop auf der Startseite) und Archiv (ausgeblendete Apps), pro Nutzer.

create table if not exists public.shell_app_prefs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_id text not null,
  -- null = noch nie verschoben: App steht hinter den sortierten, in Manifest-Reihenfolge.
  position int,
  archived boolean not null default false,
  primary key (user_id, app_id)
);

alter table public.shell_app_prefs enable row level security;

drop policy if exists "shell_app_prefs: own rows" on public.shell_app_prefs;
create policy "shell_app_prefs: own rows" on public.shell_app_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
