-- ============================================================
-- Documents composite index: 覆盖 RLS 过滤 + ORDER BY
-- ============================================================
-- M3 文档列表查询:
--   select id, title, source, created_at
--   from documents
--   where user_id = auth.uid()   -- (RLS 注入)
--   order by created_at desc
--
-- 复合 (user_id, created_at desc) 让 Postgres 走 Index Scan:
--   1. 用 user_id 定位到该用户的行 (B-Tree 前缀)
--   2. 同一用户内按 created_at 倒序已经是物理有序, ORDER BY 零成本
--
-- 0001 迁移里 documents 表没建任何索引, 当前 1 行没事,
-- 数据量上来后 (10w+ 行, 多用户) 这个索引是必须的。
-- ============================================================

create index if not exists documents_user_id_created_at_idx
on documents (user_id, created_at desc);
