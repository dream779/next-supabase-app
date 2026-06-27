'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import {
  createDocument,
  type CreateDocumentState,
} from './actions'

const initialState: CreateDocumentState = { error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
    >
      {pending ? '创建中...' : '创建文档'}
    </button>
  )
}

export function NewDocumentForm() {
  const [state, formAction] = useActionState(createDocument, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state])

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 bg-white rounded-lg shadow p-6"
    >
      <h2 className="text-lg font-semibold text-gray-900">新建文档</h2>

      <div className="space-y-1">
        <label htmlFor="title" className="block text-sm text-gray-700">
          标题
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="我的知识笔记"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="content" className="block text-sm text-gray-700">
          内容
        </label>
        <textarea
          id="content"
          name="content"
          required
          rows={8}
          className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="在此粘贴或输入内容。较长的内容会自动分块。"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state.success && state.chunkCount !== undefined && (
        <p className="text-sm text-green-700">
          ✓ 已创建，共 {state.chunkCount} 个分块
        </p>
      )}

      <SubmitButton />
    </form>
  )
}
