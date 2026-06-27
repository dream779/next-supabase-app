import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; match: (path: string) => boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '聊天', match: (p) => p === '/' },
  { href: '/documents', label: '文档上传', match: (p) => p.startsWith('/documents') },
]

const AUTH_PATHS = new Set(['/login', '/signup'])

export async function TopNav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const h = await headers()
  const pathname = h.get('x-pathname') ?? '/'
  const isAuthPage = AUTH_PATHS.has(pathname)

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg">
          Knowledge Base
        </Link>

        {!isAuthPage && (
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname)
              return (
                <Button
                  key={item.href}
                  render={<Link href={item.href} />}
                  variant={active ? 'secondary' : 'ghost'}
                  size="sm"
                  nativeButton={false}
                  className={cn(!active && 'text-muted-foreground')}
                >
                  {item.label}
                </Button>
              )
            })}
          </nav>
        )}

        {!isAuthPage && (
          <div className="flex items-center gap-2">
            {user ? (
              <UserMenu email={user.email ?? ''} />
            ) : (
              <>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login" />}>
                  登录
                </Button>
                <Button size="sm" nativeButton={false} render={<Link href="/signup" />}>
                  注册
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
