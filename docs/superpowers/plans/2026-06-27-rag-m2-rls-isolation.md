# RAG M2: RLS 多用户隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `documents` / `chunks` 加 RLS，让每个 authenticated user 只能看到自己的数据；M1 service-role 脚本不受影响（service-role 走 BYPASSRLS）。

**Architecture:** 1 个 SQL migration 启用 RLS + 2 个 `for all` policy（documents / chunks 各 1 条，USING + WITH CHECK 同一表达式）；1 个 TS 验证脚本用 admin 建 2 测试用户 + 2 个 anon client 互验（`scripts/test-rls.ts`）。

**Tech Stack:**
- Postgres RLS（`enable row level security` + `create policy`）
- Supabase Auth admin API（建测试用户 + 拿 JWT）
- `@supabase/supabase-js` anon client（模拟真实用户）
- `node:test` + `tsx`（跑验证脚本，可断言失败）

---

## ⚠️ 用户协作规则（必须遵守）

- 用户处理 git init / commit / push，AI 不主动执行
- 不启动 dev server
- 改完跑一次 `pnpm tsc --noEmit` 即可，不要每个 task 都跑
- pnpm only

---

## 前置上下文

- M1 已完成: `documents` / `chunks` 表已建, `match_chunks` RPC 已写, 脚本用 service-role
- 当前 `chunks` 的 RLS 状态: **未启用** → 任何 authenticated user 可读写所有 chunks
- `match_chunks` 已有 `or auth.uid() is null` 旁路，让 service-role 跑全量
- service-role 在 Postgres 里有 `BYPASSRLS` 属性 → 启用 RLS 后 service-role 仍能全量访问，**不需要改 match_chunks RPC**
- chunks 没有 user_id 字段，靠 `document_id → documents.user_id` 链做隔离

---

## File Structure

**新增**：
```
supabase/migrations/
  0003_rls_policies.sql          # RLS enable + 2 policies (documents, chunks)

scripts/
  test-rls.ts                    # 双用户隔离验证
```

**修改**：
```
.env.local.example               # 加 SUPABASE_TEST_USER_PASSWORD 注释 (test-rls.ts 用)
```

---

## Task 1: 写 RLS migration

**Files:**
- Create: `supabase/migrations/0003_rls_policies.sql`

- [ ] **Step 1: 创建 migration 文件**

文件路径：`supabase/migrations/0003_rls_policies.sql`

```sql
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
```

- [ ] **Step 2: 在 Supabase Dashboard 执行**

打开 https://supabase.com/dashboard → 项目 → SQL Editor → New query → 粘贴上面 SQL → Run。

期望输出：`Success. No rows returned`。

- [ ] **Step 3: 验证 RLS 已启用**

SQL Editor 跑：
```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
and tablename in ('documents', 'chunks');
```

期望：两行 `rowsecurity = true`。

- [ ] **Step 4: 验证 policies 已建**

```sql
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
and tablename in ('documents', 'chunks');
```

期望：4 行 — documents 1 条 `users manage own documents`（cmd = ALL）, chunks 1 条同样。

---

## Task 2: 写 RLS 验证脚本

**Files:**
- Create: `scripts/test-rls.ts`

- [ ] **Step 1: 在 .env.local 加测试用户密码**

打开 `.env.local`，加：
```bash
# M2 RLS test - 测试用户密码 (test-rls.ts 用, 验证后即可删)
SUPABASE_TEST_USER_PASSWORD=TestPass123!M2
```

- [ ] **Step 2: 写 test-rls.ts**

文件路径：`scripts/test-rls.ts`

