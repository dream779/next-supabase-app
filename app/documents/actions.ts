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
  embedded.forEach((c, i) => {
    if (!Array.isArray(c.embedding) || c.embedding.length === 0) {
      throw new Error(`Chunk ${i} has invalid embedding`)
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
