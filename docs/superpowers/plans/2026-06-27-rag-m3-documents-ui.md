# RAG M3: /documents 文档管理 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给登录用户提供 `/documents` 页面，列出自己的文档、提交新文档（自动 chunk + embed + 入库）、删除文档。

**Architecture:** 1 个 Server Component 页面 (`app/documents/page.tsx`) 拉取当前用户文档列表 + 渲染新建表单 + 渲染每条文档旁的删除按钮；1 个 `'use server'` 文件 (`app/documents/actions.ts`) 暴露 `createDocument`（走 `lib/chunking` + `lib/embedding` + 两次 anon insert）和 `deleteDocument`；1 个 Client Component 表单 (`app/documents/new-document-form.tsx`) 用 `useActionState` 处理 pending + error。`middleware.ts` 扩展保护 `/documents`。

**Tech Stack:**
- Next.js 16 App Router · Server Components · Server Actions · `useActionState` (React 19)
- `lib/chunking.ts` (`recursiveCharSplit`) + `lib/embedding.ts` (`embedChunks`) — M1 验证过的纯函数
- `lib/supabase/server.ts` (anon client with RLS) — 走用户 JWT
- Tailwind CSS 4

---

## ⚠️ 用户协作规则（必须遵守）

- 用户处理 git init / commit / push，AI 不主动执行
- 不启动 dev server
- 改完跑一次 `pnpm tsc --noEmit` 即可，不要每个 task 都跑
- pnpm only

---

## 前置上下文

- M1 ✅: `documents` / `chunks` 表 + `match_chunks` RPC；`lib/chunking.ts` / `lib/embedding.ts` 可直接 import
- M2 ✅: RLS 已启用，`authenticated` 用户只能读 / 写自己的 `documents` / `chunks`（含 DELETE，因 policy 是 `for all`）
- 当前 `middleware.ts` 只保护 `/account`；M3 加 `/documents` 到保护列表
- `lib/supabase/server.ts` 返回的客户端是 anon 角色 + 当前 cookies 持有的 user JWT，**走 RLS**，所以 M3 不需要 service-role
- Server Action 内 `lib/supabase/server.ts` 的 `cookies.set` 可写（不是 Server Component）

---

## File Structure

**新增**：
```
app/documents/
  page.tsx                       # Server Component: 列文档 + 渲染 NewDocumentForm + 每条旁的删除 form
  actions.ts                     # 'use server': createDocument, deleteDocument
  new-document-form.tsx          # 'use client': useActionState 接 createDocument
```

**修改**：
```
middleware.ts                    # 把 '/documents' 加到受保护路径
app/account/page.tsx             # 加一个 "我的文档 →" 链接到 /documents
CLAUDE.md                        # 路由表加 /documents + Server Action 流程说明
```

---

## Task 1: middleware 保护 /documents

**Files:**
- Modify: `middleware.ts:32`

- [ ] **Step 1: 修改路径检查**

打开 `middleware.ts`,把第 32 行:

```ts
if (!user && request.nextUrl.pathname.startsWith('/account')) {
  return NextResponse.redirect(new URL('/login', request.url))
}
```

改为:

```ts
if (
  !user &&
  (request.nextUrl.pathname.startsWith('/account') ||
    request.nextUrl.pathname.startsWith('/documents'))
) {
  return NextResponse.redirect(new URL('/login', request.url))
}
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm tsc --noEmit
```

期望: 0 errors.

---

## Task 2: createDocument Server Action

**Files:**
- Create: `app/documents/actions.ts`

- [ ] **Step 1: 创建文件**

文件路径: `app/documents/actions.ts`

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { recursiveCharSplit } from '@/lib/chunking'
import { embedChunks } from '@/lib/embedding'

export type CreateDocumentState = {
  error: string | null
  success?: boolean
  documentId?: string
  chunkCount?: number
}