```ts
/**
 * M2 verification: RLS multi-user isolation.
 *
 * 流程:
 *   1. admin 建 2 个测试用户 (A, B) + email_confirm
 *   2. 用密码签入, 拿 2 个 anon client (各持一个 user session)
 *   3. 互验:
 *      - A 插 1 个 document → 成功
 *      - A 插 1 个 chunk for 该 document → 成功
 *      - B SELECT documents → 0 行
 *      - B INSERT chunk for A 的 document → 失败 (RLS)
 *      - A SELECT chunks → 1 行
 *      - A 调 match_chunks (用真实 embedding) → 拿到 A 的 chunk
 *      - B 调 match_chunks (同样 query) → 0 行
 *   4. 清理: admin delete 2 个 user (cascade documents + chunks)
 *
 * 跑法: pnpm tsx scripts/test-rls.ts
 *
 * 需要的 .env.local 变量:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY, DASHSCOPE_API_KEY,
 *   SUPABASE_TEST_USER_PASSWORD
 */

import './_env'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase/admin'
import { embedQuery } from '../lib/embedding'

const PASSWORD = process.env.SUPABASE_TEST_USER_PASSWORD
if (!PASSWORD) {
  console.error('Set SUPABASE_TEST_USER_PASSWORD in .env.local')
  process.exit(1)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const USER_A_EMAIL = `rls-test-a-${Date.now()}@example.com`
const USER_B_EMAIL = `rls-test-b-${Date.now()}@example.com`
const TEST_DOC_TITLE = 'RLS isolation test doc'
const TEST_DOC_CONTENT = 'A unique sentence about React Server Components and RSC.'
const TEST_QUERY = 'React Server Components'

type TestUser = {
  id: string
  email: string
  client: SupabaseClient
}

async function createTestUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<TestUser> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser(${email}) failed: ${error?.message}`)

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  })
  if (signInErr) throw new Error(`signInWithPassword(${email}) failed: ${signInErr.message}`)

  return { id: data.user.id, email, client }
}

async function main() {
  const admin = createAdminClient()
  console.log('✓ Admin client created')

  // 1. Create 2 test users
  const userA = await createTestUser(admin, USER_A_EMAIL)
  const userB = await createTestUser(admin, USER_B_EMAIL)
  console.log(`✓ Created user A: ${userA.id}`)
  console.log(`✓ Created user B: ${userB.id}`)

  try {
    // 2. A inserts a document + chunk
    const { data: doc, error: docErr } = await userA.client
      .from('documents')
      .insert({ user_id: userA.id, title: TEST_DOC_TITLE })
      .select()
      .single()
    if (docErr || !doc) throw new Error(`A insert document failed: ${docErr?.message}`)
    console.log(`✓ A inserted document: ${doc.id}`)

    // A inserts chunk via direct table (will use a zero-vector for the test to keep it deterministic;
    // match_chunks still works because we compare via rpc with a real embedding)
    const fakeEmbedding = new Array(1024).fill(0)
    const { error: chunkErr } = await userA.client
      .from('chunks')
      .insert({
        document_id: doc.id,
        content: TEST_DOC_CONTENT,
        embedding: JSON.stringify(fakeEmbedding),
        chunk_index: 0,
        token_count: 10,
      })
    if (chunkErr) throw new Error(`A insert chunk failed: ${chunkErr.message}`)
    console.log(`✓ A inserted chunk for A's document`)

    // 3. B sees no documents
    const { data: bDocs, error: bSelErr } = await userB.client
      .from('documents')
      .select('*')
    if (bSelErr) throw new Error(`B select documents failed: ${bSelErr?.message}`)
    assert.equal(bDocs.length, 0, 'B should not see A documents')
    console.log(`✓ B SELECT documents → 0 rows (isolated)`)

    // 4. B cannot insert chunk for A's document
    const { error: bInsertErr } = await userB.client
      .from('chunks')
      .insert({
        document_id: doc.id,
        content: 'malicious',
        embedding: JSON.stringify(fakeEmbedding),
        chunk_index: 99,
        token_count: 1,
      })
    assert.ok(bInsertErr, 'B should be blocked from inserting chunk on A document')
    console.log(`✓ B INSERT chunk on A's document → blocked (${bInsertErr.code ?? 'no code'})`)

    // 5. A sees own chunk
    const { data: aChunks, error: aChunkSelErr } = await userA.client
      .from('chunks')
      .select('*')
    if (aChunkSelErr) throw new Error(`A select chunks failed: ${aChunkSelErr.message}`)
    assert.equal(aChunks.length, 1, 'A should see own chunk')
    assert.equal(aChunks[0].document_id, doc.id)
    console.log(`✓ A SELECT chunks → 1 row (own chunk)`)

    // 6. match_chunks: A gets the chunk, B gets nothing
    const queryEmbedding = await embedQuery(TEST_QUERY)
    const { data: aMatches, error: aRpcErr } = await userA.client.rpc('match_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 5,
    })
    if (aRpcErr) throw new Error(`A match_chunks failed: ${aRpcErr.message}`)
    assert.ok((aMatches ?? []).length >= 1, 'A should retrieve at least own chunk via RPC')
    console.log(`✓ A match_chunks → ${aMatches!.length} row(s)`)

    const { data: bMatches, error: bRpcErr } = await userB.client.rpc('match_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 5,
    })
    if (bRpcErr) throw new Error(`B match_chunks failed: ${bRpcErr.message}`)
    assert.equal((bMatches ?? []).length, 0, 'B should retrieve 0 rows via RPC')
    console.log(`✓ B match_chunks → 0 rows (isolated)`)

    // 7. Cleanup
    await userA.client.from('documents').delete().eq('id', doc.id)
    console.log(`✓ A cleaned up own document`)

    console.log('\n🎉 M2 RLS isolation: all assertions passed')
  } finally {
    // Always delete test users (cascade nukes documents + chunks)
    await admin.auth.admin.deleteUser(userA.id)
    await admin.auth.admin.deleteUser(userB.id)
    console.log(`✓ Cleaned up test users`)
  }
}

