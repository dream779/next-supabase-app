'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

  const { data, error, count } = await supabase
    .from('conversations')
    .update({ title }, { count: 'exact' })
    .eq('id', id)
    .select('id')

  if (error) return { error: `重命名失败：${error.message}` }
  if (count === 0 || !data || data.length === 0) {
    return { error: '会话不存在或无权访问。' }
  }

  revalidatePath('/chat')
  revalidatePath(`/chat/${id}`)
  return { error: null, ok: true }
}

// ---------- delete ----------

export async function deleteConversation(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error: deleteErr } = await supabase.from('conversations').delete().eq('id', id)
  if (deleteErr) {
    console.error('[deleteConversation] failed:', deleteErr.message)
  }

  revalidatePath('/chat')
  revalidatePath(`/chat/${id}`)
  redirect('/chat')
}