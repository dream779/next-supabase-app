'use server'

import { createClient } from '@/lib/supabase/server'
import { getURL } from '@/lib/utils'

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

  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getURL()}auth/callback?next=/account`,
    },
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, error: null }
}