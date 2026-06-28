# Chat History & Sidebar Design Spec

**Date:** 2026-06-27
**Status:** Draft (pending user approval)
**Project:** next-supabase-app

## Goal

在现有 RAG 聊天基础上加 **会话历史 + 侧边栏**，让用户能：
- 开启多个独立会话、随时切换
- 查看历史会话列表
- 重命名 / 删除会话
- 刷新或换设备后历史仍在

UI 风格参考 Doubao / ChatGPT：左侧会话列表 + 右侧对话区。

副带：**把 chat 从 `/` 迁到 `/chat`**。`/` 重定向到 `/chat`，侧边栏只长在 `/chat` 上。`/chat` 走 middleware 保护（与 `/account`、`/documents` 一致），未登录跳 `/login`。auth overlay 失去用途，移除。

## Decisions (locked)

| Topic | Decision |
|---|---|
| Chat 入口 | 新建 `/chat` 路由（与 `/chat/[id]` 动态路由） |
| 首页 `/` | `redirect('/chat')` |
| Auth | middleware 强制登录；移除首页的 auth overlay |
| 消息存储 | 纯文本（`role text + content text`），不存 UIMessage JSONB |
| 持久化方式 | 服务端创建会话 + 存 user 消息 + 流式生成；客户端 `status === 'ready'` 后调 Server Action 存 assistant + 更新 title |
| Title 自动生成 | 取首条用户消息前 30 字符 + 省略号，不用 LLM 总结 |
| 侧边栏范围 | 新会话按钮 + 会话列表 + 行内重命名/删除（hover 出现菜单） |
| 列表限制 | `LIMIT 100`，按 `updated_at desc` 排序 |
| 归属校验 | 全部走 RLS，不预校验、不读 service_role |
| 范围（不做） | ❌ 搜索 / 分享 / 导出 / 引用标记 / 工具调用 / 多模态 |

## Architecture

### Route map

| Route | Type | 说明 |
|---|---|---|
| `/` | Server | `redirect('/chat')` |
| `/chat` | Server + Client | 空白态：无消息；`<ChatInterface conversationId={null} />` |
| `/chat/[id]` | Server + Client | 加载态：读 `conversations` + `messages`，传给 `ChatInterface` 当 `initialMessages` |
| `/api/chat` | Route Handler | 改造：请求体加 `conversationId`，编排会话 + 消息持久化 + 流式回写 |
| `/login`, `/signup`, `/auth/callback` | — | 不变 |
| `/account`, `/documents` | — | 不变 |
| Middleware | — | `PROTECTED_PREFIXES` 加 `'/chat'` |

### 首条消息触发 URL 变化

1. 用户在 `/chat`（空白）发第一条消息
2. `/api/chat` 收到 `conversationId: null` → INSERT `conversations`（`title=null`）→ 拿到新 id
3. 流式 metadata 把 `{ conversationId: 'xxx' }` 回给客户端（仅本次新会话时）
4. 客户端 `router.replace('/chat/xxx')` —— URL 立即更新，侧边栏高亮
5. 用户继续问 → useChat transport body 携带 `conversationId`

用 `router.replace` 而非 `push`，避免历史栈堆空白 `/chat`。

### 侧边栏布局

桌面端（≥768px）：

```
┌─────────────────────────────────────────────────┐
│ TopNav（已有）                                   │
├──────────────┬──────────────────────────────────┤
│ [+ 新会话]   │                                   │
│ 会话 1  ⋮    │       对话区域                   │
│ 会话 2  ⋮    │       （ChatInterface）          │
│ 会话 3  ⋮    │                                   │
│ ...          │                                   │
└──────────────┴──────────────────────────────────┘
   260px             flex-1
```

移动端（<768px）：侧边栏默认隐藏，TopNav 左侧加汉堡按钮 → 打开为 overlay 抽屉（点击会话后自动关闭）。

### 组件拆分

