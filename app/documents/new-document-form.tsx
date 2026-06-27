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
      {pending ? 'Creating...' : 'Create document'}
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
      <h2 className="text-lg font-semibold text-gray-900">New document</h2>

      <div className="space-y-1">
        <label htmlFor="title" className="block text-sm text-gray-700">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="My knowledge note"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="content" className="block text-sm text-gray-700">
          Content
        </label>
        <textarea
          id="content"
          name="content"
          required
          rows={8}
          className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="Paste or type your content here. Long content is auto-chunked."
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {state.success && state.chunkCount !== undefined && (
        <p className="text-sm text-green-700">
          ✓ Created with {state.chunkCount} chunk(s)
        </p>
      )}

      <SubmitButton />
    </form>
  )
}
