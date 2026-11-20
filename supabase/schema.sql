-- Wildbound · Supabase schema (run in the Supabase SQL editor).
-- Phase 1 tables: profiles, clans, clan_members, bands, band_members, activities, gatherings, gathering_rsvps, messages.
-- Phase 2 table: vigils (read-only from the client for now; writes will go through server functions).

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  primary_aspect text not null,
  secondary_aspect text,
  created_at timestamptz not null default now()
);

create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 32),
  aspect text not null,
  motto text check (char_length(motto) <= 60),
  hub_name text,
  hub_lat double precision not null,
  hub_lng double precision not null,
  xp numeric not null default 0,
  seals int not null default 1,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

-- One clan per person.
create table if not exists public.clan_members (
  user_id uuid primary key references public.profiles on delete cascade,
  clan_id uuid not null references public.clans on delete cascade,
  role text not null default 'member' check (role in ('member', 'elder', 'founder')),
  joined_at timestamptz not null default now()
);

create table if not exists public.bands (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans on delete cascade,
  name text not null check (char_length(name) between 2 and 32),
  focus text not null,          -- activity type, e.g. 'strength', 'sport'
  spot_name text,
  spot_lat double precision,
  spot_lng double precision,
  usual_time text,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  unique (clan_id, name)
);

create table if not exists public.band_members (
  band_id uuid not null references public.bands on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (band_id, user_id)
);

create table if not exists public.activities (
  id text primary key,                         -- client id (or source id for synced workouts) → idempotent
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  clan_id uuid references public.clans on delete set null,
  type text not null,
  aspect text not null,
  minutes int not null check (minutes between 1 and 600),
  distance_km numeric check (distance_km between 0 and 300),
  elev_m numeric,
  intensity text,
  source text not null default 'manual',
  xp int not null default 0,
  trail_km numeric not null default 0,
  place text,
  occurred_at timestamptz not null default now()
);
create index if not exists activities_clan_time on public.activities (clan_id, occurred_at desc);

create table if not exists public.gatherings (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans on delete cascade,
  band_id uuid references public.bands on delete set null,
  host_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null check (char_length(title) <= 60),
  type text not null,
  spot_name text not null,
  lat double precision not null,
  lng double precision not null,
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists gatherings_time on public.gatherings (starts_at);

create table if not exists public.gathering_rsvps (
  gathering_id uuid not null references public.gatherings on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  status text not null default 'going' check (status in ('going', 'attended')),
  updated_at timestamptz not null default now(),
  primary key (gathering_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans on delete cascade,
  band_id uuid references public.bands on delete cascade,  -- null = whole-clan channel
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null default 'msg' check (kind in ('msg', 'rally', 'activity')),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists messages_clan_time on public.messages (clan_id, created_at desc);

create table if not exists public.vigils (
  id text primary key,                  -- landmark id, e.g. 'space-needle'
  holder_clan uuid references public.clans on delete set null,
  ward int not null default 0,
  shield_until date,
  updated_at timestamptz not null default now()
);

-- ---------- helpers ----------
create or replace function public.my_clan() returns uuid
language sql stable security definer set search_path = public as $$
  select clan_id from public.clan_members where user_id = auth.uid()
$$;

-- Clan XP grows with every member's trail distance (server-side, so clients can't inflate it directly).
create or replace function public.add_clan_xp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.clan_id is not null then
    update public.clans set xp = xp + least(new.trail_km, 100) where id = new.clan_id;
  end if;
  return new;
end $$;
drop trigger if exists activities_xp on public.activities;
create trigger activities_xp after insert on public.activities for each row execute function public.add_clan_xp();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.bands enable row level security;
alter table public.band_members enable row level security;
alter table public.activities enable row level security;
alter table public.gatherings enable row level security;
alter table public.gathering_rsvps enable row level security;
alter table public.messages enable row level security;
alter table public.vigils enable row level security;

create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create policy "clans readable" on public.clans for select to authenticated using (true);
create policy "found a clan" on public.clans for insert to authenticated with check (created_by = auth.uid());
create policy "founder edits clan" on public.clans for update to authenticated using (created_by = auth.uid());

create policy "members readable" on public.clan_members for select to authenticated using (true);
create policy "join a clan" on public.clan_members for insert to authenticated with check (user_id = auth.uid());
create policy "leave a clan" on public.clan_members for delete to authenticated using (user_id = auth.uid());

create policy "bands readable" on public.bands for select to authenticated using (true);
create policy "start a band in my clan" on public.bands for insert to authenticated with check (clan_id = public.my_clan() and created_by = auth.uid());

create policy "band members readable" on public.band_members for select to authenticated using (true);
create policy "join a band in my clan" on public.band_members for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.bands b where b.id = band_id and b.clan_id = public.my_clan()));
create policy "leave a band" on public.band_members for delete to authenticated using (user_id = auth.uid());

create policy "clan activities readable" on public.activities for select to authenticated using (user_id = auth.uid() or clan_id = public.my_clan());
create policy "log own activity" on public.activities for insert to authenticated with check (user_id = auth.uid() and (clan_id is null or clan_id = public.my_clan()));

create policy "gatherings readable" on public.gatherings for select to authenticated using (true);
create policy "host for my clan" on public.gatherings for insert to authenticated with check (host_id = auth.uid() and clan_id = public.my_clan());
create policy "host edits gathering" on public.gatherings for delete to authenticated using (host_id = auth.uid());

create policy "rsvps readable" on public.gathering_rsvps for select to authenticated using (true);
create policy "own rsvp" on public.gathering_rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "own rsvp update" on public.gathering_rsvps for update to authenticated using (user_id = auth.uid());
create policy "own rsvp delete" on public.gathering_rsvps for delete to authenticated using (user_id = auth.uid());

create policy "clan chat readable" on public.messages for select to authenticated using (clan_id = public.my_clan());
create policy "post in my clan" on public.messages for insert to authenticated with check (user_id = auth.uid() and clan_id = public.my_clan());

create policy "vigils readable" on public.vigils for select to authenticated using (true);

-- ---------- realtime ----------
alter publication supabase_realtime add table public.messages, public.gatherings, public.gathering_rsvps, public.activities;
