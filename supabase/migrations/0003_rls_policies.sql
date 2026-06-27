-- ============================================================
-- M2: Row Level Security
-- ============================================================
-- 让每个 authenticated user 只能访问自己的 documents / chunks
-- service-role 走 BYPASSRLS, 不受 RLS 影响 (M1 脚本 + admin 操作)
-- anon 角色 (未登录) 默认 0 访问, 不需要额外 policy
-- ============================================================

-- documents
alter table documents enable row level security;

create policy "users manage own documents"
on documents
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- chunks (无 user_id 字段, 通过 document_id → documents.user_id 链)
alter table chunks enable row level security;

create policy "users manage own chunks"
on chunks
for all
to authenticated
using (
  exists (
    select 1 from documents d
    where d.id = chunks.document_id
    and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from documents d
    where d.id = chunks.document_id
    and d.user_id = auth.uid()
  )
);
