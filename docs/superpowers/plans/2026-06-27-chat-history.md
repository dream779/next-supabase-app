# Chat History & Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 RAG 聊天基础上加会话历史 + 侧边栏，把 chat 从 `/` 迁到 `/chat`。

**Architecture:** 新建 `conversations` + `messages` 两表（RLS 隔离）；`/api/chat` route handler 接收 `conversationId` 决定创建/复用会话、存 user 消息、用 `createUIMessageStream` 包装流（新会话先发 `data-conversation-created` chunk 通知客户端 URL 变化）；assistant 消息由客户端在 `useChat.status === 'ready'` 时调 Server Action `saveAssistantMessage` 写库。`/chat` 路由加 `<Sidebar />` Server Component（读 conversations 列表 + 新会话按钮 + 行内重命名/删除菜单）。

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Supabase (`@supabase/ssr` + pgvector 已就位) · AI SDK v6 (`@ai-sdk/react` + `createUIMessageStream`) · Tailwind 4 · Base UI (`@base-ui/react` + shadcn `base-mira` preset) · `node:test` for unit tests

**Spec:** `docs/superpowers/specs/2026-06-27-chat-history-design.md`

**项目约束（来自 CLAUDE.md）:**
- AI 不跑 dev server / build / lint
- 全部改完后跑一次 `pnpm tsc --noEmit` 验证类型
- `git add` / `git commit` / `git push` 由用户操作，AI **不主动执行**
- 重命名 / 移动已有文件前先 Read
- Next.js 16 API 与训练数据差异大：`cookies()` / `headers()` / `params` / `searchParams` 全部 async；改前看 `node_modules/next/dist/docs/`

---

## File Structure

**新增：**
- `supabase/migrations/0005_conversations.sql` — `conversations` + `messages` 表 + RLS + 索引
- `lib/chat-helpers.ts` — `truncateTitle` + `latestUserText` 纯函数
- `lib/chat-helpers.test.ts` — `node:test` 单元测试
- `app/chat/layout.tsx` — 公共外壳（`<Sidebar />` + main 区域）
- `app/chat/page.tsx` — 空白态
- `app/chat/[id]/page.tsx` — 加载态
- `app/chat/actions.ts` — `renameConversation` + `deleteConversation` + `saveAssistantMessage`
- `components/chat/chat-layout.tsx` — client：桌面两栏 + 移动抽屉
- `components/chat/sidebar.tsx` — server：读 conversations 列表
- `components/chat/sidebar-item.tsx` — client：单条 + 重命名/删除菜单
- `components/chat/new-chat-button.tsx` — client：移动端用的关闭抽屉的 Link
- `components/chat/mobile-sidebar-trigger.tsx` — client：TopNav 汉堡按钮
- `components/ui/alert-dialog.tsx` — shadcn 新增（base-ui alert-dialog 包装）

**修改：**
- `app/api/chat/route.ts` — 接收 `conversationId`，存 user 消息，`createUIMessageStream` 包装
- `components/chat/chat-interface.tsx` — 接 `initialMessages` / `conversationId` props，body 带 `conversationId`，`onData` 触发 `router.replace`，`useEffect` 监听 `status === 'ready'` 调 `saveAssistantMessage`
- `components/top-nav-content.tsx` — 移除 `/` 入口（避免点 `聊天` 还是去 `/`），加 `<MobileSidebarTrigger />`；新加 `/chat` 入口
- `app/page.tsx` — 改为 `redirect('/chat')`
- `middleware.ts` — `PROTECTED_PREFIXES` 加 `'/chat'`
- `app/(auth)/login/page.tsx` — `next` 默认值从 `'/'` 改为 `'/chat'`
- `app/(auth)/login/login-form.tsx` — 同上

**删除：**
- `components/auth-overlay.tsx`（auth overlay 失去用途）

---

## Task 1: DB Migration — conversations + messages

**Files:**
- Create: `supabase/migrations/0005_conversations.sql`

- [ ] **Step 1: 创建 migration 文件**

在 `supabase/migrations/0005_conversations.sql` 写：

```sql
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
```

- [ ] **Step 2: 本地应用 migration 并验证 schema**

```bash
# 用户自己跑 supabase CLI；AI 给出命令不执行
# npx supabase db push
# npx supabase db diff --schema public  # 应无 diff
```

- [ ] **Step 3: 提示用户 checkpoint**

