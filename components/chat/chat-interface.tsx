'use client'

import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'
import { useEffect, useRef, useState } from 'react'

type Props = {
  isAuthenticated?: boolean
}

export function ChatInterface({ isAuthenticated = true }: Props) {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const isStreaming = status === 'streaming' || status === 'submitted'

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] border rounded-lg bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-12">
            <p>开始向你的知识库提问吧</p>
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
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  m.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100'
                }`}
              >
                {text}
              </div>
            </div>
          )
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!input.trim() || !isAuthenticated || isStreaming) return
          sendMessage({ text: input })
          setInput('')
        }}
        className="border-t p-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!isAuthenticated || isStreaming}
          placeholder={isAuthenticated ? '输入你的问题...' : '请先登录'}
          className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="submit"
          disabled={!isAuthenticated || isStreaming || !input.trim()}
          className="bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
        >
          发送
        </button>
      </form>
    </div>
  )
}