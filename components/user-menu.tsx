'use client'

import Link from 'next/link'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Props = {
  email: string
}

function initials(email: string): string {
  const local = email.split('@')[0] ?? ''
  return (local[0] ?? '?').toUpperCase()
}

export function UserMenu({ email }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="用户菜单"
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <Avatar>
          <AvatarFallback>{initials(email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/account" />}>
            个人中心
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={
              <form action="/auth/signout" method="post" className="w-full" />
            }
          >
            <button type="submit" className="w-full text-left">
              登出
            </button>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}