告诉用户"DB schema 就绪，可以手动验证：用 psql / Supabase Studio 看 conversations / messages 表已建，RLS policy 4 条，索引 2 条"。等待用户确认 OK 再进入 Task 2。

---

## Task 2: chat-helpers（纯函数 + 单元测试）

**Files:**
- Create: `lib/chat-helpers.ts`
- Create: `lib/chat-helpers.test.ts`

- [ ] **Step 1: 写失败的测试 `lib/chat-helpers.test.ts`**

参考 `lib/chunking.test.ts` 的 `node:test` 风格：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateTitle, latestUserText } from './chat-helpers'
import type { UIMessage } from 'ai'

test('truncateTitle: 短文本不动', () => {
  assert.equal(truncateTitle('hello'), 'hello')
})

test('truncateTitle: 空字符串', () => {
  assert.equal(truncateTitle(''), '')
})

test('truncateTitle: 正好 max 字符', () => {
  const s = 'a'.repeat(30)
  assert.equal(truncateTitle(s), s)
})

test('truncateTitle: 超长截取 + 省略号', () => {
  const s = 'a'.repeat(50)
  assert.equal(truncateTitle(s, 30), 'a'.repeat(30) + '…')
})

test('truncateTitle: 合并多空白 + trim', () => {
  assert.equal(truncateTitle('  hello\n\n  world  '), 'hello world')
})

test('truncateTitle: 截断后多空白合并', () => {
  const s = 'a'.repeat(15) + '   ' + 'b'.repeat(20)
  const result = truncateTitle(s, 30)
  assert.ok(!result.includes('  '))
  assert.ok(result.endsWith('…'))
})

test('latestUserText: 取最后一条 user 消息', () => {
  const messages: UIMessage[] = [
    { id: '1', role: 'user', parts: [{ type: 'text', text: 'first' }] },
    { id: '2', role: 'assistant', parts: [{ type: 'text', text: 'reply' }] },
    { id: '3', role: 'user', parts: [{ type: 'text', text: 'second' }] },
  ]
  assert.equal(latestUserText(messages), 'second')
})

test('latestUserText: 无 user 消息返回空串', () => {
  const messages: UIMessage[] = [
    { id: '1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
  ]
  assert.equal(latestUserText(messages), '')
})

test('latestUserText: 拼接多个 text parts', () => {
  const messages: UIMessage[] = [
    {
      id: '1',
      role: 'user',
      parts: [
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world' },
      ],
    },
  ]
  assert.equal(latestUserText(messages), 'hello world')
})

test('latestUserText: 忽略非 text parts', () => {
  const messages: UIMessage[] = [
    {
      id: '1',
      role: 'user',
      parts: [
        { type: 'text', text: 'q:' },
        // @ts-expect-error - 测试故意混入未知 type
        { type: 'file', url: 'x' },
        { type: 'text', text: ' rest' },
      ],
    },
  ]
  assert.equal(latestUserText(messages), 'q: rest')
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm tsx --test lib/chat-helpers.test.ts
```

Expected: FAIL with "Cannot find module './chat-helpers'"

- [ ] **Step 3: 实现 `lib/chat-helpers.ts`**

```ts
import type { UIMessage } from 'ai'

export function truncateTitle(text: string, max = 30): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max) + '…'
}

export function latestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    return m.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')
  }
  return ''
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm tsx --test lib/chat-helpers.test.ts
```

Expected: 10 tests pass

- [ ] **Step 5: 提示用户 checkpoint**

告诉用户"`pnpm tsc --noEmit` 验证类型，等用户决定何时跑（Task 11 统一跑）"。**不要**主动 commit。

---

## Task 3: 改造 `/api/chat` route handler

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: 读当前文件确认 import 完整**

```bash
# 读 app/api/chat/route.ts 确认 import 列表
```

当前已有：`streamText`, `convertToModelMessages`, `UIMessage` from `'ai'`；`createOpenAICompatible` from `'@ai-sdk/openai-compatible'`；`createClient` from `'@/lib/supabase/server'`；`embedQuery` from `'@lib/embedding'`。

**新增 import**：``createUIMessageStream`, `createUIMessageStreamResponse` from `'ai'`，`latestUserText` from `'@/lib/chat-helpers'`。

- [ ] **Step 2: 替换整个文件为新实现**

完整替换 `app/api/chat/route.ts`：

