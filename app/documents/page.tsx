import { createClient, getSession } from '@/lib/supabase/server'
import { Suspense } from 'react'
import Link from 'next/link'
import { NewDocumentDialog } from './new-document-dialog'
import { DocumentRow } from './document-row'

type DbDocument = {
  id: string
  title: string
  source: string
  created_at: string
}

export default async function DocumentsPage() {
  const user = await getSession()

  // middleware 已保证有 user, 这里双保险
  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-600">请登录后查看文档。</p>
      </main>
    )
  }

  return (
    <main className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">我的文档</h1>
          <NewDocumentDialog />
        </header>

        <Suspense fallback={<DocumentsListSkeleton />}>
          <DocumentsList />
        </Suspense>
      </div>
    </main>
  )
}

function DocumentsListSkeleton() {
  return (
    <section className="bg-white rounded-lg shadow p-6 space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">已保存文档</h2>
      <p className="text-sm text-gray-500">加载中…</p>
    </section>
  )
}

async function DocumentsList() {
  const supabase = await createClient()
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, title, source, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <section className="bg-white rounded-lg shadow p-6 space-y-3">
        <h2 className="text-lg font-semibold text-red-600">加载失败</h2>
        <p className="text-sm text-gray-700 font-mono break-all">
          {error.message}
        </p>
        <Link href="/account" className="text-sm text-gray-900 underline">
          ← 返回个人中心
        </Link>
      </section>
    )
  }

  const list = (docs ?? []) as DbDocument[]

  return (
    <section className="bg-white rounded-lg shadow p-6 space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">
        已保存文档（{list.length}）
      </h2>

      {list.length === 0 ? (
        <p className="text-sm text-gray-500">
          还没有文档。点击右上角“上传文档”开始添加吧。
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {list.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between py-3 gap-4"
            >
              <DocumentRow
                id={doc.id}
                title={doc.title}
                createdAt={doc.created_at}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
