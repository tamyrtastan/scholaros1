-- ScholarOS schema (PostgreSQL / Supabase). Mirrors src/core/db/types.ts.
-- The app server uses the service-role key and enforces ownership in code; RLS below is defence in depth
-- and protects any direct (anon/authenticated) access, e.g. from supabase-js in the browser.

create extension if not exists pgcrypto;

-- ===== shared core =====
-- When using Supabase Auth, auth.users is the identity table and public.users is unnecessary.
-- public.users exists only for AUTH_PROVIDER=local. Its id is referenced by user_id columns without an FK
-- so the same schema works in both modes.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key,                      -- = user id
  display_name text not null,
  institution text,
  research_interests text[] not null default '{}',  -- reserved for GrantPilot
  locale text not null default 'en',
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan text not null default 'free' check (plan in ('free','single','pro','lab')),
  status text not null default 'active' check (status in ('active','canceled','past_due')),
  provider text not null default 'none',
  provider_customer_id text,
  provider_subscription_id text,
  project_credits int not null default 0,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);
create index on subscriptions(user_id);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid,
  kind text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on usage_events(user_id, created_at);

-- ===== PaperFix =====
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  journal_name text,
  status text not null default 'draft' check (status in ('draft','analyzed','responded','exported')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on projects(user_id);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null check (type in ('manuscript','reviewer_comments','guidelines')),
  original_filename text not null,
  storage_path text,
  extracted_text text not null default '',
  structure jsonb,
  created_at timestamptz not null default now()
);
create index on documents(project_id);

create table if not exists reviewers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  position int not null,
  created_at timestamptz not null default now()
);

create table if not exists reviewer_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  reviewer_id uuid not null references reviewers(id) on delete cascade,
  comment_number int not null,
  original_comment text not null,
  category text,
  status text not null default 'open' check (status in ('open','needs_author_input','ready','resolved')),
  created_at timestamptz not null default now()
);
create index on reviewer_comments(project_id);

create table if not exists comment_analyses (
  id uuid primary key default gen_random_uuid(),
  reviewer_comment_id uuid not null references reviewer_comments(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  manuscript_section text not null default '',
  issue_summary text not null,
  requested_action text not null,
  evidence_from_manuscript jsonb not null default '[]',
  missing_information jsonb not null default '[]',
  suggested_revision text not null default '',
  suggested_response text not null default '',
  confidence real not null default 0,
  author_input_required boolean not null default false,
  relevant_sections jsonb not null default '[]',
  input_hash text not null,                 -- cache key: identical inputs reuse this row
  provider text not null default 'mock',
  created_at timestamptz not null default now()
);
create unique index on comment_analyses(reviewer_comment_id);

create table if not exists author_inputs (
  id uuid primary key default gen_random_uuid(),
  reviewer_comment_id uuid not null references reviewer_comments(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists revision_items (
  id uuid primary key default gen_random_uuid(),
  reviewer_comment_id uuid not null references reviewer_comments(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  original_text text not null default '',
  proposed_text text not null default '',
  author_decision text not null default 'pending' check (author_decision in ('pending','accepted','edited','rejected')),
  location text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists response_entries (
  id uuid primary key default gen_random_uuid(),
  reviewer_comment_id uuid not null references reviewer_comments(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  author_response text not null default '',
  change_summary text not null default '',
  manuscript_location text not null default '',
  edited_by_author boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===== row-level security =====
-- auth.uid() is the Supabase Auth user. Service-role connections bypass RLS by design.
alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table usage_events enable row level security;
alter table projects enable row level security;
alter table documents enable row level security;
alter table reviewers enable row level security;
alter table reviewer_comments enable row level security;
alter table comment_analyses enable row level security;
alter table author_inputs enable row level security;
alter table revision_items enable row level security;
alter table response_entries enable row level security;
alter table users enable row level security;  -- no policies: only the service role may touch local-auth users

create policy profiles_own on profiles for all using (id = auth.uid()) with check (id = auth.uid());
-- Users may read but never write their own subscription/usage (only the server/webhooks write these).
create policy subscriptions_read_own on subscriptions for select using (user_id = auth.uid());
create policy usage_read_own on usage_events for select using (user_id = auth.uid());
create policy projects_own on projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Child tables: access follows project ownership.
create policy documents_own on documents for all
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));
create policy reviewers_own on reviewers for all
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));
create policy reviewer_comments_own on reviewer_comments for all
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));
create policy comment_analyses_own on comment_analyses for all
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));
create policy author_inputs_own on author_inputs for all
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));
create policy revision_items_own on revision_items for all
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));
create policy response_entries_own on response_entries for all
  using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

-- Storage: create a PRIVATE bucket named "manuscripts". Objects are keyed <user_id>/<project_id>/<file>.
-- create policy manuscripts_own on storage.objects for all
--   using (bucket_id = 'manuscripts' and (storage.foldername(name))[1] = auth.uid()::text);
