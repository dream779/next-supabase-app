import Link from 'next/link'
import { getSession } from '@/lib/supabase/server'
import { TopNavContent } from '@/components/top-nav-content'

export async function TopNav() {
  const user = await getSession()

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg">
          知识库
        </Link>
        <TopNavContent userEmail={user?.email ?? null} />
      </div>
    </header>
  )
}
