import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { embedQuery } from '@/lib/embedding'
import { latestUserText, truncateTitle } from '@/lib/chat-helpers'

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const ARK_CHAT_MODEL = process.env.ARK_CHAT_MODEL ?? 'doubao-seed-2-0-lite-260428'

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

// 把 UIMessage[] (parts) 压成 ARK Responses API 的 input 格式
// user role → content parts 用 input_text; assistant → output_text
// ⚠️ ARK 要求每个 input item 必须有 type: "message" + status: "completed"
//    (OpenAI 标准没要求, ARK 多了这俩字段校验)
type ArkInputItem = {
  type: 'message'
  role: 'user' | 'assistant'
  status: 'completed'
  content: Array<{ type: 'input_text' | 'output_text'; text: string }>
}

function uiMessagesToArkInput(messages: UIMessage[]): ArkInputItem[] {
  return messages.flatMap<ArkInputItem>((m) => {
    if (m.role !== 'user' && m.role !== 'assistant') return []
    const text = m.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')
    if (!text) return []
    const partType: 'input_text' | 'output_text' =
      m.role === 'user' ? 'input_text' : 'output_text'
    return [
      {
        type: 'message',
        role: m.role,
        status: 'completed',
        content: [{ type: partType, text }],
      },
    ]
  })
}

// SSE 解析: 从流里抽出 OpenAI Responses API 的 text delta
type ArkSseEvent = { type: string; delta?: string; message?: string }

async function* parseArkSse(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<ArkSseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal.aborted) return
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 事件以 \n\n 分隔, 最后一个可能不完整, 留到下轮
      let sepIdx: number
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sepIdx)
        buffer = buffer.slice(sepIdx + 2)
        const dataLines: string[] = []
        for (const line of raw.split('\n')) {
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim())
          }
        }
        if (dataLines.length === 0) continue
        const payload = dataLines.join('\n')
        if (payload === '[DONE]') return
        try {
          yield JSON.parse(payload) as ArkSseEvent
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // ignore
    }
  }
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

  // 4. 准备 ARK 请求 (不立刻 await, 在 stream.execute 里发起, 这样流建立后客户端立刻能看到 start)
  // thinking.type=disabled 跳过 reasoning 阶段, 直接出答案 (避免空气泡卡 5s+)
  // 需要恢复推理时改成 'enabled' 即可
  const arkBody = {
    model: ARK_CHAT_MODEL,
    instructions: SYSTEM_PROMPT.replace('{context}', context || '(无)'),
    input: uiMessagesToArkInput(messages),
    stream: true,
    thinking: { type: 'disabled' },
  }

  const messageId = crypto.randomUUID()
  const textPartId = 'text-0'

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      if (isNew && effectiveConvId) {
        writer.write({
          type: 'data-conversation-created',
          data: { id: effectiveConvId },
        })
      }
      writer.write({ type: 'start', messageId })
      writer.write({ type: 'text-start', id: textPartId })

      let response: Response
      try {
        response = await fetch(`${ARK_BASE_URL}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.ARK_API_KEY}`,
          },
          body: JSON.stringify(arkBody),
          signal: req.signal,
        })
      } catch (err) {
        throw new Error(
          `ARK fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '')
        throw new Error(`ARK chat ${response.status}: ${errText.slice(0, 500)}`)
      }

      let fullText = ''
      for await (const event of parseArkSse(response.body, req.signal)) {
        // text delta: response.output_text.delta (OpenAI Responses 标准事件)
        if (event.type === 'response.output_text.delta' && event.delta) {
          fullText += event.delta
          writer.write({ type: 'text-delta', id: textPartId, delta: event.delta })
        } else if (event.type === 'error') {
          throw new Error(`ARK error: ${event.message ?? 'unknown'}`)
        }
      }

      writer.write({ type: 'text-end', id: textPartId })
      writer.write({ type: 'finish' })

      // 5. 持久化 assistant message + 更新会话
      if (effectiveConvId && fullText) {
        const { error: insertErr } = await supabase.from('messages').insert({
          conversation_id: effectiveConvId,
          role: 'assistant',
          content: fullText,
        })
        if (insertErr) {
          console.error('[insert assistant message] failed:', insertErr.message)
        }

        if (isNew) {
          const title = truncateTitle(question)
          await supabase
            .from('conversations')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', effectiveConvId)
        } else {
          await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', effectiveConvId)
        }

        revalidatePath('/chat')
        revalidatePath(`/chat/${effectiveConvId}`)
      }
    },
    onError: (error) => {
      console.error('[chat] stream error:', error)
      return '生成失败，请重试。'
    },
  })

  return createUIMessageStreamResponse({ stream })
}
