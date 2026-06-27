'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signUp, type SignUpState } from './actions'

const initialState: SignUpState = { ok: false, error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? '注册中...' : '注册'}
    </Button>
  )
}

type Props = {
  next: string
}

export function SignupForm({ next }: Props) {
  const [state, formAction] = useActionState(signUp, initialState)

  if (state.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          我们已经发送验证邮件到你的邮箱。点击邮件中的链接激活账号,然后你将回到首页。
        </p>
        <p className="text-sm text-muted-foreground">
          已经验证?{' '}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="text-foreground underline"
          >
            登录
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">至少 6 个字符</p>
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <SubmitButton />
    </form>
  )
}