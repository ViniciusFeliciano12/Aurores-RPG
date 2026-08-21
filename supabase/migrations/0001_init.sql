-- Wyrdcall — Schema Inicial (Corrigido)
-- Rode este arquivo inteiro no SQL Editor do Supabase dashboard.

-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_path text,
  created_at timestamptz not null default now()
);

-- Trigger para criar perfil de novos usuários automaticamente
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 2. CAMPAIGNS & MEMBERS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'player' check (role in ('master', 'player')),
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (campaign_id, player_id)
);

-- Garante apenas um mestre por campanha
create unique index if not exists one_master_per_campaign
  on public.campaign_members (campaign_id)
  where role = 'master';

-- Torna o criador da campanha mestre automaticamente
create or replace function public.make_creator_master()
returns trigger as $$
begin
  insert into public.campaign_members (campaign_id, player_id, role, status)
  values (new.id, auth.uid(), 'master', 'accepted');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_make_creator_master on public.campaigns;
create trigger trg_make_creator_master
  after insert on public.campaigns
  for each row execute function public.make_creator_master();

-- ─────────────────────────────────────────────────────────────
-- 3. CHARACTERS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  name text not null,
  sheet jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Garante que o dono do personagem é membro aceito da campanha
create or replace function public.check_character_campaign_membership()
returns trigger as $$
begin
  if new.campaign_id is not null then
    if not exists (
      select 1 from public.campaign_members
      where campaign_id = new.campaign_id
        and player_id = new.owner_id
        and status = 'accepted'
    ) then
      raise exception 'O dono do personagem precisa ser um membro aceito da campanha';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_check_character_campaign on public.characters;
create trigger trg_check_character_campaign
  before insert or update of campaign_id, owner_id on public.characters
  for each row execute function public.check_character_campaign_membership();

-- Desvincula personagens quando o jogador sai da campanha
create or replace function public.unlink_characters_on_membership_removal()
returns trigger as $$
begin
  update public.characters
  set campaign_id = null
  where campaign_id = old.campaign_id
    and owner_id = old.player_id;
  return old;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_unlink_characters on public.campaign_members;
create trigger trg_unlink_characters
  after delete on public.campaign_members
  for each row execute function public.unlink_characters_on_membership_removal();

-- ─────────────────────────────────────────────────────────────
-- 4. FUNÇÕES DE SUPORTE SECURITY DEFINER (Previne Recursão RLS)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_campaign_member(p_campaign_id uuid, p_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id 
      and player_id = p_user_id
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.is_campaign_master(p_campaign_id uuid, p_user_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id 
      and player_id = p_user_id 
      and role = 'master'
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.are_co_members(p_user_a uuid, p_user_b uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.campaign_members cm1
    join public.campaign_members cm2 on cm1.campaign_id = cm2.campaign_id
    where cm1.player_id = p_user_a 
      and cm2.player_id = p_user_b
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.can_access_avatar(folder_name text)
returns boolean as $$
declare
  owner_uuid uuid;
begin
  begin
    owner_uuid := folder_name::uuid;
  exception when others then
    return false;
  end;

  return public.are_co_members(owner_uuid, auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- ─────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters enable row level security;

-- PROFILES POLICIES
drop policy if exists "users can view own profile and campaign co-members" on public.profiles;
create policy "users can view own profile and campaign co-members"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid() or public.are_co_members(profiles.id, auth.uid())
  );

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

-- CAMPAIGNS POLICIES
drop policy if exists "authenticated users can view all campaigns" on public.campaigns;
create policy "authenticated users can view all campaigns"
  on public.campaigns for select
  to authenticated
  using (true);

drop policy if exists "authenticated users can create campaigns" on public.campaigns;
create policy "authenticated users can create campaigns"
  on public.campaigns for insert
  to authenticated
  with check (true);

-- CAMPAIGN_MEMBERS POLICIES (Uso das funções sem recursão)
drop policy if exists "members can view campaign membership" on public.campaign_members;
create policy "members can view campaign membership"
  on public.campaign_members for select
  to authenticated
  using (
    public.is_campaign_member(campaign_id, auth.uid())
  );

drop policy if exists "players can request to join a campaign" on public.campaign_members;
create policy "players can request to join a campaign"
  on public.campaign_members for insert
  to authenticated
  with check (player_id = auth.uid() and role = 'player' and status = 'pending');

drop policy if exists "master can manage members" on public.campaign_members;
create policy "master can manage members"
  on public.campaign_members for update
  to authenticated
  using (
    public.is_campaign_master(campaign_id, auth.uid())
  );

drop policy if exists "master or self can remove membership" on public.campaign_members;
create policy "master or self can remove membership"
  on public.campaign_members for delete
  to authenticated
  using (
    player_id = auth.uid() or public.is_campaign_master(campaign_id, auth.uid())
  );

-- CHARACTERS POLICIES
drop policy if exists "owner has full access to own characters" on public.characters;
create policy "owner has full access to own characters"
  on public.characters for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "campaign members can view linked characters" on public.characters;
create policy "campaign members can view linked characters"
  on public.characters for select
  to authenticated
  using (
    campaign_id is not null and public.is_campaign_member(campaign_id, auth.uid())
  );

drop policy if exists "campaign master can update linked characters" on public.characters;
create policy "campaign master can update linked characters"
  on public.characters for update
  to authenticated
  using (
    campaign_id is not null and public.is_campaign_master(campaign_id, auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 6. STORAGE POLICIES (AVATARS)
-- ─────────────────────────────────────────────────────────────
drop policy if exists "users can upload their own avatar" on storage.objects;
create policy "users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can update their own avatar" on storage.objects;
create policy "users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can delete their own avatar" on storage.objects;
create policy "users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "owner and campaign co-members can view avatar" on storage.objects;
create policy "owner and campaign co-members can view avatar"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_access_avatar((storage.foldername(name))[1])
    )
  );