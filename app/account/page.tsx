import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Account</h1>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Signed in as
          </h2>
          <p className="font-mono text-sm text-gray-800 break-all">
            {user.email}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            User ID
          </h2>
          <p className="font-mono text-xs text-gray-500 break-all">
            {user.id}
          </p>
        </section>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <Link href="/" className="text-sm text-gray-600 underline">
            Home
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}