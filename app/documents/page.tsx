import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { deleteDocument } from './actions'
import { NewDocumentForm } from './new-document-form'

type DocumentRow = {
  id: string
  title: string
  source: string
  created_at: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function DocumentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // middleware 已保证有 user, 这里双保险
  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-600">Please sign in to view documents.</p>
      </main>
    )
  }

  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, title, source, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 space-y-4">
          <h1 className="text-xl font-bold text-red-600">Load failed</h1>
          <p className="text-sm text-gray-700 font-mono break-all">
            {error.message}
          </p>
          <Link href="/account" className="text-sm text-gray-900 underline">
            ← Back to account
          </Link>
        </div>
      </main>
    )
  }

  const list = (docs ?? []) as DocumentRow[]

  return (
    <main className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">My documents</h1>

        <NewDocumentForm />

        <section className="bg-white rounded-lg shadow p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Saved documents ({list.length})
          </h2>

          {list.length === 0 ? (
            <p className="text-sm text-gray-500">
              No documents yet. Create one above to get started.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between py-3 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">
                      {doc.title}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">
                      {doc.id} · {doc.source} · {formatDate(doc.created_at)}
                    </p>
                  </div>
                  <form action={deleteDocument}>
                    <input type="hidden" name="id" value={doc.id} />
                    <button
                      type="submit"
                      className="text-sm text-red-600 underline hover:text-red-800"
                    >
                      Delete
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
