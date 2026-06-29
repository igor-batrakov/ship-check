-- Schema for Acme Docs. Every table that holds user data has Row Level Security
-- enabled with owner-scoped policies, so a leaked anon key cannot read across
-- accounts. User identities live in Supabase's managed auth.users table.

-- documents: metadata for files a user uploads. The bytes live in the private
-- `documents` storage bucket; access is handed out through short-lived signed
-- URLs minted for the file's owner.
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "documents_select_own"
  on public.documents
  for select
  using (auth.uid() = user_id);

create policy "documents_insert_own"
  on public.documents
  for insert
  with check (auth.uid() = user_id);

create policy "documents_update_own"
  on public.documents
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "documents_delete_own"
  on public.documents
  for delete
  using (auth.uid() = user_id);

-- generations: per-user log of AI generations from /api/generate.
create table public.generations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  prompt     text not null,
  response   text not null,
  created_at timestamptz not null default now()
);

alter table public.generations enable row level security;

create policy "generations_select_own"
  on public.generations
  for select
  using (auth.uid() = user_id);

create policy "generations_insert_own"
  on public.generations
  for insert
  with check (auth.uid() = user_id);

-- Private storage bucket for user documents. It is not public and has no broad
-- read policy on storage.objects; signed URLs are minted server-side for the
-- document's owner.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
