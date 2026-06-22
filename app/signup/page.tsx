import { SignupForm } from './signup-form'

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Sign up</h1>
        <SignupForm />
      </div>
    </main>
  )
}