import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component 内调用时 set 会抛错，忽略
            // Route Handler / Server Action 内调用时可写
          }
        },
      },
    },
  )
}

// getSession: 读本地 cookie 拿当前会话，无网络 RTT。
// JWT 由 Supabase 私钥签名 + cookie HTTP-only（前端拿不到也改不了），
// @supabase/ssr 在本地用公钥验签，只是不查"服务端是否吊销"。
// 页面渲染拿 user.email 展示 / 软重定向走这个。
// 同一棵 RSC 渲染树内多次调用合并为一次。
export const getSession = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
})

// getUser: 网络 RTT 到 Supabase auth server 验证 JWT 没被吊销。
// 仅用于安全关键路径（登入/登出 callback、改密等）。
// 页面渲染不要用，用 getSession。
export const getUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
