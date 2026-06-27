# RAG M4: /chat 流式问答 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给登录用户提供 `/chat` 页面，基于用户自己的文档库做 RAG 流式问答：用户输入问题 → 服务端 `embedQuery` → `match_chunks` RPC 拿 top-5 → 注入 system prompt → DashScope `qwen-plus` 流式输出。

**Architecture:** 1 个 Route Handler (`app/api/chat/route.ts`) 接收 `useChat` 的 POST，做 RAG 检索后 `streamText` 流回 `UIMessage`；1 个 Client Component (`app/chat/chat-interface.tsx`) 用 `useChat` 钩子，渲染消息列表 + 输入 form；1 个 Server Component (`app/chat/page.tsx`) 包装 client；`middleware.ts` 加 `/chat` 保护。`lib/embedding.ts` 已就绪 (M3 ARK 切换)，`match_chunks` RPC 已就绪 (M1)。

**Tech Stack:**
- AI SDK 6 (`ai@^6.0.208`, 新装 `@ai-sdk/react`)
- `@ai-sdk/openai-compatible` + DashScope `qwen-plus` (LLM 仍用 DashScope, 不走 ARK)
- `lib/embedding.ts` (`embedQuery`, 单 input 路径, 1024d)
- `match_chunks` RPC (RLS 通过 user JWT 自动隔离)
- Next.js 16 Route Handler + Server Component
- `useChat` + `DefaultChatTransport` (v6 新 API)

---

## ⚠️ 用户协作规则（必须遵守）

- 用户处理 git init / commit / push，AI 不主动执行
- 不启动 dev server
- 改完跑一次 `pnpm tsc --noEmit` 即可，不要每个 task 都跑
- pnpm only

---

## 前置上下文

- M1 ✅ `match_chunks` RPC 在 Supabase (auth.uid() 链隔离)
- M2 ✅ RLS 多用户隔离 (M4 复用, 走 `lib/supabase/server.ts` anon client)
- M3 ✅ `lib/embedding.ts` 切到 ARK multimodal, `embedQuery` 单 input 验证过
- `ai@6` + `@ai-sdk/openai-compatible@2` 已在 deps, 缺 `@ai-sdk/react`
- `ai` v6 的 `useChat` API: 返回 `{ messages: UIMessage[], sendMessage, status }`; `sendMessage({ text: '...' })` 发送; `messages[i].parts` 渲染
- 服务端用 `streamText` + `convertToModelMessages(uiMessages)` + `result.toUIMessageStreamResponse()` 流回
- 当前 LLM hardcode DashScope `qwen-plus` (memory 锁定), `LLM_PROVIDER` env 暂不读

---

## File Structure

**新增**：
```
app/api/chat/
  route.ts                          # Route Handler: POST, embed → match_chunks → streamText
app/chat/
  page.tsx                          # Server Component, 渲染 <ChatInterface />
  chat-interface.tsx                # 'use client', useChat + 消息列表 + 输入 form
```

**修改**：
```
package.json                        # +1 dep: @ai-sdk/react
middleware.ts                       # /chat 加到受保护路径
CLAUDE.md                           # 路由表加 /chat + /api/chat + 问答流程段
```

---

## Task 1: 装 @ai-sdk/react

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 装包**

```bash
pnpm add @ai-sdk/react
```

期望: `package.json` dependencies 加一行 `"@ai-sdk/react": "..."`, `pnpm-lock.yaml` 更新。

- [ ] **Step 2: 验证**

```bash
ls node_modules/@ai-sdk/react/package.json
```

期望: 文件存在。

---

## Task 2: Route Handler /api/chat

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: 创建文件**

文件路径: `app/api/chat/route.ts`

```ts
import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createClient } from '@/lib/supabase/server'
import { embedQuery } from '@/lib/embedding'

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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ''

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

function latestUserText(messages: UIMessage[]): string {
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

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] }
  const question = latestUserText(messages)
  const context = question ? await retrieveContext(question) : ''

  const result = streamText({
    model: MODEL,
    system: SYSTEM_PROMPT.replace('{context}', context || '(无)'),
    messages: convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm tsc --noEmit
```

期望: 0 errors. 如果报 `Cannot find module 'ai'` 或 `convertToModelMessages` 不存在, 确认 `ai` 是 v6 (`pnpm ls ai` 应显示 `6.0.x`)。

---

## Task 3: ChatInterface Client Component

**Files:**
- Create: `app/chat/chat-interface.tsx`

- [ ] **Step 1: 创建文件**

文件路径: `app/chat/chat-interface.tsx`

```tsx
'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRef, useState, type FormEvent } from 'react'

function getMessageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

export function ChatInterface() {
  const [input, setInput] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  const isStreaming = status === 'submitted' || status === 'streaming'
  const canSend = input.trim().length > 0 && !isStreaming

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return
    sendMessage({ text })
    setInput('')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-lg shadow">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center mt-12">
            问点关于你知识库的问题, 答案会基于你上传的文档生成。
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {getMessageText(m.parts) || (m.role === 'assistant' ? '...' : '')}
              </div>
            </div>
          ))
        )}
        {error && (
          <p className="text-sm text-red-600 text-center">
            错误: {error.message}
          </p>
        )}
      </div>

      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="border-t border-gray-200 p-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入问题..."
          disabled={isStreaming}
          className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
        >
          {isStreaming ? 'Thinking...' : 'Send'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm tsc --noEmit
```

期望: 0 errors.

