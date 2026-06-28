-- ============================================================
-- 会话 + 消息（聊天历史功能）
-- ============================================================

create table conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

-- RLS
alter table conversations enable row level security;
create policy "users manage own conversations"
on conversations
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

alter table messages enable row level security;
create policy "users manage own messages"
on messages
for all
to authenticated
using (
  exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
    and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
    and c.user_id = auth.uid()
  )
);

-- 索引
create index conversations_user_id_updated_at_idx
  on conversations (user_id, updated_at desc);
create index messages_conversation_id_created_at_idx
  on messages (conversation_id, created_at);
