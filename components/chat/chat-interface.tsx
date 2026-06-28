'use client'

import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { UIMessage } from 'ai'

type Props = {
  conversationId?: string | null
  initialMessages?: UIMessage[]
  isAuthenticated?: boolean
}

function LoadingBubble() {
  return (
    <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="rounded-2xl px-4 py-3 bg-gray-100/80 flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="size-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="size-2 rounded-full bg-gray-400 animate-bounce" />
      </div>
    </div>
  )
}

export function ChatInterface({
  conversationId,
  initialMessages = [],
  isAuthenticated = true,
}: Props) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const newConvIdRef = useRef<string | null>(null)
  const { messages, sendMessage, status } = useChat({
    id: conversationId ?? 'new',
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({ conversationId }),
    }),
    onData: (dataPart) => {
      if (dataPart.type === 'data-conversation-created') {
        newConvIdRef.current = (dataPart.data as { id: string }).id
      }
    },
    onError: (err) => {
      console.error('[chat] error:', err)
    },
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status !== 'ready') return
    if (conversationId) return
    const id = newConvIdRef.current
    if (!id) return
    router.replace(`/chat/${id}`)
  }, [status, conversationId, router])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const isStreaming = status === 'streaming' || status === 'submitted'
  const showLoading = status === 'submitted'

  return (
    <div className="flex flex-col h-full bg-background">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-24">
              <p className="text-base">开始向你的知识库提问吧</p>
            </div>
          )}
          {messages.map((m) => {
            const text = m.parts
              .filter((p) => p.type === 'text')
              .map((p) => p.text)
              .join('')
            return (
              <div
                key={m.id}
                className={`flex animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100/80 text-gray-900'
                  }`}
                >
                  {text}
                </div>
              </div>
            )
          })}
          {showLoading && <LoadingBubble />}
        </div>
      </div>

      <div className="border-t bg-background">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!input.trim() || !isAuthenticated || isStreaming) return
            const text = input.trim()
            sendMessage({ text })
            setInput('')
          }}
          className="max-w-3xl mx-auto px-4 py-4 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!isAuthenticated || isStreaming}
            placeholder={isAuthenticated ? '输入你的问题...' : '请先登录'}
            className="flex-1 bg-gray-100 rounded-xl px-4 py-2.5 text-[15px] focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-gray-200 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={!isAuthenticated || isStreaming || !input.trim()}
            className="bg-gray-900 text-white rounded-xl px-5 py-2.5 text-[15px] font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            发送
          </button>
        </form>
      </div>
    </div>
  )
}
