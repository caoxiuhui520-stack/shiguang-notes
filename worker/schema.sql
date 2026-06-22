create table if not exists users (
  id text primary key,
  email text not null unique,
  display_name text not null,
  password_salt text not null,
  password_hash text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists notes (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  title text not null default '',
  preview text not null default '',
  content text not null default '',
  folder text not null default '生活',
  pinned integer not null default 0,
  deleted integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists notes_user_updated_idx on notes (user_id, updated_at desc);
create index if not exists notes_user_folder_idx on notes (user_id, folder);

create table if not exists attachments (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  note_id text not null references notes(id) on delete cascade,
  kind text not null check (kind in ('image', 'audio', 'video')),
  object_key text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists attachments_note_idx on attachments (note_id);
create index if not exists attachments_user_idx on attachments (user_id);
