-- Aurores RPG — schema inicial
-- Rode este arquivo inteiro no SQL Editor do Supabase (dashboard do projeto).

-- ─────────────────────────────────────────────────────────────
-- profiles: 1 linha por usuário autenticado, espelhando auth.users
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- cria o profile automaticamente quando um usuário se cadastra (Supabase Auth)
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- campaigns
-- ─────────────────────────────────────────────────────────────
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- campaign_members: vínculo jogador <-> campanha
--   role:   'master' (só 1 por campanha) ou 'player'
--   status: 'pending' (jogador pediu / foi convidado) ou 'accepted'
-- ─────────────────────────────────────────────────────────────
create table public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'player' check (role in ('master', 'player')),
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (campaign_id, player_id)
);

-- garante um único mestre por campanha
create unique index one_master_per_campaign
  on public.campaign_members (campaign_id)
  where role = 'master';

-- ─────────────────────────────────────────────────────────────
-- characters: dono obrigatório, campanha opcional
-- ─────────────────────────────────────────────────────────────
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  name text not null,
  sheet jsonb not null default '{}'::jsonb, -- atributos, inventário, etc. livre por enquanto
  created_at timestamptz not null default now()
);

-- um personagem só pode ser vinculado a uma campanha se o dono for
-- membro ACEITO daquela campanha
create function public.check_character_campaign_membership()
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
$$ language plpgsql;

create trigger trg_check_character_campaign
  before insert or update of campaign_id, owner_id on public.characters
  for each row execute function public.check_character_campaign_membership();

-- quando um jogador é removido da campanha (linha apagada de campaign_members),
-- desvincula (não apaga) os personagens dele daquela campanha
create function public.unlink_characters_on_membership_removal()
returns trigger as $$
begin
  update public.characters
  set campaign_id = null
  where campaign_id = old.campaign_id
    and owner_id = old.player_id;
  return old;
end;
$$ language plpgsql;

create trigger trg_unlink_characters
  after delete on public.campaign_members
  for each row execute function public.unlink_characters_on_membership_removal();

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters enable row level security;

-- profiles: um usuário vê o próprio perfil e o de quem compartilha
-- alguma campanha com ele; só o próprio dono edita o seu.
create policy "users can view own profile and campaign co-members"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.campaign_members cm1
      join public.campaign_members cm2 on cm1.campaign_id = cm2.campaign_id
      where cm1.player_id = profiles.id and cm2.player_id = auth.uid()
    )
  );

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

-- campaigns: visíveis para qualquer usuário logado (só o nome/existência da
-- campanha; quem participa e as fichas vinculadas ficam nas policies abaixo,
-- restritas a membros). Qualquer autenticado pode criar campanha (o trigger
-- abaixo o torna mestre automaticamente).
create policy "authenticated users can view all campaigns"
  on public.campaigns for select
  to authenticated
  using (true);

create policy "authenticated users can create campaigns"
  on public.campaigns for insert
  to authenticated
  with check (true);

-- ao criar uma campanha, o criador vira mestre automaticamente
create function public.make_creator_master()
returns trigger as $$
begin
  insert into public.campaign_members (campaign_id, player_id, role, status)
  values (new.id, auth.uid(), 'master', 'accepted');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_make_creator_master
  after insert on public.campaigns
  for each row execute function public.make_creator_master();

-- campaign_members: membros da campanha veem os outros membros da mesma campanha
create policy "members can view campaign membership"
  on public.campaign_members for select
  to authenticated
  using (
    exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = campaign_members.campaign_id and cm.player_id = auth.uid()
    )
  );

-- um jogador pode pedir para entrar (insere a própria linha como pending)
create policy "players can request to join a campaign"
  on public.campaign_members for insert
  to authenticated
  with check (player_id = auth.uid() and role = 'player' and status = 'pending');

-- só o mestre da campanha aceita/atualiza membros (exceto a própria linha dele)
create policy "master can manage members"
  on public.campaign_members for update
  to authenticated
  using (
    exists (
      select 1 from public.campaign_members m
      where m.campaign_id = campaign_members.campaign_id
        and m.player_id = auth.uid() and m.role = 'master'
    )
  );

-- mestre remove jogadores; jogador pode sair sozinho (apagar a própria linha)
create policy "master or self can remove membership"
  on public.campaign_members for delete
  to authenticated
  using (
    player_id = auth.uid()
    or exists (
      select 1 from public.campaign_members m
      where m.campaign_id = campaign_members.campaign_id
        and m.player_id = auth.uid() and m.role = 'master'
    )
  );

-- characters: dono vê/edita os próprios; membros da mesma campanha veem
-- os personagens vinculados a ela (fichas de outros jogadores na campanha)
create policy "owner has full access to own characters"
  on public.characters for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "campaign members can view linked characters"
  on public.characters for select
  to authenticated
  using (
    campaign_id is not null
    and exists (
      select 1 from public.campaign_members
      where campaign_id = characters.campaign_id and player_id = auth.uid()
    )
  );

-- o mestre da campanha também pode modificar os personagens vinculados a ela
-- (ex.: remover um personagem da campanha sem mexer no jogador)
create policy "campaign master can update linked characters"
  on public.characters for update
  to authenticated
  using (
    campaign_id is not null
    and exists (
      select 1 from public.campaign_members
      where campaign_id = characters.campaign_id
        and player_id = auth.uid()
        and role = 'master'
    )
  );