---

## Task 4: /chat 页面 Server Component

**Files:**
- Create: `app/chat/page.tsx`

- [ ] **Step 1: 创建文件**

文件路径: `app/chat/page.tsx`

```tsx
import Link from 'next/link'
import { ChatInterface } from './chat-interface'

export default async function ChatPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Ask your knowledge base</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/documents" className="text-gray-600 underline">
              My documents
            </Link>
            <Link href="/account" className="text-gray-600 underline">
              Account
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-gray-600 underline">
                Sign out
              </button>
            </form>
          </nav>
        </header>

        <ChatInterface />
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

## Task 5: middleware 加 /chat 保护

**Files:**
- Modify: `middleware.ts:32-37`

- [ ] **Step 1: 修改路径检查**

打开 `middleware.ts`,把当前的:

```ts
  if (
    !user &&
    (request.nextUrl.pathname.startsWith('/account') ||
      request.nextUrl.pathname.startsWith('/documents'))
  ) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
```

改为:

```ts
  const PROTECTED_PREFIXES = ['/account', '/documents', '/chat']
  if (
    !user &&
    PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))
  ) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
```

注: `/api/chat` 是 route handler, 也受保护 — 但 useChat 在客户端调用, 不会带 user session 的话 middleware 会拒绝。**测试时如发现 /api/chat 返回 307 redirect 到 /login, 这是因为 Route Handler 也走 middleware**, 需在 matcher 里加排除 — 但实际上 useChat 发起 POST 时会带 user session cookies, 走 `supabase.auth.getUser()` 能取到 user, 不会触发 redirect。验证: 用户登录后提问, 没问题即说明 OK; 若有问题再单独修。

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm tsc --noEmit
```

期望: 0 errors.

---

## Task 6: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 路由表加 /chat + /api/chat**

打开 `CLAUDE.md`,找到路由表, 在 `/documents` 后插入:

```markdown
| `/chat` | Server + Client | **受保护页**（M4 流式问答），用 `useChat` 调 `/api/chat` |
| `/api/chat` | Route Handler POST | M4 RAG 流式 endpoint：embed query → `match_chunks` → DashScope `qwen-plus` |
```

- [ ] **Step 2: 加问答流程段**

在 "### 文档管理流程（M3）" 段后追加:

```markdown
### 问答流程（M4）

1. 浏览器 `/chat` 是 Client Component (`useChat`)，POST `/api/chat` 发消息
2. Route Handler 做 3 步: `embedQuery(question)` → RPC `match_chunks` 拿 top-5 → 拼到 system prompt
3. `streamText` 调 DashScope `qwen-plus`，流回 `UIMessage` 给客户端
4. **必须用 `lib/supabase/server.ts`** (走 RLS, user 自动隔离); embed 走 ARK (`lib/embedding.ts`), LLM 走 DashScope
5. 没装 `@ai-sdk/react` 的话 `useChat` 不可用
```

---

## Task 7: 端到端手动验证（用户跑）

> AI 不启动 dev server，**用户在本地跑** `pnpm dev` 验证。

- [ ] **Step 1: 跑 dev server**

```bash
pnpm dev
```

打开 http://localhost:3000/chat (未登录应跳 `/login`).

- [ ] **Step 2: 登录后回到 /chat**

期望: 看到 "问点关于你知识库的问题..." 空态提示 + 底部输入框。

- [ ] **Step 3: 提一个之前测过文档里的问题**

输入: `Next.js App Router 是什么` (你 M3 上传过 RAG 技术笔记)

期望:
- 按钮变 "Thinking..."
- 几秒后开始流式输出中文回答, 内容引用 RAG 技术笔记第 1 段
- 用户消息右对齐 (灰底), 助手消息左对齐 (白底)

- [ ] **Step 4: 提一个文档没覆盖的问题**

输入: `今天天气怎么样`

期望: 助手说"知识库中没有相关内容"或类似 (不能瞎编天气).

- [ ] **Step 5: 多轮对话**

继续问: `那 RLS 呢?`

期望: 助手基于 RAG 技术笔记第 3 段回答 RLS, **不要重复上一轮的"今天天气"问题**.

- [ ] **Step 6: 跨用户隔离 (如果新建测试账号方便)**

登出 → 注册新账号 → 上传 1 个不同文档 → 问相同问题 → 助手只引用新文档, 不引用老账号的 RAG 技术笔记.

---

## 验收清单（M4 done 的判定）

- [ ] `pnpm add @ai-sdk/react` 装好
- [ ] `app/api/chat/route.ts` 端到端工作 (POST → match_chunks → streamText → 流回)
- [ ] `app/chat/chat-interface.tsx` 渲染消息列表 + 输入 form, 流式更新正常
- [ ] `app/chat/page.tsx` 包装 client, 包含 /documents 和 /account 链接
- [ ] `middleware.ts` 保护 /chat (PROTECTED_PREFIXES 数组)
- [ ] `CLAUDE.md` 路由表 + 流程段更新
- [ ] `pnpm tsc --noEmit` 0 errors
- [ ] Task 7 手动验证 6 步全部通过

---

## 下一步

M4 完成后, 4 里程碑 (M1-M4) 全部 done, RAG MVP 完成。后续可选:
- 消息持久化 (存到 `messages` 表, 加 RLS)
- 多对话 (conversation 概念, sidebar)
- 流式打字机效果优化 (SSE vs WebSocket)
- streaming error retry
- token 用量统计