main().catch((err) => {
  console.error('\n❌ M2 verification failed:', err)
  process.exit(1)
})
```

- [ ] **Step 3: 跑测试**

```bash
pnpm tsx scripts/test-rls.ts
```

期望输出（关键行）：
```
✓ Admin client created
✓ Created user A: <uuid>
✓ Created user B: <uuid>
✓ A inserted document: <uuid>
✓ A inserted chunk for A's document
✓ B SELECT documents → 0 rows (isolated)
✓ B INSERT chunk on A's document → blocked (<error code>)
✓ A SELECT chunks → 1 row (own chunk)
✓ A match_chunks → N row(s)
✓ B match_chunks → 0 rows (isolated)
✓ A cleaned up own document
✓ Cleaned up test users

🎉 M2 RLS isolation: all assertions passed
```

**如果 `B INSERT chunk` 没有报错**：RLS 没启用，回 Task 1 Step 2 重新跑 SQL。

**如果 `match_chunks` 报 `function does not exist`**：M1 0002 migration 没跑，去 Supabase Dashboard 跑。

**如果 `createUser` 报 `email rate limit exceeded`**：等几分钟或手动在 Supabase Dashboard 建 2 个用户，把 id 写到 .env.local 临时用。

---

## Task 3: 更新 .env.local.example

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: 追加 M2 变量注释**

在 `.env.local.example` 末尾追加：

```bash

# ============ M2 RLS Test ============
# 双用户隔离验证用密码 (test-rls.ts), 随便设, 只用于测试
SUPABASE_TEST_USER_PASSWORD=
```

---

## 验收清单（M2 done 的判定）

- [ ] `supabase/migrations/0003_rls_policies.sql` 已创建且在 Supabase 跑过
- [ ] `pg_tables.rowsecurity` 对 documents / chunks 都为 true
- [ ] `pg_policies` 有 2 条 `users manage own *`
- [ ] `pnpm tsx scripts/test-rls.ts` 全部断言通过
- [ ] `pnpm tsc --noEmit` 0 errors

---

## 下一步（M3 计划）

M2 完成后, 用户本地双用户验证通过, 单独 plan M3 (`/documents` 文档管理 UI)。
