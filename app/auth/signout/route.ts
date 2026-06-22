import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error && process.env.NODE_ENV !== 'production') {
    console.error('signOut error:', error.message)
  }

  const { origin } = new URL(request.url)
  return NextResponse.redirect(new URL('/', origin), { status: 303 })
}