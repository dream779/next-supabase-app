import { LoginForm } from './login-form'

type Props = {
  searchParams: Promise<{ error?: string }>
}

const ERROR_MESSAGES: Record<string, string> = {
  verification_failed: 'Email verification link is invalid or has expired. Please try signing up again or contact support.',
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : undefined

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Log in</h1>

        {errorMessage && (
          <p className="text-sm text-red-600">{errorMessage}</p>
        )}

        <LoginForm />
      </div>
    </main>
  )
}