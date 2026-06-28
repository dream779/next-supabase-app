'use client'

import { useEffect, useState } from 'react'
import { SidebarItem } from './sidebar-item'
import { formatRelative } from '@/lib/chat-helpers'

type Conversation = {
  id: string
  title: string | null
  updated_at: string
}

type Props = {
  initialConversations: Conversation[]
}

export function ConversationList({ initialConversations }: Props) {
  // 客户端本地新增，服务端还没追上时先用这个；服务端一旦带上就以服务端为准
  const [localAdditions, setLocalAdditions] = useState<Conversation[]>([])

  const serverIds = new Set(initialConversations.map((c) => c.id))
  const localOnly = localAdditions.filter((c) => !serverIds.has(c.id))
  const conversations = [...localOnly, ...initialConversations]

  useEffect(() => {
    function handleCreated(e: Event) {
      const ce = e as CustomEvent<Conversation>
      setLocalAdditions((prev) =>
        prev.some((c) => c.id === ce.detail.id) ? prev : [ce.detail, ...prev],
      )
    }
    function handleDeleted(e: Event) {
      const ce = e as CustomEvent<{ id: string }>
      setLocalAdditions((prev) => prev.filter((c) => c.id !== ce.detail.id))
    }
    window.addEventListener('conversation-created', handleCreated as EventListener)
    window.addEventListener('conversation-deleted', handleDeleted as EventListener)
    return () => {
      window.removeEventListener('conversation-created', handleCreated as EventListener)
      window.removeEventListener('conversation-deleted', handleDeleted as EventListener)
    }
  }, [])

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-gray-500">
        还没有会话，开始第一个问题吧
      </div>
    )
  }

  return (
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
  )
}