```ts
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createClient } from '@/lib/supabase/server'
import { embedQuery } from '@/lib/embedding'
import { latestUserText } from '@/lib/chat-helpers'

const dashscope = createOpenAICompatible({
  name: 'dashscope',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY!,
})

const MODEL = dashscope.chatModel('qwen-plus')

const SYSTEM_PROMPT = `你是用户的私人知识助手。基于下面提供的【参考文档】回答问题。

规则:
- 优先用参考文档的内容回答,直接引用关键信息
- 如果参考文档没覆盖,明确说"知识库中没有相关内容",不要瞎编
- 回答简洁,用中文

【参考文档】:
{context}`

type Match = {
  id: string
  document_id: string
  content: string
  chunk_index: number
  similarity: number
}

async function retrieveContext(question: string, matchCount = 5): Promise<string> {
  const supabase = await createClient()

  const queryEmbedding = await embedQuery(question)
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: matchCount,
  })
  if (error) {
    console.error('[match_chunks] failed:', error.message)
    return ''
  }
  const matches = (data ?? []) as Match[]
  if (matches.length === 0) return ''

  return matches
    .map((m, i) => `[${i + 1}] (sim=${m.similarity.toFixed(3)}) ${m.content}`)
    .join('\n\n')
}

type ChatBody = {
  conversationId: string | null
  messages: UIMessage[]
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { conversationId, messages } = (await req.json()) as ChatBody
  const question = latestUserText(messages)
  if (!question) return new Response('Empty question', { status: 400 })

  const isNew = !conversationId

  // 1. 创建/复用会话
  let effectiveConvId = conversationId
  if (isNew) {
    const { data: conv, error: createErr } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: null })
      .select('id')
      .single()
    if (createErr || !conv) {
      console.error('[create conversation] failed:', createErr?.message)
      return new Response('Create failed', { status: 500 })
    }
    effectiveConvId = conv.id
  }

  // 2. 存用户消息（RLS 兜底：conversation 不属于 user → 403）
  const { error: userMsgErr } = await supabase.from('messages').insert({
    conversation_id: effectiveConvId,
    role: 'user',
    content: question,
  })
  if (userMsgErr) {
    if (/row-level security/i.test(userMsgErr.message)) {
      return new Response('Forbidden', { status: 403 })
    }
    console.error('[insert user message] failed:', userMsgErr.message)
    return new Response('Persist failed', { status: 500 })
  }

  // 3. RAG 检索
  const context = await retrieveContext(question)

  // 4. 流式生成
  const result = streamText({
    model: MODEL,
    system: SYSTEM_PROMPT.replace('{context}', context || '(无)'),
    messages: await convertToModelMessages(messages),
  })

  // 5. 包装流：先发 data-conversation-created 块 → 合并 LLM 流
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      if (isNew && effectiveConvId) {
        writer.write({
          type: 'data-conversation-created',
          data: { id: effectiveConvId },
        })
      }
      writer.merge(result.toUIMessageStream())
    },
    onError: () => '生成失败，请重试。',
  })

  return createUIMessageStreamResponse({ stream })
}
```

**重要改动**：
- 鉴权从 `getSession()` 改为 `supabase.auth.getUser()` —— `/api/chat` 是写操作的安全关键路径，按 CLAUDE.md 的「铁律」该用 getUser
- 删除原文件的 `latestUserText` 内部函数，改用 `lib/chat-helpers` 的
- RLS 错误检测保持 `/row-level security/i.test(err.message)` 兜底

- [ ] **Step 3: 跑类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors. 如果有 type 错，按报错修（最可能是 `effectiveConvId` 的 null 检查 —— 用 truthy guard 已加）。

- [ ] **Step 4: 提示用户 checkpoint**

告诉用户"route handler 改完，本地 dev 测一下：发条消息看 /api/chat 200（DB 表要先建好）"。

---

## Task 4: Server Actions

**Files:**
- Create: `app/chat/actions.ts`

- [ ] **Step 1: 创建 actions 文件**

`app/chat/actions.ts`：

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { truncateTitle } from '@/lib/chat-helpers'

const TITLE_MAX = 50

// ---------- rename ----------

export type RenameState = { error: string | null; ok?: boolean }