export async function createDocument(
  _prev: CreateDocumentState,
  formData: FormData,
): Promise<CreateDocumentState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const title = formData.get('title')?.toString().trim() ?? ''
  const content = formData.get('content')?.toString().trim() ?? ''

  if (!title) return { error: 'Title is required.' }
  if (!content) return { error: 'Content is required.' }

  // 1. Insert document (RLS 用 auth.uid() 链校验 user_id)
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ user_id: user.id, title, source: 'manual' })
    .select()
    .single()
  if (docErr || !doc) {
    return { error: `Insert document failed: ${docErr?.message ?? 'unknown'}` }
  }

  // 2. Chunk
  const rawChunks = recursiveCharSplit(content)
  if (rawChunks.length === 0) {
    await supabase.from('documents').delete().eq('id', doc.id)
    return { error: 'Content produced no chunks.' }
  }

  // 3. Embed (内置 3 次重试)
  let embedded
  try {
    embedded = await embedChunks(rawChunks)
  } catch (err) {
    await supabase.from('documents').delete().eq('id', doc.id)
    return {
      error: `Embedding failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // 4. Insert chunks (RLS 通过 document_id → documents.user_id 链校验)
  const { error: chunksErr } = await supabase.from('chunks').insert(
    embedded.map((c) => ({
      document_id: doc.id,
      content: c.content,
      embedding: JSON.stringify(c.embedding),
      chunk_index: c.chunk_index,
      token_count: c.token_count,
    })),
  )
  if (chunksErr) {
    await supabase.from('documents').delete().eq('id', doc.id)
    return { error: `Insert chunks failed: ${chunksErr.message}` }
  }

  revalidatePath('/documents')
  return {
    error: null,
    success: true,
    documentId: doc.id,
    chunkCount: embedded.length,
  }
}

export async function deleteDocument(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const id = formData.get('id')?.toString()
  if (!id) return

  // RLS 保证只能删自己 user_id 的 document
  // chunks.document_id on delete cascade 清理 chunks
  await supabase.from('documents').delete().eq('id', id)
  revalidatePath('/documents')
}
```

注意: `deleteDocument` 故意返回 `Promise<void>`，让 `<form action={deleteDocument}>` 直接提交，不需要 `useActionState`。

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm tsc --noEmit
```

期望: 0 errors. 如果报 `Could not find module '@/lib/chunking'` 之类，确认 `tsconfig.json` 里有 `paths: { "@/*": ["./*"] }`（M1 时已配）。

---

## Task 3: NewDocumentForm Client Component

**Files:**
- Create: `app/documents/new-document-form.tsx`

- [ ] **Step 1: 创建文件**

文件路径: `app/documents/new-document-form.tsx`

```tsx
'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import {
  createDocument,
  type CreateDocumentState,
} from './actions'

const initialState: CreateDocumentState = { error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
    >
      {pending ? 'Creating...' : 'Create document'}
    </button>
  )
}

export function NewDocumentForm() {
  const [state, formAction] = useActionState(createDocument, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state])

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 bg-white rounded-lg shadow p-6"
    >
      <h2 className="text-lg font-semibold text-gray-900">New document</h2>

      <div className="space-y-1">
        <label htmlFor="title" className="block text-sm text-gray-700">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="My knowledge note"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="content" className="block text-sm text-gray-700">
          Content
        </label>
        <textarea
          id="content"
          name="content"
          required
          rows={8}
          className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="Paste or type your content here. Long content is auto-chunked."
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state.success && state.chunkCount !== undefined && (
        <p className="text-sm text-green-700">
          ✓ Created with {state.chunkCount} chunk(s)
        </p>
      )}

      <SubmitButton />
    </form>
  )
}
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm tsc --noEmit
```

期望: 0 errors.

---

## Task 4: /documents 页面骨架

**Files:**
- Create: `app/documents/page.tsx`

- [ ] **Step 1: 创建文件**

文件路径: `app/documents/page.tsx`

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { deleteDocument } from './actions'
import { NewDocumentForm } from './new-document-form'

type DocumentRow = {
  id: string
  title: string
  source: string
  created_at: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function DocumentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // middleware 已保证有 user, 这里双保险
  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-600">Please sign in to view documents.</p>
      </main>
    )
  }

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, title, source, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 space-y-4">
          <h1 className="text-xl font-bold text-red-600">Load failed</h1>
          <p className="text-sm text-gray-700 font-mono break-all">
            {error.message}
          </p>
          <Link href="/account" className="text-sm text-gray-900 underline">
            ← Back to account
          </Link>
        </div>
      </main>
    )
  }

  const list = (docs ?? []) as DocumentRow[]

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">My documents</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/account" className="text-gray-600 underline">
              Account
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-gray-600 underline"
              >
                Sign out
              </button>
            </form>
          </nav>
        </header>

        <NewDocumentForm />

        <section className="bg-white rounded-lg shadow p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Saved documents ({list.length})
          </h2>

          {list.length === 0 ? (
            <p className="text-sm text-gray-500">
              No documents yet. Create one above to get started.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between py-3 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">
                      {doc.title}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">
                      {doc.id} · {doc.source} · {formatDate(doc.created_at)}
                    </p>
                  </div>
                  <form action={deleteDocument}>
                    <input type="hidden" name="id" value={doc.id} />
                    <button
                      type="submit"
                      className="text-sm text-red-600 underline hover:text-red-800"
                    >
                      Delete
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm tsc --noEmit
```

