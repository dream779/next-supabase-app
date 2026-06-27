'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { sanitizeNext } from '@/lib/auth/next'

export type SignInState = {
  error: string | null
}

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const next = sanitizeNext(formData.get('next'))

  if (!email || !password) {
    return { error: '邮箱和密码不能为空。' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  redirect(next)
}