export async function renameConversation(
  _prev: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登录。' }

  const id = formData.get('id')?.toString() ?? ''
  const title = formData.get('title')?.toString().trim() ?? ''

  if (!id) return { error: '缺少会话 id。' }
  if (!title) return { error: '标题不能为空。' }
  if (title.length > TITLE_MAX) {
    return { error: `标题不能超过 ${TITLE_MAX} 字符。` }
  }

  const { error, count } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', id)
    .select('id', { count: 'exact', head: true })

  if (error) return { error: `重命名失败：${error.message}` }
  if (count === 0) return { error: '会话不存在或无权访问。' }

  revalidatePath('/chat')
  revalidatePath(`/chat/${id}`)
  return { error: null, ok: true }
}

// ---------- delete ----------

export async function deleteConversation(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('conversations').delete().eq('id', id)

  revalidatePath('/chat')
  revalidatePath(`/chat/${id}`)
  redirect('/chat')
}

// ---------- saveAssistantMessage ----------

export type SaveAssistantInput = {
  conversationId: string
  isNew: boolean
  question: string
  assistantText: string
}

export type SaveAssistantState = { error: string | null; ok?: boolean }

export async function saveAssistantMessage(
  input: SaveAssistantInput,
): Promise<SaveAssistantState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登录。' }
  if (!input.conversationId) return { error: '缺少会话 id。' }
  if (!input.assistantText) return { error: '回复内容为空。' }

  const { conversationId, isNew, question, assistantText } = input

  const { error: insertErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: assistantText,
  })
  if (insertErr) {
    if (/row-level security/i.test(insertErr.message)) {
      return { error: '无权访问该会话。' }
    }
    console.error('[saveAssistantMessage] insert failed:', insertErr.message)
    return { error: `保存回复失败：${insertErr.message}` }
  }

  if (isNew) {
    const title = truncateTitle(question)
    await supabase
      .from('conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  } else {
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  }

  revalidatePath('/chat')
  revalidatePath(`/chat/${conversationId}`)
  return { error: null, ok: true }
}
```

**注意**：`deleteConversation` 末尾调 `redirect('/chat')` —— 客户端在删除**当前**会话时也会 `router.push('/chat')`，但 Server Action 内的 redirect 是兜底（防止 client 漏跳转）。

- [ ] **Step 2: 跑类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: 提示用户 checkpoint**

告诉用户"actions.ts 就绪"。

---

## Task 5: shadcn AlertDialog 组件

**Files:**
- Create: `components/ui/alert-dialog.tsx`

- [ ] **Step 1: 用 shadcn CLI 生成（用户自己跑）**

```bash
# AI 给出命令不执行
# pnpm dlx shadcn@latest add alert-dialog
```

期望生成 `components/ui/alert-dialog.tsx`（基于 base-ui alert-dialog）。

如果 shadcn 4.12 在该 preset 不可用 alert-dialog，回退手动创建：

`components/ui/alert-dialog.tsx`：

```tsx
'use client'

import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg rounded-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-2 text-left', className)}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2', className)}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-lg font-semibold', className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
}
```

- [ ] **Step 2: 跑类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors. 若 base-ui 的 alert-dialog 导出名与上不同（可能是 `Root` / `Trigger` 等），按 `node_modules/@base-ui/react/alert-dialog/index.d.ts` 调整。

---

## Task 6: ChatInterface 重构

**Files:**
- Modify: `components/chat/chat-interface.tsx`（已存在）

- [ ] **Step 1: 重写整个文件**

完整替换 `components/chat/chat-interface.tsx`：

```tsx
'use client'

import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { UIMessage } from 'ai'
import { saveAssistantMessage } from '@/app/chat/actions'

type Props = {
  conversationId: string | null
  initialMessages?: UIMessage[]
  isAuthenticated?: boolean
}

type PendingSave = { isNew: boolean; question: string }

