# RAG M1: Pipeline 端到端打通 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通 "文本 → chunk → Gemini embed → pgvector 存储 → 检索 → AI SDK 生成" 全链路，零 UI，跑脚本验证。

**Architecture:** 3 个 SQL migration 建表 + RPC；3 个 TS 模块（chunking / embedding / supabase admin）；1 个 `seed-and-query.ts` 脚本跑全流程。完全离线，无 UI。

**Tech Stack:**
- Next.js 16.2.9 (项目已有, M1 不直接用, 仅保留兼容)
- Supabase (Postgres 15 + pgvector)
- Vercel AI SDK (`ai` + `@ai-sdk/google`)
- `tsx` (跑 TS 脚本)
- Node 内置 `node:test` (chunking 单元测试, 不引 vitest)

---

## ⚠️ 用户协作规则（必须遵守）

- 用户处理 git init / commit / push, AI 不主动执行
- 不启动 dev server, M1 跑 `pnpm tsx scripts/seed-and-query.ts` 一次性验证
- 改完跑一次 `pnpm tsc --noEmit` 即可, 不要每个 task 都跑
- pnpm only

---

## M1 Status: ✅ COMPLETE (2026-06-23)

Pipeline 端到端跑通 (`pnpm tsx scripts/seed-and-query.ts`), 实测 sim=0.689 真实相似度。

### 与原 spec 的偏差 (后续 plan / spec 已同步)

1. **Embedding**: Gemini 768d → **DashScope `text-embedding-v3` 1024d** (GFW 阻断, 改 `@ai-sdk/openai-compatible` 接入国内)
2. **LLM (脚本内)**: `google('gemini-2.5-flash')` → `dashscope.chatModel('qwen-plus')` (同上, Google 整站不通)
3. **match_chunks WHERE**: 加 `or auth.uid() is null` 旁路, 让 service-role 脚本能跑 (M3+ authenticated client 不受影响, `auth.uid()` 有值走严格 user_id 过滤)
4. **脚本 env 加载**: 新增 `scripts/_env.ts`, 第一个 import, 只做 `config({ path: '.env.local' })` (ESM hoisting 坑, `lib/embedding.ts` 在 import 时读 env 会拿到 undefined)

### 后续里程碑

- **M2**: RLS 多用户隔离 — 待写 `0003_rls_policies.sql` + SQL editor 双用户验证
- **M3**: `/documents` UI — 待 plan
- **M4**: `/chat` UI — 待 plan

---

## File Structure

**新增**：
```
supabase/migrations/
  0001_init_rag.sql            # pgvector + documents/chunks 表
  0002_match_chunks_rpc.sql    # match_chunks() RPC

lib/
  chunking.ts                  # recursiveCharSplit + Chunk type
  chunking.test.ts             # node:test 单元测试
  embedding.ts                 # embedQuery + embedChunks (Gemini)
  supabase/
    admin.ts                   # service-role client (脚本用)

scripts/
  seed-and-query.ts            # M1 验收脚本
```

**修改**：
```
package.json                   # 加 ai / @ai-sdk/google / tsx 依赖
.env.local.example             # 加 GOOGLE_GENERATIVE_AI_API_KEY + SUPABASE_SERVICE_ROLE_KEY + LLM_PROVIDER
```

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装运行时依赖**

```bash
pnpm add ai @ai-sdk/google @ai-sdk/openai @ai-sdk/deepseek @ai-sdk/openai-compatible
```

- [ ] **Step 2: 安装 dev 依赖（跑 TS 脚本 + 读 .env 用）**

```bash
pnpm add -D tsx dotenv
```

- [ ] **Step 3: 验证 package.json 已写入**

```bash
grep -E '"(ai|@ai-sdk|tsx|dotenv)"' package.json
```

期望输出包含所有 7 个包名（5 个运行时 + tsx + dotenv）。

---

## Task 2: SQL migration — 启用 pgvector + 建表

**Files:**
- Create: `supabase/migrations/0001_init_rag.sql`

