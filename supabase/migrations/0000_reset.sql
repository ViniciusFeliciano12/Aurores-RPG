-- Use apenas se precisar zerar um schema parcialmente aplicado antes de
-- rodar 0001_init.sql do zero. Não faz parte da migração "real" do projeto.

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists trg_make_creator_master on public.campaigns;
drop trigger if exists trg_check_character_campaign on public.characters;
drop trigger if exists trg_unlink_characters on public.campaign_members;

drop table if exists public.characters cascade;
drop table if exists public.campaign_members cascade;
drop table if exists public.campaigns cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user();
drop function if exists public.make_creator_master();
drop function if exists public.check_character_campaign_membership();
drop function if exists public.unlink_characters_on_membership_removal();
