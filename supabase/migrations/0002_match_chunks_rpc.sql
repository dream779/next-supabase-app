-- Cosine similarity search over chunks, scoped to caller's user_id.
-- auth.uid() is null branch lets service-role client (M1 script) see all rows;
-- authenticated callers (M3+ Server Actions) still get strict per-user filter.
create or replace function match_chunks (
  query_embedding vector(1024),
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.content,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where d.user_id = auth.uid() or auth.uid() is null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;