- [ ] **Step 1: 创建 migration 文件**

文件路径：`supabase/migrations/0001_init_rag.sql`

```sql
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
  embedding     vector(768) not null,
  chunk_index   int not null,
  token_count   int not null,
  created_at    timestamptz not null default now()
);

create index chunks_document_id_idx on chunks(document_id);
```

- [ ] **Step 2: 在 Supabase Dashboard 执行**

打开 https://supabase.com/dashboard → 项目 → SQL Editor → New query → 粘贴上面 SQL → Run。

期望输出：`Success. No rows returned`。

如果 `create extension` 报错 `permission denied`，需要先到 Database → Extensions 手动启用 `vector`。

---

## Task 3: SQL migration — match_chunks RPC 函数

**Files:**
- Create: `supabase/migrations/0002_match_chunks_rpc.sql`

- [ ] **Step 1: 创建 RPC migration**

文件路径：`supabase/migrations/0002_match_chunks_rpc.sql`

```sql
-- Cosine similarity search over chunks, scoped to caller's user_id via RLS-friendly join
create or replace function match_chunks (
  query_embedding vector(768),
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
  where d.user_id = auth.uid()
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 2: 在 Supabase Dashboard 执行**

SQL Editor → New query → 粘贴 → Run。期望 `Success`。

- [ ] **Step 3: 验证 RPC 已创建**

SQL Editor 跑：
```sql
select proname from pg_proc where proname = 'match_chunks';
```

期望：返回 1 行，`proname = match_chunks`。

---

## Task 4: Supabase admin client (service-role, 脚本用)

**Files:**
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: 创建 admin client**

文件路径：`lib/supabase/admin.ts`

```ts
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. BYPASSES RLS.
 *
 * ⚠️ ONLY use in scripts that run outside user context (e.g. seed-and-query.ts).
 * NEVER use in Server Actions or Route Handlers — that breaks per-user isolation.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env'
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

---

## Task 5: chunking 模块 + 单元测试

**Files:**
- Create: `lib/chunking.ts`
- Create: `lib/chunking.test.ts`

- [ ] **Step 1: 写测试（先失败）**

文件路径：`lib/chunking.test.ts`

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recursiveCharSplit } from './chunking'

test('空字符串返回空数组', () => {
  assert.deepEqual(recursiveCharSplit(''), [])
})

test('短文本不分块', () => {
  const result = recursiveCharSplit('hello world')
  assert.equal(result.length, 1)
  assert.equal(result[0].content, 'hello world')
  assert.equal(result[0].chunk_index, 0)
  assert.ok(result[0].token_count > 0)
})

test('长文本按 chunkSize 切分', () => {
  const long = 'a'.repeat(1200)
  const result = recursiveCharSplit(long, { chunkSize: 500, overlap: 50 })
  assert.ok(result.length >= 2)
  for (const chunk of result) {
    assert.ok(chunk.content.length <= 500)
    assert.equal(chunk.chunk_index, result.indexOf(chunk))
  }
})

test('按段落优先切分', () => {
  const text = '段落A'.repeat(50) + '\n\n' + '段落B'.repeat(50)
  const result = recursiveCharSplit(text, { chunkSize: 100, overlap: 10 })
  assert.ok(result.length >= 2)
  // 第一个 chunk 应该包含 "段落A"
  assert.ok(result[0].content.includes('段落A'))
})

