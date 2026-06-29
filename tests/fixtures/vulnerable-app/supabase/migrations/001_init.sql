-- PLANTED VULN (data-access): tables created WITHOUT enabling Row Level Security.
-- Anyone with the anon key can read/write everything.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  password_hash text,
  is_admin boolean default false
);

create table orders (
  id bigint primary key generated always as identity,
  user_id uuid references users(id),
  total numeric,
  details jsonb
);

-- Missing: alter table ... enable row level security;
-- Missing: create policy ...

-- PLANTED VULN (data-access): a default-public bucket for uploads.
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true);
