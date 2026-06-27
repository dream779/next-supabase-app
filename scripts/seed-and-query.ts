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
 *
 * 需要的 .env.local 变量:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   DASHSCOPE_API_KEY, M1_TEST_USER_ID
 */

import './_env'
import { streamText } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAdminClient } from '../lib/supabase/admin'
import { recursiveCharSplit } from '../lib/chunking'
import { embedChunks, embedQuery } from '../lib/embedding'

const dashscope = createOpenAICompatible({
  name: 'dashscope',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY!,
})

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

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ user_id: TEST_USER_ID, title: TEST_DOCUMENT.title })
    .select()
    .single()

  if (docErr || !doc) throw new Error(`Insert document failed: ${docErr?.message}`)
  console.log(`✓ Document inserted: ${doc.id}`)

  const rawChunks = recursiveCharSplit(TEST_DOCUMENT.content)
  console.log(`✓ Chunked into ${rawChunks.length} pieces`)

  const embedded = await embedChunks(rawChunks)
  console.log(`✓ Embedded ${embedded.length} chunks, dim=${embedded[0].embedding.length}`)

  const { error: chunksErr } = await supabase.from('chunks').insert(
    embedded.map((c) => ({
      document_id: doc.id,
      content: c.content,
      embedding: JSON.stringify(c.embedding),
      chunk_index: c.chunk_index,
      token_count: c.token_count,
    }))
  )

  if (chunksErr) throw new Error(`Insert chunks failed: ${chunksErr.message}`)
  console.log(`✓ ${embedded.length} chunks inserted`)

  const queryEmbedding = await embedQuery(TEST_QUERY)
  console.log(`✓ Query embedded`)

  type Match = {
    id: string
    document_id: string
    content: string
    chunk_index: number
    similarity: number
  }

  const { data: matches, error: rpcErr } = await supabase.rpc('match_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: 3,
  })

  if (rpcErr) throw new Error(`RPC failed: ${rpcErr.message}`)
  const matchList = (matches ?? []) as Match[]
  console.log(`\n📚 Top-3 retrieved chunks:`)
  for (const m of matchList) {
    console.log(`  [sim=${m.similarity.toFixed(3)}] ${m.content.slice(0, 80)}...`)
  }

  console.log(`\n🤖 Generating answer for: "${TEST_QUERY}"\n`)
  const context = matchList
    .map((m, i) => `[${i + 1}] ${m.content}`)
    .join('\n\n')

  const result = streamText({
    model: dashscope.chatModel('qwen-plus'),
    system: `基于以下参考文档回答问题。回答简洁,直接引用相关部分。\n\n参考文档:\n${context}`,
    prompt: TEST_QUERY,
  })

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk)
  }
  process.stdout.write('\n')

  await supabase.from('documents').delete().eq('id', doc.id)
  console.log(`\n✓ Cleanup: deleted test document ${doc.id}`)
}

main().catch((err) => {
  console.error('\n❌ M1 verification failed:', err)
  process.exit(1)
})