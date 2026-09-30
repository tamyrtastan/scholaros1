-- 0002: move to Supabase Auth, per-plan usage tracking, account bootstrap trigger.
-- Requires the Supabase `auth` schema (present on every Supabase project).

-- The development-only credential table is gone: identities live in auth.users.
drop table if exists users cascade;

-- Tie application data to auth users; deleting an auth user deletes all their data.
-- (Orphans from earlier dev data would block the FK, so remove them first.)
delete from profiles where id not in (select id from auth.users);
delete from subscriptions where user_id not in (select id from auth.users);
delete from usage_events where user_id not in (select id from auth.users);
delete from projects where user_id not in (select id from auth.users);

alter table profiles      add constraint profiles_user_fk      foreign key (id)      references auth.users(id) on delete cascade;
alter table subscriptions add constraint subscriptions_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table usage_events  add constraint usage_events_user_fk  foreign key (user_id) references auth.users(id) on delete cascade;
alter table projects      add constraint projects_user_fk      foreign key (user_id) references auth.users(id) on delete cascade;

-- One subscription row per user (the app upserts lazily as a safety net).
drop index if exists subscriptions_user_id_idx;
create unique index if not exists subscriptions_user_id_key on subscriptions(user_id);

-- Usage is recorded together with the plan in force at the time.
alter table usage_events add column if not exists plan text not null default 'free';

-- Operator view: monthly usage per plan (service role / postgres only).
create or replace view usage_by_plan_month as
  select date_trunc('month', created_at) as month,
         plan,
         count(distinct user_id)                               as users,
         count(*) filter (where kind = 'ai_analysis')          as analyses,
         count(*) filter (where kind = 'ai_cache_hit')         as cache_hits,
         coalesce(sum(input_tokens), 0)                        as input_tokens,
         coalesce(sum(output_tokens), 0)                       as output_tokens
  from usage_events
  group by 1, 2;
revoke all on usage_by_plan_month from anon, authenticated;

-- Create profile + free subscription when a user signs up (Supabase standard pattern).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.subscriptions (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for users created before this migration.
insert into profiles (id, display_name)
  select id, split_part(email, '@', 1) from auth.users on conflict (id) do nothing;
insert into subscriptions (user_id)
  select id from auth.users on conflict (user_id) do nothing;