export function ChatInterface({
  conversationId,
  initialMessages = [],
  isAuthenticated = true,
}: Props) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null)
  const { messages, sendMessage, status } = useChat({
    id: conversationId ?? 'new',
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({ conversationId }),
    }),
    onData: (dataPart) => {
      if (dataPart.type === 'data-conversation-created') {
        const id = (dataPart.data as { id: string }).id
        router.replace(`/chat/${id}`)
      }
    },
    onError: (err) => {
      console.error('[chat] error:', err)
    },
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  // 流完全结束后保存 assistant 消息
  useEffect(() => {
    if (status !== 'ready' || !pendingSave) return
    if (!conversationId) return // 还没拿到新 id，不存

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistant) return
    const text = lastAssistant.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('')

    void saveAssistantMessage({
      conversationId,
      isNew: pendingSave.isNew,
      question: pendingSave.question,
      assistantText: text,
    })
    setPendingSave(null)
  }, [status, pendingSave, conversationId, messages])

  const isStreaming = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] border rounded-lg bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-12">
            <p>开始向你的知识库提问吧</p>
          </div>
        )}
        {messages.map((m) => {
          const text = m.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('')
          return (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  m.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100'
                }`}
              >
                {text}
              </div>
            </div>
          )
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!input.trim() || !isAuthenticated || isStreaming) return
          const text = input.trim()
          setPendingSave({ isNew: !conversationId, question: text })
          sendMessage({ text })
          setInput('')
        }}
        className="border-t p-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!isAuthenticated || isStreaming}
          placeholder={isAuthenticated ? '输入你的问题...' : '请先登录'}
          className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="submit"
          disabled={!isAuthenticated || isStreaming || !input.trim()}
          className="bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
        >
          发送
        </button>
      </form>
    </div>
  )
}
```

**关键改动**：
- `id: conversationId ?? 'new'` —— useChat 的 chat id，区分不同会话
- `body: () => ({ conversationId })` —— 每次发消息时携带当前 id
- `onData` 监听 `data-conversation-created` 触发 `router.replace`
- 发送时设置 `pendingSave`，`useEffect` 监听 `status === 'ready'` 时调 `saveAssistantMessage`
- `id` prop 让 useChat 在 conversationId 变化时正确区分（即使 page 没用 `key={id}`，chat id 也会 reset）

- [ ] **Step 2: 跑类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors. 重点看 `dataPart.data as { id: string }` 是否有类型问题，按报错调整。

- [ ] **Step 3: 提示用户 checkpoint**

告诉用户"ChatInterface 改完，本地试一下：登录后访问 `/chat`，发条消息应该正常工作（DB 还没建 /chat 路由所以会 404，先跳到 Task 7 之后才能完整测）"。

---

## Task 7: /chat 路由基础（layout + 空白页 + 加载页）

**Files:**
- Create: `app/chat/layout.tsx`
- Create: `app/chat/page.tsx`
- Create: `app/chat/[id]/page.tsx`

- [ ] **Step 1: 创建 `app/chat/layout.tsx`**

```tsx
import { Sidebar } from '@/components/chat/sidebar'
import { ChatLayout } from '@/components/chat/chat-layout'

export default function ChatRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatLayout sidebar={<Sidebar />}>
      {children}
    </ChatLayout>
  )
}
```

- [ ] **Step 2: 创建 `app/chat/page.tsx`（空白态）**

```tsx
import { getSession } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat/chat-interface'

export default async function NewChatPage() {
  const user = await getSession()

  return (
    <main className="flex-1 p-6 min-w-0">
      <div className="h-full">
        {user ? (
          <ChatInterface conversationId={null} />
        ) : (
          <p className="text-gray-600 text-center mt-12">请登录后开始聊天。</p>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: 创建 `app/chat/[id]/page.tsx`（加载态）**

```tsx
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat/chat-interface'
import type { UIMessage } from 'ai'

type Conversation = { id: string; title: string | null; user_id: string }
type Message = { id: string; role: 'user' | 'assistant'; content: string; created_at: string }

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getSession()
  if (!user) notFound()

  const supabase = await createClient()
  // RLS 兜底：not_found 也用 notFound() 返回 404
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, title, user_id')
    .eq('id', id)
    .maybeSingle()

  if (convErr || !conv) notFound()

  const { data: msgs, error: msgsErr } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  if (msgsErr) {
    return (
      <main className="flex-1 p-6 min-w-0">
        <p className="text-red-600">加载消息失败：{msgsErr.message}</p>
      </main>
    )
  }

  const initialMessages: UIMessage[] = ((msgs ?? []) as Message[]).map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: 'text', text: m.content }],
  }))

  return (
    <main className="flex-1 p-6 min-w-0">
      <ChatInterface
        key={id}
        conversationId={id}
        initialMessages={initialMessages}
      />
    </main>
  )
}
```

**关键点**：
- 用 `notFound()` 处理 RLS 拒绝（fetch 0 行），避免泄漏「会话存在但不属于你」信息
- `key={id}` 强制 remount（防切会话残留）
- `initialMessages` 从 DB 加载，parts 只含 text（V1 不存其他 part 类型）

- [ ] **Step 4: 跑类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors. 可能有 `import { createClient, getSession }` 重复 import 警告 —— 合并为一行 `import { createClient, getSession } from '@/lib/supabase/server'`。

---

## Task 8: Sidebar Context + ChatLayout

**Files:**
- Create: `components/chat/sidebar-context.ts`
- Create: `components/chat/chat-layout.tsx`

- [ ] **Step 1: 创建 `components/chat/sidebar-context.ts`**

```ts
'use client'

