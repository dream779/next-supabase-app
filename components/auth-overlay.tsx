'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Props = {
  next: string
  children: ReactNode
}

export function AuthOverlay({ next, children }: Props) {
  const href = `/login?next=${encodeURIComponent(next)}`
  return (
    <div className="relative">
      {children}
      <div
        aria-hidden
        className="absolute inset-0 bg-background/70 backdrop-blur-sm rounded-lg flex items-center justify-center"
      >
        <Card className="w-full max-w-sm mx-4 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span aria-hidden>🔒</span> 登录后可发起对话
            </CardTitle>
            <CardDescription>登录后即可向你的知识库提问</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button nativeButton={false} render={<Link href={href} />}>立即登录</Button>
            <p className="text-sm text-muted-foreground text-center">
              还没有账号?{' '}
              <Link
                href={`/signup?next=${encodeURIComponent(next)}`}
                className="underline"
              >
                注册
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}