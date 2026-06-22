import { createClient } from '@/lib/supabase/server'

type Bucket = { id: string; name: string }

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export default async function Home() {
  const supabase = await createClient()

  const [authRes, storageRes, userRes] = await Promise.allSettled([
    supabase.auth.getSession(),
    supabase.storage.listBuckets(),
    supabase.auth.getUser(),
  ])

  const auth = authRes.status === 'fulfilled'
    ? { ok: !authRes.value.error, error: authRes.value.error?.message ?? null }
    : { ok: false, error: describeError(authRes.reason) }

  const storage = storageRes.status === 'fulfilled'
    ? {
        ok: !storageRes.value.error,
        error: storageRes.value.error?.message ?? null,
        buckets: (storageRes.value.data ?? []) as Bucket[],
      }
    : { ok: false, error: describeError(storageRes.reason), buckets: [] as Bucket[] }

  const user = userRes.status === 'fulfilled' ? userRes.value.data.user : null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const maskedUrl = url ? `${url.slice(0, 30)}…` : '(unset)'

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-xl w-full bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Next.js × Vercel × Supabase
        </h1>

        {user && (
          <section className="flex items-center justify-between bg-gray-50 rounded px-4 py-3 -mt-2">
            <p className="font-mono text-sm text-gray-800">
              Logged in as <span className="font-semibold">{user.email}</span>
            </p>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-sm bg-gray-900 text-white rounded px-3 py-1.5 hover:bg-gray-800"
              >
                Sign out
              </button>
            </form>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Project
          </h2>
          <p className="font-mono text-sm text-gray-800 break-all">{maskedUrl}</p>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            API reachable
          </h2>
          <p className="text-3xl">{auth.ok && storage.ok ? '✅' : '❌'}</p>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Auth
          </h2>
          <p className="font-mono text-sm">
            {auth.ok
              ? user
                ? `session: ${user.email}`
                : 'session: null (no user logged in)'
              : `error: ${auth.error}`}
          </p>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Storage
          </h2>
          {storage.ok ? (
            storage.buckets.length > 0 ? (
              <ul className="font-mono text-sm space-y-1">
                {storage.buckets.map((b) => (
                  <li key={b.id}>{b.name}</li>
                ))}
              </ul>
            ) : (
              <p className="font-mono text-sm text-gray-500">no buckets yet</p>
            )
          ) : (
            <p className="font-mono text-sm text-red-600 break-all">
              error: {storage.error}
            </p>
          )}
        </section>

        {!user && (
          <div className="flex gap-4 pt-4 border-t border-gray-100 text-sm">
            <a href="/login" className="text-gray-900 underline">
              Log in
            </a>
            <a href="/signup" className="text-gray-900 underline">
              Sign up
            </a>
          </div>
        )}
      </div>
    </main>
  )
}