-- Supabase-compatible roles/schema that the hosted platform pre-creates.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_auth_admin noinherit createrole login password 'root';
grant anon, authenticated, service_role to postgres;
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
grant create on database postgres to supabase_auth_admin;
alter user supabase_auth_admin set search_path = 'auth';
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
-- (Supabase roles that the GoTrue migrations expect to exist)
-- NOTE: auth.uid()/auth.role() are created by the GoTrue migrations (owned by supabase_auth_admin), as on Supabase.
grant usage on schema public to anon, authenticated, service_role;
-- Supabase grants anon/authenticated/service_role full table privileges by default; RLS is what restricts them.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
