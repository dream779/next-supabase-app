-- Enable pgvector extension
create extension if not exists vector;

-- Documents metadata
create table documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  source      text not null default 'manual',
  created_at  timestamptz not null default now()
);

-- Vectorized text chunks
create table chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  content       text not null,
  embedding     vector(1024) not null,
  chunk_index   int not null,
  token_count   int not null,
  created_at    timestamptz not null default now()
);

create index chunks_document_id_idx on chunks(document_id);