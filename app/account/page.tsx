import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=%2Faccount')
  }

  return (
    <main className="p-6">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">个人中心</h1>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            已登录邮箱
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
      </div>
    </main>
  )
}