import { notFound } from 'next/navigation'
import { getSession, createClient } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat/chat-interface'
import type { UIMessage } from 'ai'

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
      <main className="flex-1 min-w-0 h-full">
        <p className="text-red-600 mt-12 text-center">加载消息失败：{msgsErr.message}</p>
      </main>
    )
  }

  const initialMessages: UIMessage[] = ((msgs ?? []) as Message[]).map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: 'text', text: m.content }],
  }))

  return (
    <main className="flex-1 min-w-0 h-full">
      <ChatInterface
        key={id}
        conversationId={id}
        initialMessages={initialMessages}
      />
    </main>
  )
}