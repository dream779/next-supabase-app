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
  // RLS 兜底: 没有效 JWT 时 match_chunks 拿不到任何行
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
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}