import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { embedQuery } from '@/lib/embedding'
import { latestUserText, truncateTitle } from '@/lib/chat-helpers'

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
    abortSignal: req.signal,
  })

  // 5. 包装流：先发 data-conversation-created 块 → 合并 LLM 流 → 流结束持久化 assistant message
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      if (isNew && effectiveConvId) {
        writer.write({
          type: 'data-conversation-created',
          data: { id: effectiveConvId },
        })
      }
      writer.merge(result.toUIMessageStream())

      const fullText = await result.text

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
    onError: () => '生成失败，请重试。',
  })

  return createUIMessageStreamResponse({ stream })
}
