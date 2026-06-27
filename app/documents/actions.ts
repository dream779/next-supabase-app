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
  if (!user) return { error: '未登录。' }

  const title = formData.get('title')?.toString().trim() ?? ''
  const content = formData.get('content')?.toString().trim() ?? ''

  if (!title) return { error: '标题不能为空。' }
  if (!content) return { error: '内容不能为空。' }

  // 1. Insert document (RLS 用 auth.uid() 链校验 user_id)
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert({ user_id: user.id, title, source: 'manual' })
    .select()
    .single()
  if (docErr || !doc) {
    return { error: `创建文档失败：${docErr?.message ?? '未知错误'}` }
  }

  // 2. Chunk
  const rawChunks = recursiveCharSplit(content)
  if (rawChunks.length === 0) {
    await supabase.from('documents').delete().eq('id', doc.id)
    return { error: '内容未能切分为任何分块。' }
  }

  // 3. Embed (内置 3 次重试)
  let embedded
  try {
    embedded = await embedChunks(rawChunks)
  } catch (err) {
    await supabase.from('documents').delete().eq('id', doc.id)
    return {
      error: `生成向量失败：${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // 4. Insert chunks (RLS 通过 document_id → documents.user_id 链校验)
  embedded.forEach((c, i) => {
    if (!Array.isArray(c.embedding) || c.embedding.length === 0) {
      throw new Error(`分块 ${i} 的向量无效`)
    }
  })
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
    return { error: `插入分块失败：${chunksErr.message}` }
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