```
app/chat/
├── layout.tsx                # 公共外壳：<Sidebar /> + <main>{children}</main>
├── page.tsx                  # 空白态（/chat，无 conversationId）
├── [id]/
│   └── page.tsx              # 加载态（/chat/[id]）
└── actions.ts                # renameConversation + deleteConversation + saveAssistantMessage

components/chat/
├── chat-interface.tsx        # 已有，改造接 conversationId + initialMessages
├── chat-layout.tsx           # 新增：桌面+移动两栏/抽屉布局（client）
├── sidebar.tsx               # 新增：读 conversations 列表（server）
├── sidebar-item.tsx          # 新增：单条 + 菜单（重命名/删除）
├── new-chat-button.tsx       # 新增：Link 到 /chat
└── mobile-sidebar-trigger.tsx # 新增：TopNav 里的汉堡按钮
```

`app/page.tsx` 改为简单 `redirect('/chat')` Server Component。

**ChatInterface 状态**：
- 接收 props：`conversationId: string | null`、`initialMessages: UIMessage[]`
- 内部 state（在 `key` 变化时全部重置）：
  - `pendingSave: { isNew: boolean, question: string } | null` —— 用户点击发送时设置，`isNew` 取决于当时是否有 `conversationId`（无 → `true`，有 → `false`），`question` 是这次发起的 user 消息文本
  - 触发流式后保持；`useEffect` 监听 `status === 'ready'` 时如有 `pendingSave`，调 `saveAssistantMessage`，然后清空
- **`key` 重置**：在 `/chat/[id]/page.tsx` 用 `<ChatInterface key={id} ... />` 强制 remount，避免切会话时旧 messages / pendingSave 残留

**onData 触发顺序约束**：当新会话的首条消息发出时，`onData` 收到的 `data-conversation-created` 早于 LLM 内容流（因为 API 在合并 LLM 流之前先 write 这个 data chunk）。`router.replace` 触发后 Next.js 仍渲染当前组件，stream 继续推进；remount 由下一次路由切换触发，这次不需要 remount。

## Data Model

### Migration `0005_conversations.sql`

```sql
create table conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,                       -- null = 还没自动生成
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

删除策略：`on delete cascade`，删 conversation → 自动清 messages。

## API & Server Actions

### `/api/chat` 改造

请求体：
```ts
{ conversationId: string | null, messages: UIMessage[] }
```

处理流程（伪代码）：

```ts
export async function POST(req: Request) {
  const user = await getSession()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { conversationId, messages } = await req.json() as Body
  const question = latestUserText(messages)
  if (!question) return new Response('Empty question', { status: 400 })

  const supabase = await createClient()
  const isNew = !conversationId

  // 1. 创建/复用会话
  let effectiveConvId = conversationId
  if (isNew) {
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, title: null })
      .select('id')
      .single()
    if (error || !conv) return new Response('Create failed', { status: 500 })
    effectiveConvId = conv.id
  }

  // 2. 存用户消息
  // RLS 兜底：conversation 不属于 user → 42501 错误 → 403
  const { error: userMsgErr } = await supabase.from('messages').insert({
    conversation_id: effectiveConvId,
    role: 'user',
    content: question,
  })
  if (userMsgErr) {
    if (/row-level security/i.test(userMsgErr.message)) {
      return new Response('Forbidden', { status: 403 })
    }
    return new Response('Persist failed', { status: 500 })
  }

  // 3. RAG 检索（逻辑不动）
  const context = question ? await retrieveContext(question) : ''

  // 4. 流式生成
  const result = streamText({
    model: MODEL,
    system: SYSTEM_PROMPT.replace('{context}', context || '(无)'),
    messages: await convertToModelMessages(messages),
  })

  // 5. 包装流：先写 data chunk（新会话时携带新 id）→ 合并 LLM 流
  //    客户端 useChat 的 onData 回调接收 data chunk
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      if (isNew) {
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

**后续在客户端 `onData` 钩子里**：
```ts
const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  onData: (dataPart) => {
    if (dataPart.type === 'data-conversation-created') {
      router.replace(`/chat/${dataPart.data.id}`)
    }
  },
})
```

**持久化助手消息**：不放在 `onEnd`/`onFinish` 里（LLM stream 的 onFinish 只覆盖 LLM 段，custom data chunk 之后的合并时机不可靠）。改为：客户端在 stream 完全结束（`status === 'ready'`）时调 Server Action `saveAssistantMessage(convId, text)`，Server Action 走 RLS 兜底写库 + 更新 title/updated_at。

> **修订理由**：把持久化从 LLM `onFinish` 移到客户端 `status === 'ready'` 触发的 Server Action，更可靠（不依赖 LLM 流的钩子在合并流中是否触发），并显式 fail-safe：客户端不会"以为存了实际没存"。服务端 `onFinish` 写库是隐式的，出了问题难定位。

**首条消息判定**：`isNew = !conversationId` 即可。客户端只在 `/chat`（无 id）发第一条消息时 `conversationId: null`，后续都用同一个 id。

**流式中断处理**：AI SDK 6 的 `toUIMessageStreamResponse` 在客户端断开时不会触发 `onEnd`/`onFinish`。在 V1 我们接受这个限制（流到一半用户关页面，最多丢失 assistant 回复）。如要更鲁棒，可加 `AbortController` + DB 标记 partial，**V1 不做**。

### `app/chat/actions.ts`（Server Actions）

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getSession } from '@/lib/supabase/server'

