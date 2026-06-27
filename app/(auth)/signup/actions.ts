'use server'

import { createClient } from '@/lib/supabase/server'
import { getURL } from '@/lib/utils'
import { sanitizeNext } from '@/lib/auth/next'

export type SignUpState = {
  ok: boolean
  error: string | null
}

export async function signUp(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string
  const next = sanitizeNext(formData.get('next'))

  if (!email || !password) {
    return { ok: false, error: '邮箱和密码不能为空。' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getURL()}auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, error: null }
}