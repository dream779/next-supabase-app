import { getSession } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat/chat-interface'

export default async function NewChatPage() {
  const user = await getSession()

  return (
    <main className="flex-1 min-w-0 h-full">
      {user ? (
        <ChatInterface conversationId={null} />
      ) : (
        <p className="text-gray-600 text-center mt-12">请登录后开始聊天。</p>
      )}
    </main>
  )
}
