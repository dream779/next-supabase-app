'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { signUp, type SignUpState } from './actions'

const initialState: SignUpState = { ok: false, error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
    >
      {pending ? 'Signing up...' : 'Sign up'}
    </button>
  )
}

export function SignupForm() {
  const [state, formAction] = useActionState(signUp, initialState)

  if (state.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-800">
          We sent a verification link to your email. Click it to activate your
          account, then you'll be redirected to your account page.
        </p>
        <p className="text-sm text-gray-600">
          Already verified?{' '}
          <Link href="/login" className="text-gray-900 underline">
            Log in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm text-gray-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm text-gray-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <p className="text-xs text-gray-500">At least 6 characters.</p>
      </div>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <SubmitButton />

      <p className="text-sm text-gray-600 text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-gray-900 underline">
          Log in
        </Link>
      </p>
    </form>
  )
}