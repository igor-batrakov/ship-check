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


insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true);
