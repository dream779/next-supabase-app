import { getSession, createClient } from '@/lib/supabase/server'
import { SidebarItem } from './sidebar-item'
import { NewChatButton } from './new-chat-button'

type Conversation = {
  id: string
  title: string | null
  updated_at: string
}

function formatRelative(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return '昨天'
  if (diffDay < 7) return `${diffDay} 天前`
  return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
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
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-gray-500">
            还没有会话，开始第一个问题吧
          </div>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <SidebarItem
                  id={c.id}
                  title={c.title ?? '新会话'}
                  formattedTime={formatRelative(c.updated_at)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
