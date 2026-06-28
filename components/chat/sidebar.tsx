import { getSession, createClient } from '@/lib/supabase/server'
import { NewChatButton } from './new-chat-button'
import { ConversationList } from './conversation-list'

type Conversation = {
  id: string
  title: string | null
  updated_at: string
}

export async function Sidebar() {
  const user = await getSession()

  let conversations: Conversation[] = []
  if (user) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100)
    conversations = (data ?? []) as Conversation[]
  }

  return (
    <aside className="flex flex-col h-full w-full md:w-64 border-r bg-gray-50/50">
      <div className="p-3">
        <NewChatButton />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <ConversationList initialConversations={conversations} />
      </div>
    </aside>
  )
}