test('overlap 让相邻 chunk 有重叠内容', () => {
  const long = '0123456789'.repeat(100) // 1000 chars
  const result = recursiveCharSplit(long, { chunkSize: 300, overlap: 50 })
  assert.ok(result.length >= 3)
  // 检查相邻 chunk 末尾和开头有 overlap
  const tail = result[0].content.slice(-20)
  assert.ok(result[1].content.includes(tail.slice(0, 10)))
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
node --test lib/chunking.test.ts
```

期望：FAIL `Cannot find module './chunking'`。

- [ ] **Step 3: 实现 chunking.ts**

文件路径：`lib/chunking.ts`

```ts
export type Chunk = {
  content: string
  chunk_index: number
  token_count: number
}

type Options = {
  chunkSize?: number
  overlap?: number
}

const SEPARATORS = ['\n\n', '\n', '。', ' ', '']

export function recursiveCharSplit(text: string, options: Options = {}): Chunk[] {
  const chunkSize = options.chunkSize ?? 500
  const overlap = options.overlap ?? 50

  if (!text.trim()) return []

  const pieces = splitBySeparator(text, chunkSize)
  const merged = mergeSmallPieces(pieces, chunkSize)
  const chunks = applyOverlap(merged, overlap)

  return chunks.map((content, i) => ({
    content: content.trim(),
    chunk_index: i,
    token_count: Math.ceil(content.length / 4),
  }))
}

function splitBySeparator(text: string, chunkSize: number): string[] {
  return splitRecursive(text, chunkSize, 0)
}

function splitRecursive(text: string, chunkSize: number, depth: number): string[] {
  if (text.length <= chunkSize || depth >= SEPARATORS.length) {
    return text.length > 0 ? [text] : []
  }

  const sep = SEPARATORS[depth]
  const parts = sep === '' ? [...text] : text.split(sep)

  const result: string[] = []
  for (const part of parts) {
    if (part.length <= chunkSize) {
      if (part.length > 0) result.push(part)
    } else {
      result.push(...splitRecursive(part, chunkSize, depth + 1))
    }
  }
  return result
}

function mergeSmallPieces(pieces: string[], chunkSize: number): string[] {
  const result: string[] = []
  let buffer = ''

  for (const piece of pieces) {
    if (buffer.length + piece.length + 1 <= chunkSize) {
      buffer = buffer ? `${buffer} ${piece}` : piece
    } else {
      if (buffer) result.push(buffer)
      buffer = piece
    }
  }
  if (buffer) result.push(buffer)
  return result
}

function applyOverlap(chunks: string[], overlap: number): string[] {
  if (chunks.length <= 1 || overlap <= 0) return chunks

  const result: string[] = [chunks[0]]
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]
    const tail = prev.slice(-overlap)
    result.push(`${tail}${chunks[i]}`)
  }
  return result
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
node --test lib/chunking.test.ts
```

期望：5 个测试全部 PASS。

- [ ] **Step 5: 收尾**

如果失败：检查 `recursiveCharSplit` 的边界条件（空字符串、超短文本）。overlap 测试如果失败，调整 `applyOverlap` 的实现。

---

## Task 6: embedding 模块（Gemini via AI SDK）

**Files:**
- Create: `lib/embedding.ts`

- [ ] **Step 1: 实现 embedding.ts**

文件路径：`lib/embedding.ts`

```ts
import { embed, embedMany } from 'ai'
import { google } from '@ai-sdk/google'
import type { Chunk } from './chunking'

const MODEL = google.textEmbeddingModel('gemini-embedding-001', {
  outputDimensionality: 768,
})

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: MODEL,
    value: text,
  })
  return embedding
}