期望: 0 errors.

---

## Task 5: /account 页面加跳转链接

**Files:**
- Modify: `app/account/page.tsx:38-50`

- [ ] **Step 1: 在 Sign out 按钮前加 "我的文档" 链接**

打开 `app/account/page.tsx`,找到第 38-50 行的 footer 区域,替换为:

```tsx
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex gap-4 text-sm">
            <Link href="/" className="text-gray-600 underline">
              Home
            </Link>
            <Link href="/documents" className="text-gray-900 underline">
              My documents →
            </Link>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800"
            >
              Sign out
            </button>
          </form>
        </div>
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm tsc --noEmit
```

期望: 0 errors.

---

## Task 6: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 路由表加 /documents**

打开 `CLAUDE.md`,找到 "## 路由结构" 下的表格,在 `/account` 那行后插入一行:

```markdown
| `/documents` | Server | **受保护页**（M3 文档管理），列文档 + 新建/删除 |
```

- [ ] **Step 2: 文档管理流程说明**

在 `## 关键架构` 下追加一节（紧跟 "## 环境变量" 之前）:

```markdown
### 文档管理流程（M3）

1. `/documents` 是 Server Component，从 `documents` 表 `select` 当前用户的所有记录（RLS 自动过滤）
2. 新建走 `createDocument` Server Action（`app/documents/actions.ts`）：插入 document → `recursiveCharSplit` chunk → `embedChunks`（含 3 次重试）→ 批量 insert chunks。任一中间步骤失败，best-effort 删除已建的 document（不保证事务性）
3. 删除走 `deleteDocument` Server Action（同样文件），传 `id` via hidden input；chunks 通过 `on delete cascade` 自动清理
4. **必须用 `lib/supabase/server.ts`（anon + user JWT），走 RLS**；不要在这里用 `lib/supabase/admin.ts`（会绕过 RLS）
```

- [ ] **Step 3: 上线 checklist 确认**

CLAUDE.md 已有的 "上线 checklist" 段不需要改（M3 没引入新 env 变量）。

---

## Task 7: 端到端手动验证（用户跑）

> AI 不启动 dev server，**用户在本地跑** `pnpm dev` 验证。

- [ ] **Step 1: 用户跑 `pnpm dev`，访问 http://localhost:3000/documents**

未登录 → 自动跳 `/login`。

- [ ] **Step 2: 登录后回到 /documents**

期望: 看到 "No documents yet" 空态 + 新建表单。

- [ ] **Step 3: 填一份测试文档**

Title: `Test note`
Content: 至少 200 字的中文 / 英文段落（让 chunking 拆出 ≥2 段，证明 chunk + embed 链路工作）

期望: 按钮变 "Creating..."，几秒后表单清空，下方列表多一条 `Test note`，成功提示 "Created with N chunk(s)"。

- [ ] **Step 4: 在 Supabase Dashboard 验**

SQL Editor 跑:

```sql
select d.id, d.title, count(c.id) as chunk_count
from documents d
left join chunks c on c.document_id = d.id
where d.user_id = auth.uid()
group by d.id;
```

期望: 1 行，chunk_count ≥ 1。

- [ ] **Step 5: 测试删除**

点该文档旁的 "Delete" → 列表立即少一行。再跑上面 SQL 验证 documents + chunks 都清掉（cascade）。

- [ ] **Step 6: 跨用户隔离**

登出 → 注册一个新账号 → 访问 `/documents`。期望: 看不到上一个账号的文档（RLS 隔离）。

---

## 验收清单（M3 done 的判定）

- [ ] `middleware.ts` 把 `/documents` 加到受保护路径
- [ ] `app/documents/actions.ts` 有 `createDocument` + `deleteDocument`
- [ ] `app/documents/new-document-form.tsx` 用 `useActionState` 处理 pending + error
- [ ] `app/documents/page.tsx` 列表 + 表单 + 删除按钮齐全
- [ ] `/account` 页面有跳 `/documents` 的链接
- [ ] `pnpm tsc --noEmit` 0 errors
- [ ] Task 7 手动验证 6 步全部通过

---

## 下一步（M4 计划）

M3 完成后, 单独 plan M4 (`/chat` 流式问答 UI) — `match_chunks` 已经在 M1 写好, M4 只做:
- `app/chat/page.tsx` + 输入 form
- `app/chat/actions.ts` (`streamText` 走 `qwen-plus`, system prompt 注入 match_chunks top-5)
- 同样受 middleware 保护
