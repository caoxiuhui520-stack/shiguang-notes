-- Applied to project uweaakotromcyafahdva on 2026-06-12.
-- The canonical migration is retained in the repository for reproducibility.
create table if not exists public.memo_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.memo_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.memo_folders(id) on delete set null,
  folder_name text not null default '生活',
  title text not null default '',
  preview text not null default '',
  content text not null default '',
  is_pinned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memo_notes_user_updated_idx on public.memo_notes (user_id, updated_at desc);
create index if not exists memo_notes_user_folder_idx on public.memo_notes (user_id, folder_name) where deleted_at is null;
create index if not exists memo_notes_user_deleted_idx on public.memo_notes (user_id, deleted_at) where deleted_at is not null;

create table if not exists public.memo_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.memo_notes(id) on delete cascade,
  kind text not null check (kind in ('image', 'audio', 'video')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

create index if not exists memo_attachments_note_id_idx on public.memo_attachments (note_id);
create index if not exists memo_attachments_user_id_idx on public.memo_attachments (user_id);
create index if not exists memo_notes_folder_id_idx on public.memo_notes (folder_id);

alter table public.memo_folders enable row level security;
alter table public.memo_notes enable row level security;
alter table public.memo_attachments enable row level security;

grant select, insert, update, delete on public.memo_folders to authenticated;
grant select, insert, update, delete on public.memo_notes to authenticated;
grant select, insert, update, delete on public.memo_attachments to authenticated;

create policy "memo folders select own" on public.memo_folders for select to authenticated using ((select auth.uid()) = user_id);
create policy "memo folders insert own" on public.memo_folders for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "memo folders update own" on public.memo_folders for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "memo folders delete own" on public.memo_folders for delete to authenticated using ((select auth.uid()) = user_id);
create policy "memo notes select own" on public.memo_notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "memo notes insert own" on public.memo_notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "memo notes update own" on public.memo_notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "memo notes delete own" on public.memo_notes for delete to authenticated using ((select auth.uid()) = user_id);
create policy "memo attachments select own" on public.memo_attachments for select to authenticated using ((select auth.uid()) = user_id);
create policy "memo attachments insert own" on public.memo_attachments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "memo attachments update own" on public.memo_attachments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "memo attachments delete own" on public.memo_attachments for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memo-attachments', 'memo-attachments', false, 524288000,
  array['image/jpeg','image/png','image/webp','image/heic','audio/webm','audio/mpeg','audio/mp4','audio/wav','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "memo storage select own" on storage.objects for select to authenticated using (bucket_id = 'memo-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "memo storage insert own" on storage.objects for insert to authenticated with check (bucket_id = 'memo-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "memo storage update own" on storage.objects for update to authenticated using (bucket_id = 'memo-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'memo-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "memo storage delete own" on storage.objects for delete to authenticated using (bucket_id = 'memo-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