const TITLE_MAX = 50

export type RenameState = { error: string | null; ok?: boolean }

export async function renameConversation(
  _prev: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const user = await getSession()
  if (!user) return { error: '未登录。' }

  const id = formData.get('id')?.toString() ?? ''
  const title = formData.get('title')?.toString().trim() ?? ''

  if (!id) return { error: '缺少会话 id。' }
  if (!title) return { error: '标题不能为空。' }
  if (title.length > TITLE_MAX) {
    return { error: `标题不能超过 ${TITLE_MAX} 字符。` }
  }

  const supabase = await createClient()
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

export async function deleteConversation(id: string): Promise<void> {
  const user = await getSession()
  if (!user) return
  const supabase = await createClient()
  await supabase.from('conversations').delete().eq('id', id)
  revalidatePath('/chat')
  revalidatePath(`/chat/${id}`)
}

export type SaveAssistantInput = {
  conversationId: string
  isNew: boolean
  question: string
  assistantText: string
}

export type SaveAssistantState = { error: string | null; ok?: boolean }

/**
 * 客户端在 useChat.status === 'ready' 时调一次，把完整 AI 回复写库，
 * 并按需为新会话生成 title、更新 updated_at。
 */
export async function saveAssistantMessage(
  input: SaveAssistantInput,
): Promise<SaveAssistantState> {
  const user = await getSession()
  if (!user) return { error: '未登录。' }
  if (!input.conversationId) return { error: '缺少会话 id。' }
  if (!input.assistantText) return { error: '回复内容为空。' }

  const supabase = await createClient()
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

要点：
- 不预校验归属 —— RLS 兜底
- `count === 0` 显式处理（UPDATE 静默 0 行 ≠ 成功）
- `deleteConversation` 走 `on delete cascade` 自动清 messages
- `saveAssistantMessage` 客户端在 `useChat.status === 'ready'` 时调一次（流完全结束后）
- 客户端记住 `isNew` 和 `question`（前者来自会话创建时，后者就是触发流的那条 user 消息）

## UI 行为

### 侧边栏（`components/chat/sidebar.tsx`）

Server Component，单次查询：

```ts
const { data: convs } = await supabase
  .from('conversations')
  .select('id, title, updated_at')
  .order('updated_at', { ascending: false })
  .limit(100)
```

空状态：「还没有会话，开始第一个问题吧」

每条 item：
- `<Link href="/chat/[id]">` 整行可点
- title `truncate` 单行省略
- 时间戳 `formatRelative`（"刚刚" / "5 分钟前" / "昨天" / 具体日期）
- hover 出现 ⋮ 菜单（重命名 / 删除）
- active 项加 `bg-accent`

### 重命名交互

行内 input 替换 title。Enter 保存（触发 `renameConversation` Server Action），Esc 取消，blur 也保存。

### 删除交互

- 第一次点删除 → Base UI `AlertDialog` 二次确认
- 确认后 `await deleteConversation(id)`
- 如果删的是**当前会话** → `router.push('/chat')` 回到空白态
- 否则留在原页面，sidebar 自动刷新

### 移动端

- 侧边栏 `position: fixed` overlay，左滑/淡入打开
- 点击会话后自动关闭（用 `<Link>` 配合 `onNavigate` 关闭状态）
- TopNav 左侧加汉堡按钮（`mobile-sidebar-trigger.tsx`）控制 open 状态

## Helpers

### `lib/chat-helpers.ts`（新增）

```ts
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

`latestUserText` 逻辑从 `app/api/chat/route.ts` 抽出来共用。`truncateTitle` 服务端 / 客户端都能用。

## 错误处理

| 场景 | 行为 |
|---|---|
| Stream 正常完成 | 客户端 `status === 'ready'` → 调 `saveAssistantMessage` → INSERT assistant + UPDATE title/updated_at |
| Stream 中断（用户关 tab / 断网） | `status` 不会变 `ready`，不触发 `saveAssistantMessage` → 丢失 assistant 回复（V1 接受） |
| embed 失败 | 跳过 RAG context，照常 stream |
| INSERT user 消息失败 | 5xx，客户端显示"发送失败，请重试" |
| saveAssistantMessage 失败 | 静默记 console.error；用户看到流式输出但 DB 无记录，刷新后这条对话消失 |
| 会话 id 非法/不属于当前用户 | 403（RLS 兜底） |
| 加载历史会话失败 | `/chat/[id]/page.tsx` try/catch → 错误页 + 返回 `/chat` 链接 |
| 流式错误 | 客户端 catch → setMessages 追加「⚠️ 生成失败，请重试」 |

## Testing

### 单元测试

`lib/chat-helpers.test.ts`（用项目现成的 `node:test`）：
- `truncateTitle`：正常截取 / 空字符串 / 超长加省略号 / 多空白合并
- `latestUserText`：取最后一条 user 文本 / 无 user 消息返回空串 / 忽略非 user 角色

### 手动 QA 清单

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

E2E 自动化 V1 不写（复杂度/收益不成正比）。

## 实施 checklist

按依赖顺序：

1. `supabase/migrations/0005_conversations.sql` → 本地 `supabase db push` 验证
2. `lib/chat-helpers.ts` + 单元测试
3. `app/api/chat/route.ts` 改造：请求体加 `conversationId`、用 `createUIMessageStream` 包装（写 `data-conversation-created` + 合并 LLM 流）
4. `app/chat/actions.ts`：`renameConversation` + `deleteConversation` + `saveAssistantMessage`
5. `components/chat/chat-interface.tsx` 改造：接 `initialMessages` + transport body 加 `conversationId` + `onData` 触发 `router.replace` + `useEffect` 监听 `status === 'ready'` 调 `saveAssistantMessage`
6. `app/chat/layout.tsx` + `app/chat/page.tsx` + `app/chat/[id]/page.tsx`
7. `components/chat/sidebar.tsx` + `sidebar-item.tsx` + `new-chat-button.tsx` + `chat-layout.tsx` + `mobile-sidebar-trigger.tsx`
8. `app/page.tsx` 改为 `redirect('/chat')`
9. `middleware.ts`：`PROTECTED_PREFIXES` 加 `'/chat'`
10. `pnpm tsc --noEmit` 一次性验证
11. 跑一遍手动 QA 清单

## 风险 & 回滚

- Migration `0005` 纯新增表，不动现有表，零数据损失
- `/api/chat` 改造是 breaking（请求体多 `conversationId`），但只有 `ChatInterface` 一个调用方
- `app/page.tsx` redirect + 移除 auth overlay：旧行为依赖 auth overlay，移除后未登录用户直接跳 `/login`
- 回滚：删 migration + 还原改动，零数据副作用（V1 阶段无生产数据）
