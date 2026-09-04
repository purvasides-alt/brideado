-- Run this once in your Supabase project's SQL Editor.
-- It creates one table that stores each browser's BrideOps data
-- as a single JSON blob, keyed by a random device id.

create table if not exists brideops_data (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Row Level Security is on by default for new projects. This policy
-- allows the app (using the public "anon" key) to read and write.
-- Note: this is fine for a prototype where the row id is an
-- unguessable random UUID, but it is NOT per-user auth — anyone who
-- has both the anon key and a specific row's id could read/write that
-- row. Add real authentication before this holds sensitive data for
-- multiple people.
alter table brideops_data enable row level security;

create policy "Allow anon read/write on brideops_data"
  on brideops_data
  for all
  using (true)
  with check (true);
