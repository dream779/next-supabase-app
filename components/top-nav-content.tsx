'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; match: (path: string) => boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/chat', label: '聊天', match: (p) => p.startsWith('/chat') },
  { href: '/documents', label: '文档上传', match: (p) => p.startsWith('/documents') },
]

const AUTH_PATHS = new Set(['/login', '/signup'])

export function TopNavContent({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname()
  const isAuthPage = AUTH_PATHS.has(pathname)

  if (isAuthPage) return null

  return (
    <>
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

      <div className="flex items-center gap-2">
        {userEmail ? (
          <UserMenu email={userEmail} />
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              登录
            </Button>
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/signup" />}
            >
              注册
            </Button>
          </>
        )}
      </div>
    </>
  )
}
