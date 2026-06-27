import Link from 'next/link'
import { LoginForm } from './login-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const ERROR_MESSAGES: Record<string, string> = {
  verification_failed:
    '邮箱验证链接无效或已过期。请重新注册或联系客服。',
}

type Props = {
  searchParams: Promise<{ error?: string; next?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : undefined
  const next = params.next ?? '/'

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>登录</CardTitle>
        <CardDescription>使用邮箱继续</CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage && (
          <p className="text-sm text-destructive mb-4">{errorMessage}</p>
        )}
        <LoginForm next={next} />
        <p className="text-sm text-muted-foreground text-center mt-4">
          还没有账号?{' '}
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="text-foreground underline"
          >
            注册
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}