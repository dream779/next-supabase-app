import Link from 'next/link'
import { SignupForm } from './signup-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Props = {
  searchParams: Promise<{ next?: string }>
}

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams
  const next = params.next ?? '/'

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>注册</CardTitle>
        <CardDescription>创建一个新账号</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm next={next} />
        <p className="text-sm text-muted-foreground text-center mt-4">
          已有账号?{' '}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="text-foreground underline"
          >
            登录
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}