export async function embedChunks(
  chunks: Chunk[]
): Promise<Array<Chunk & { embedding: number[] }>> {
  if (chunks.length === 0) return []

  const values = chunks.map((c) => c.content)

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { embeddings } = await embedMany({
        model: MODEL,
        values,
      })
      return chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }))
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * 2 ** attempt
        console.warn(
          `[embedChunks] attempt ${attempt + 1} failed, retrying in ${delay}ms`
        )
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw new Error(
    `embedChunks failed after ${MAX_RETRIES} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}
```

**注意**：AI SDK 的 `embed` / `embedMany` 参数名是 `value` / `values`（v4+ 之后从 `input` / `inputs` 改的）。如果跑起来报 `Unknown argument: input`，确认 `ai` 包版本 ≥ 4.0。

---

## Task 7: 验收脚本（核心：跑通全链路）

**Files:**
- Create: `scripts/seed-and-query.ts`

- [ ] **Step 1: 创建验收脚本**

文件路径：`scripts/seed-and-query.ts`

```ts
/**
 * M1 verification script.
 *
 * 流程:
 *   1. 用 service-role 客户端插 1 个 hardcoded 文档
 *   2. chunk → embed → 批量 insert chunks
 *   3. 用 query 文本做 embed → 调 match_chunks RPC → 打印 top-3 chunks
 *   4. 调 AI SDK streamText 生成回答 → 打印流式输出
 *
 * 跑法: pnpm tsx scripts/seed-and-query.ts
 */

import { config } from 'dotenv'
import { streamText } from 'ai'
import { google } from '@ai-sdk/google'
import { createAdminClient } from '../lib/supabase/admin'
import { recursiveCharSplit } from '../lib/chunking'
import { embedChunks, embedQuery } from '../lib/embedding'

config({ path: '.env.local' })

// 任意一个真实存在的 auth.users.id (从 Supabase Dashboard → Authentication → Users 复制)
// M1 暂时绕过 RLS 用这个 user_id 插数据
const TEST_USER_ID = process.env.M1_TEST_USER_ID
if (!TEST_USER_ID) {
  console.error('Set M1_TEST_USER_ID in .env.local to an existing auth.users.id')
  process.exit(1)
}

const TEST_DOCUMENT = {
  title: 'Next.js App Router 简介',
  content: `
Next.js App Router 是 Next.js 13 引入的新路由系统，基于 React Server Components。

核心概念:
- Server Components 默认在服务端渲染,不发送 JS 到浏览器
- Client Components 用 'use client' 声明,可以有状态和事件
- layout.tsx 是共享布局,page.tsx 是路由页面
- loading.tsx 和 error.tsx 处理 loading 和 error 状态
- middleware.ts 在请求到达前执行,常用于 auth 校验

数据获取:
- Server Component 里直接 await fetch,无需 useEffect
- 可以直接 await 数据库查询,不需要 API 层
- 表单提交用 Server Actions,不需要写 API route

优势: 更少客户端 JS、更快首屏、更好的 SEO。
  `.trim(),
}

const TEST_QUERY = 'App Router 怎么处理 loading 状态？'

async function main() {
  const supabase = createAdminClient()
  console.log('✓ Admin client created')

  // 1. Insert document
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ user_id: TEST_USER_ID, title: TEST_DOCUMENT.title })
    .select()
    .single()

  if (docErr || !doc) throw new Error(`Insert document failed: ${docErr?.message}`)
  console.log(`✓ Document inserted: ${doc.id}`)

  // 2. Chunk + embed + insert
  const rawChunks = recursiveCharSplit(TEST_DOCUMENT.content)
  console.log(`✓ Chunked into ${rawChunks.length} pieces`)

  const embedded = await embedChunks(rawChunks)
  console.log(`✓ Embedded ${embedded.length} chunks, dim=${embedded[0].embedding.length}`)

  const { error: chunksErr } = await supabase.from('chunks').insert(
    embedded.map((c) => ({
      document_id: doc.id,
      content: c.content,
      embedding: JSON.stringify(c.embedding), // pgvector accepts JSON array string
      chunk_index: c.chunk_index,
      token_count: c.token_count,
    }))
  )

  if (chunksErr) throw new Error(`Insert chunks failed: ${chunksErr.message}`)
  console.log(`✓ ${embedded.length} chunks inserted`)

  // 3. Retrieval
  const queryEmbedding = await embedQuery(TEST_QUERY)
  console.log(`✓ Query embedded`)

  const { data: matches, error: rpcErr } = await supabase.rpc('match_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: 3,
  })

  if (rpcErr) throw new Error(`RPC failed: ${rpcErr.message}`)
  console.log(`\n📚 Top-3 retrieved chunks:`)
  for (const m of matches ?? []) {
    console.log(`  [sim=${m.similarity.toFixed(3)}] ${m.content.slice(0, 80)}...`)
  }

  // 4. Generation
  console.log(`\n🤖 Generating answer for: "${TEST_QUERY}"\n`)
  const context = (matches ?? [])
    .map((m, i) => `[${i + 1}] ${m.content}`)
    .join('\n\n')

  const result = streamText({
    model: google('gemini-2.5-flash'),
    system: `基于以下参考文档回答问题。回答简洁,直接引用相关部分。\n\n参考文档:\n${context}`,
    prompt: TEST_QUERY,
  })

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk)
  }
  process.stdout.write('\n')

  // Cleanup
  await supabase.from('documents').delete().eq('id', doc.id)
  console.log(`\n✓ Cleanup: deleted test document ${doc.id}`)
}

main().catch((err) => {
  console.error('\n❌ M1 verification failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: 在 .env.local 配置**

打开 `.env.local`，确保有以下变量（值从 Supabase / Vercel Dashboard 复制）：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
M1_TEST_USER_ID=<从 Supabase Dashboard → Authentication → Users 复制>
```

---

## Task 8: 运行验收

**Files:** (无文件操作, 只跑命令)

- [ ] **Step 1: 类型检查**

```bash
pnpm tsc --noEmit
```

期望：0 errors。

- [ ] **Step 2: 跑 M1 验收脚本**

```bash
pnpm tsx scripts/seed-and-query.ts
```

期望输出（关键行）：
```
✓ Admin client created
✓ Document inserted: <uuid>
✓ Chunked into N pieces
✓ Embedded N chunks, dim=768
✓ N chunks inserted
✓ Query embedded

📚 Top-3 retrieved chunks:
  [sim=0.xxx] ...
  [sim=0.xxx] ...

🤖 Generating answer for: "App Router 怎么处理 loading 状态？"

<App Router 通过 loading.tsx 文件处理 loading 状态, 它会自动包裹 page.tsx ...>

✓ Cleanup: deleted test document <uuid>
```

**如果 `RPC failed: function match_chunks does not exist`**：Task 3 的 SQL 没跑，去 Supabase Dashboard 跑。

**如果 `Insert chunks failed: type "vector" does not exist`**：Task 2 的 pgvector 没启用，去 Supabase Dashboard → Database → Extensions 手动启用 `vector`。

**如果 `embed failed: API key not valid`**：检查 `GOOGLE_GENERATIVE_AI_API_KEY` 是否正确。

**如果 Gemini 报 rate limit**：脚本会自动重试 3 次，等 1 分钟重跑。

- [ ] **Step 3: 收尾**

脚本会自动清理测试数据。在 Supabase Dashboard → Table Editor 确认 `documents` 和 `chunks` 表为空。

---

## Task 9: 更新 .env.local.example 文档

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: 追加新变量注释**

在 `.env.local.example` 末尾追加：

```bash

# ============ RAG / LLM (M1+) ============
# Gemini embedding + 默认 LLM 都要这个 key
GOOGLE_GENERATIVE_AI_API_KEY=

# LLM provider: google | openai | deepseek | qwen | glm | kimi
# 暂未使用 (M1 hardcode google), M4 用
LLM_PROVIDER=google

# PROMPT_MODE: strict | hybrid
# 暂未使用, M4 用
PROMPT_MODE=hybrid

# Supabase 服务端 (M1 脚本 + 后续 admin 操作)
SUPABASE_SERVICE_ROLE_KEY=
# ⚠️ SERVICE_ROLE 绕过 RLS, 仅脚本用, 禁止 Server Action / Route Handler 使用
```

---

## 验收清单（M1 done 的判定）

- [ ] `pnpm tsc --noEmit` 0 errors
- [ ] `node --test lib/chunking.test.ts` 5 tests pass
- [ ] `pnpm tsx scripts/seed-and-query.ts` 输出完整 pipeline 结果, 无报错
- [ ] Supabase Dashboard 确认 documents/chunks 表创建成功

---

## 下一步（M2 计划）

M1 完成后, 用户本地验收跑通, 单独 plan M2 (RLS 多用户隔离)。