import { createContext, useContext } from 'react'

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

export const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebar(): SidebarContextValue | null {
  return useContext(SidebarContext)
}
```

- [ ] **Step 2: 创建 `components/chat/chat-layout.tsx`**

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import { SidebarContext, useSidebar } from './sidebar-context'
import { cn } from '@/lib/utils'

type Props = {
  sidebar: ReactNode
  children: ReactNode
}

export { useSidebar }

export function ChatLayout({ sidebar, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <div className="flex h-[calc(100vh-3.5rem)] relative">
        {/* 桌面侧边栏 */}
        <div className="hidden md:block">{sidebar}</div>

        {/* 移动遮罩 */}
        {open && (
          <div
            className="md:hidden fixed inset-0 top-14 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
        )}

        {/* 移动抽屉 */}
        <div
          className={cn(
            'md:hidden fixed top-14 bottom-0 left-0 z-50 w-72 bg-background border-r transition-transform duration-200',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {sidebar}
        </div>

        {/* 主区域 */}
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </SidebarContext.Provider>
  )
}
```

`useSidebar` 从 `sidebar-context.ts`（Step 1）导入并重导出，方便 sidebar 子组件统一从 `./chat-layout` 引用。

- [ ] **Step 3: 跑类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors

---

## Task 9: NewChatButton + SidebarItem + Sidebar

**Files:**
- Create: `components/chat/new-chat-button.tsx`
- Create: `components/chat/sidebar-item.tsx`
- Create: `components/chat/sidebar.tsx`

- [ ] **Step 1: 创建 `new-chat-button.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import { useSidebar } from './chat-layout'

export function NewChatButton() {
  const sidebar = useSidebar()
  return (
    <Button
      variant="default"
      className="w-full justify-start"
      nativeButton={false}
      render={
        <Link
          href="/chat"
          onClick={() => sidebar?.setOpen(false)}
        />
      }
    >
      <HugeiconsIcon icon={Add01Icon} size={16} className="mr-2" />
      新会话
    </Button>
  )
}
```

- [ ] **Step 2: 创建 `sidebar-item.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { MoreVerticalIcon, Edit01Icon, Delete01Icon } from '@hugeicons/core-free-icons'
import { renameConversation, deleteConversation } from '@/app/chat/actions'
import { useSidebar } from './chat-layout'

type Props = {
  id: string
  title: string
  formattedTime: string
}

export function SidebarItem({ id, title, formattedTime }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sidebar = useSidebar()
  const isActive = pathname === `/chat/${id}`

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function commitRename() {
    const newTitle = editValue.trim()
    if (!newTitle || newTitle === title) {
      setEditing(false)
      setEditValue(title)
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', id)
      fd.set('title', newTitle)
      await renameConversation({ error: null }, fd)
      setEditing(false)
    })
  }

  async function handleDelete() {
    setConfirmDelete(false)
    await deleteConversation(id)
    sidebar?.setOpen(false)
    if (isActive) router.push('/chat')
  }

  return (
    <div
      className={cn(
        'group relative flex items-center rounded-md hover:bg-accent',
        isActive && 'bg-accent',
      )}
    >
      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') {
              setEditing(false)
              setEditValue(title)
            }
          }}
          className="flex-1 px-3 py-2 text-sm bg-background border rounded"
        />
      ) : (
        <Link
          href={`/chat/${id}`}
          onClick={() => sidebar?.setOpen(false)}
          className="flex-1 min-w-0 px-3 py-2"
        >
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-xs text-muted-foreground">{formattedTime}</div>
        </Link>
      )}

      {!editing && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="opacity-0 group-hover:opacity-100 p-2 rounded hover:bg-accent-foreground/10"
            aria-label="会话操作"
          >
            <HugeiconsIcon icon={MoreVerticalIcon} size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onClick={() => { setEditValue(title); setEditing(true) }}>
              <HugeiconsIcon icon={Edit01Icon} size={14} className="mr-2" />
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setConfirmDelete(true)}
              className="text-destructive"
            >
              <HugeiconsIcon icon={Delete01Icon} size={14} className="mr-2" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话？</AlertDialogTitle>
            <AlertDialogDescription>
              这会删除「{title}」及其所有消息，且不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

`renameConversation` 调用时传 `{ error: null }` 作为 prev state（手动调用而非 useActionState）。

- [ ] **Step 3: 创建 `sidebar.tsx`**

```tsx
import { getSession } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { SidebarItem } from './sidebar-item'
import { NewChatButton } from './new-chat-button'

type Conversation = {
  id: string
  title: string | null
  updated_at: string
}

function formatRelative(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return '昨天'
  if (diffDay < 7) return `${diffDay} 天前`
  return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export async function Sidebar() {
  const user = await getSession()

  let conversations: Conversation[] = []
  if (user) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100)
    conversations = (data ?? []) as Conversation[]
  }

  return (
    <aside className="flex flex-col h-full w-full md:w-64 border-r bg-gray-50/50">
      <div className="p-3">
        <NewChatButton />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-gray-500">
            还没有会话，开始第一个问题吧
          </div>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <SidebarItem
                  id={c.id}
                  title={c.title ?? '新会话'}
                  formattedTime={formatRelative(c.updated_at)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: 跑类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors. `Button` 的 `variant="destructive"` 可能项目 shadcn 还没这 variant——若报错，去 `components/ui/button.tsx` 看 cva 定义，没有就加：

```ts
// 在 variants 里加：
destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
```

---

## Task 10: MobileSidebarTrigger + TopNav 集成

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <div className="flex h-[calc(100vh-3.5rem)] relative">
        {/* 桌面侧边栏 */}
        <div className="hidden md:block">{sidebar}</div>

        {/* 移动遮罩 */}
        {open && (
          <div
            className="md:hidden fixed inset-0 top-14 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
        )}

        {/* 移动抽屉 */}
        <div
          className={cn(
            'md:hidden fixed top-14 bottom-0 left-0 z-50 w-72 bg-background border-r transition-transform duration-200',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {sidebar}
        </div>

        {/* 主区域 */}
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </SidebarContext.Provider>
  )
}
```

`useSidebar` 从 `sidebar-context.ts`（Step 1 创建）导入并重导出，方便 `sidebar-item.tsx` / `mobile-sidebar-trigger.tsx` / `new-chat-button.tsx` 统一从 `./chat-layout` 引用。

- [ ] **Step 3: 跑类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors

---

## Task 11: 重定向 / + middleware + 登录 next 默认值

**Files:**
- Modify: `app/page.tsx`
- Modify: `middleware.ts`
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(auth)/login/login-form.tsx`
- Delete: `components/auth-overlay.tsx`

- [ ] **Step 1: 替换 `app/page.tsx`**

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/chat')
}
```

- [ ] **Step 2: 修改 `middleware.ts`**

找到：
```ts
const PROTECTED_PREFIXES = ['/documents', '/account']
```

改为：
```ts
const PROTECTED_PREFIXES = ['/documents', '/account', '/chat']
```

- [ ] **Step 3: 修改 `app/(auth)/login/page.tsx`**

把 `const next = params.next ?? '/'` 改为 `const next = params.next ?? '/chat'`。

- [ ] **Step 4: 修改 `app/(auth)/login/login-form.tsx`**

读文件，搜默认 next 值（如果有 hardcode 的 `'/'`），改为 `'/chat'`。如果是 props 传入已经处理好的就不动。

- [ ] **Step 5: 删除 `components/auth-overlay.tsx`**

```bash
rm /Users/liuyunlong/Desktop/MyProjects/next-supabase-app/components/auth-overlay.tsx
```

- [ ] **Step 6: 删除 `app/page.tsx` 中任何引用 auth-overlay 的代码**

上一步已经把 page.tsx 替换为 redirect，引用自然没了。

- [ ] **Step 7: 跑类型检查**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors. 若有「找不到 auth-overlay」错，说明 `top-nav-content.tsx` 或别处还 import 它 —— grep 一下：

```bash
grep -r "auth-overlay" /Users/liuyunlong/Desktop/MyProjects/next-supabase-app --include="*.ts" --include="*.tsx"
```

把 import 清掉。

---

## Task 12: 端到端手动 QA + 收尾

**Files:**
- (no file changes — 验证)

- [ ] **Step 1: 一次性 typecheck**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2: 用户跑 dev server + 完整 QA 清单**

告诉用户跑 `pnpm dev`，按 spec 的「手动 QA 清单」逐项验证：

- [ ] 未登录访问 `/chat` → 跳 `/login?next=/chat`
- [ ] 未登录访问 `/` → 最终落到 `/login?next=/chat`
- [ ] 登录后访问 `/` → 重定向到 `/chat`（空白态）
- [ ] 新会话：发第一条消息 → URL 变成 `/chat/[id]` → 侧边栏出现新会话
- [ ] 加载历史：刷新 `/chat/[id]` → 消息完整恢复
- [ ] 续问：发第二条消息 → 侧边栏该项置顶
- [ ] 重命名：行内编辑 → Enter 保存 → 列表立即更新
- [ ] 删除非当前会话 → 留在原页面
- [ ] 删除当前会话 → 跳回 `/chat` 空白态
- [ ] RLS 隔离：另一个 user 用别人会话 id 发消息 → 403
- [ ] 移动端：汉堡 → 抽屉 → 选会话 → 自动关闭
- [ ] 空状态：未发过任何消息的用户看到「还没有会话」

- [ ] **Step 3: 修复 QA 中发现的问题**

每个失败项单独开一个修，不混在主 PR 里。

- [ ] **Step 4: 提示用户 commit**

告诉用户：
> "全部 12 个任务完成，类型检查 0 错误。本地 QA 跑通后，建议分 3 个 commit：
> 1. `feat(rag): chat history - DB schema + helpers`
> 2. `feat(rag): chat history - /api/chat refactor + server actions`
> 3. `feat(rag): chat history - /chat route + sidebar UI`
>
> 由你执行 commit。"

---

## Self-Review Checklist

- [x] Spec coverage：数据模型（Task 1）、chat-helpers（Task 2）、route handler 改造（Task 3）、Server Actions（Task 4）、AlertDialog（Task 5）、ChatInterface 重构（Task 6）、/chat 路由（Task 7）、Sidebar context + layout（Task 8）、Sidebar list + item（Task 9）、MobileTrigger + TopNav（Task 10）、重定向 + middleware（Task 11）、QA（Task 12）—— 全覆盖
- [x] Placeholder scan：所有 code block 是完整代码；无 "TBD" / "TODO" / "implement later"
- [x] Type consistency：`truncateTitle` / `latestUserText` / `saveAssistantMessage` / `renameConversation` / `deleteConversation` / `SaveAssistantInput` / `SaveAssistantState` / `SidebarItem` / `NewChatButton` / `ChatLayout` / `useSidebar` / `SidebarContext` —— 名字跨任务一致
- [x] 不跑 dev server / build / lint —— 全部 `pnpm tsc --noEmit` 验证类型
- [x] 不主动 commit —— Step 12 明确让用户自己 commit
- [x] 重命名 / 移动文件前先 Read —— Task 11 读 login-form 后才改

## 已知风险

- **AI SDK 6 的 `createUIMessageStream` API**：Task 3 用了 `onError` 回调。若实际签名是 `onError?: (error: unknown) => string`，匹配；若不是，按 `node_modules/.pnpm/ai@7.0.3_zod@4.4.3/node_modules/ai/dist/index.d.ts` 调整。
- **`data-conversation-created` 的类型**：客户端 `onData` 的 `dataPart.data` 推断为 `unknown`，需 `as { id: string }`。Task 6 已加断言。
- **shadcn alert-dialog 生成**：若 CLI 不可用，Task 5 给了手动 fallback。
- **base-ui `AlertDialog.Title` 等命名**：实际可能是 `Title` / `Description` / `Backdrop` / `Popup` 等，按 base-ui 1.6 的 d.ts 调整。
- **Sidebar 列表性能**：V1 LIMIT 100，多用户超过 100 时按需扩展（不在本计划范围）。
- **`router.replace` 时机**：client 的 `onData` 收到 `data-conversation-created` 时立即跳转，但 stream 还在推。Next.js 16 的 `router.replace` 不会中断 React 树，stream 继续；如发现异常，按需改用 `useTransition` 包。
