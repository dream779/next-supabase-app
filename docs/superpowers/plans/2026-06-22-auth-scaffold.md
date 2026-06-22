# Auth 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有最小骨架上加 Supabase 邮箱+密码 Auth，注册 → 邮箱验证 → 登录 → 受保护页 → 登出端到端跑通

**Architecture:** Server Actions 提交表单 + `middleware.ts` 每个请求刷新 session + Route Handler 处理 callback / 登出 + 受保护页 middleware 拦截未登录用户

**Tech Stack:** Next.js 16.2.9 (App Router) + React 19 + `@supabase/ssr` 0.12 + `@supabase/supabase-js` 2.108 + TypeScript + Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-06-22-auth-design.md`

**用户偏好：**
- 包管理器 pnpm；类型检查用 `pnpm tsc --noEmit`
- Git 操作（init / commit / push）由用户手动执行，**不自动跑**
- Dev 服务（`pnpm dev`）由用户自己启动验证，**不自动启动**

---

## 文件总览

| 文件 | 操作 | 职责 |
|---|---|---|
| `lib/utils.ts` | 新增 | `getURL()` helper，邮件 callback 链接用 |
| `middleware.ts` | 新增（项目根） | 每请求刷新 session + 拦截 `/account` 未登录 |
| `app/auth/callback/route.ts` | 新增 | Route Handler GET：邮箱验证 code → session → redirect(next) |
| `app/auth/signout/route.ts` | 新增 | Route Handler POST：signOut → 清 cookie → redirect('/') |
| `app/signup/actions.ts` | 新增 | `'use server'`：signUp action |
| `app/signup/signup-form.tsx` | 新增 | `'use client'`：注册表单 + "请查收邮件"切换 |
| `app/signup/page.tsx` | 新增 | Server Component：渲染 SignupForm |
| `app/login/actions.ts` | 新增 | `'use server'`：signIn action |
| `app/login/login-form.tsx` | 新增 | `'use client'`：登录表单 + 错误展示 |
| `app/login/page.tsx` | 新增 | Server Component：读 `?error=` 渲染顶部提示 + LoginForm |
| `app/account/page.tsx` | 新增 | Server Component：受保护页，user.email + 登出表单 |
| `app/page.tsx` | 修改 | 已登录时顶部加 `Logged in as xxx · Sign out` |
| `.env.local.example` | 修改 | 加 `NEXT_PUBLIC_SITE_URL` |
| `README.md` | 修改 | 加 Auth 流程说明 + 新 env var 文档 |

**不动的文件：** `lib/supabase/{client,server}.ts`、`app/layout.tsx`、`app/globals.css`、`package.json`、其他所有文件。

---

## Task 1: getURL helper

**Files:**
- Create: `lib/utils.ts`

- [ ] **Step 1: 读 Next.js 关于 env var 的相关文档（参考）**

仅当不确定时读。本 task 用的是基础 `process.env`，不需要读。

- [ ] **Step 2: 创建 `lib/utils.ts`**

```ts
export function getURL() {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    'http://localhost:3000'
  url = url.startsWith('http') ? url : `https://${url}`
  url = url.endsWith('/') ? url : `${url}/`
  return url
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: 用户执行 git commit**

```bash
git add lib/utils.ts
git commit -m "feat(auth): add getURL helper for callback links"
```

---

## Task 2: middleware.ts

**Files:**
- Create: `middleware.ts`（项目根）

- [ ] **Step 1: 读 Next.js middleware 相关文档**

Read: `node_modules/next/dist/docs/middleware.md`（如果存在；不存在则跳过本步）
关键点确认：Next.js 16 middleware 仍然是 `(request: NextRequest) => NextResponse` 签名。

- [ ] **Step 2: 创建 `middleware.ts`**

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/account')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**关键点：**
- 同时写 `request.cookies` 和 `response.cookies`（Supabase 官方要求）
- `getUser()` 副作用是刷新 cookie
- `matcher` 排除静态资源
- 只在 `/account` 做 redirect，其他路径都放行

- [ ] **Step 3: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: 用户执行 git commit**

```bash
git add middleware.ts
git commit -m "feat(auth): add middleware for session refresh and /account guard"
```

---

## Task 3: Auth callback Route Handler

**Files:**
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: 创建文件**

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/account'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=verification_failed', origin))
}
```

**关键点：**
- `exchangeCodeForSession` 内部会写 session cookie
- 失败或无 code → 跳回 `/login?error=verification_failed`
- `origin` 取自请求 URL，dev 和 prod 都自动正确

- [ ] **Step 2: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 用户执行 git commit**

```bash
git add app/auth/callback/route.ts
git commit -m "feat(auth): add email verification callback handler"
```

---

## Task 4: Sign out Route Handler

**Files:**
- Create: `app/auth/signout/route.ts`

- [ ] **Step 1: 创建文件**

```ts
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
```

**关键点：**
- POST 而非 GET，避免被 prefetch / 链接预览意外触发
- `status: 303` 强制浏览器用 GET 跟随重定向（POST → 303 → GET 是正确流程）
- 失败不阻断 UX，dev 环境 console 打印

- [ ] **Step 2: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 用户执行 git commit**

```bash
git add app/auth/signout/route.ts
git commit -m "feat(auth): add signout route handler"
```

---

## Task 5: Sign up 流程（page + form + actions）

**Files:**
- Create: `app/signup/actions.ts`
- Create: `app/signup/signup-form.tsx`
- Create: `app/signup/page.tsx`

- [ ] **Step 1: 读 Next.js Server Actions / useActionState 文档**

Read: `node_modules/next/dist/docs/server-and-client-components.md`（如不存在则跳过）
关键点确认：Server Action 签名 `(_prev, formData) => Promise<state>`；客户端用 `useActionState(action, initialState)`。

- [ ] **Step 2: 创建 `app/signup/actions.ts`**

```ts
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
```

- [ ] **Step 3: 创建 `app/signup/signup-form.tsx`**

```tsx
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
```

- [ ] **Step 4: 创建 `app/signup/page.tsx`**

```tsx
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
```

- [ ] **Step 5: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: 用户执行 git commit**

```bash
git add app/signup/
git commit -m "feat(auth): add signup flow with email verification"
```

---

## Task 6: Sign in 流程（page + form + actions）

**Files:**
- Create: `app/login/actions.ts`
- Create: `app/login/login-form.tsx`
- Create: `app/login/page.tsx`

- [ ] **Step 1: 创建 `app/login/actions.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type SignInState = {
  error: string | null
}

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = (formData.get('email') as string)?.trim()
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  redirect('/account')
}
```

- [ ] **Step 2: 创建 `app/login/login-form.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { signIn, type SignInState } from './actions'

const initialState: SignInState = { error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
    >
      {pending ? 'Signing in...' : 'Sign in'}
    </button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, initialState)

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
          autoComplete="current-password"
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <SubmitButton />

      <p className="text-sm text-gray-600 text-center">
        No account?{' '}
        <Link href="/signup" className="text-gray-900 underline">
          Sign up
        </Link>
      </p>
    </form>
  )
}
```

- [ ] **Step 3: 创建 `app/login/page.tsx`**

```tsx
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
```

**关键点：**
- Next.js 16 `searchParams` 是 Promise，必须 `await`
- `?error=verification_failed` 是 callback handler 失败时 redirect 来的（见 Task 3）
- 错误码表用 `Record<string, string>`，未知 code 不显示

- [ ] **Step 4: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: 用户执行 git commit**

```bash
git add app/login/
git commit -m "feat(auth): add login flow with error handling"
```

---

## Task 7: /account 受保护页

**Files:**
- Create: `app/account/page.tsx`

- [ ] **Step 1: 创建 `app/account/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Account</h1>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Signed in as
          </h2>
          <p className="font-mono text-sm text-gray-800 break-all">
            {user.email}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            User ID
          </h2>
          <p className="font-mono text-xs text-gray-500 break-all">
            {user.id}
          </p>
        </section>

        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <Link href="/" className="text-sm text-gray-600 underline">
            Home
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
```

**关键点：**
- 中间件先拦截；这里是兜底，正常不会触发 redirect
- 登出走 `<form method="post">` → `/auth/signout`（见 Task 4）
- 不引入 `'use client'`：服务端读 user，HTML 直接渲染表单

- [ ] **Step 2: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 用户执行 git commit**

```bash
git add app/account/page.tsx
git commit -m "feat(auth): add protected account page"
```

---

## Task 8: 首页已登录态

**Files:**
- Modify: `app/page.tsx`（最小改动：顶部加登录状态行）

- [ ] **Step 1: 读现有 `app/page.tsx`**

Read: `app/page.tsx`
确认：当前文件已经有 `import { createClient } from '@/lib/supabase/server'` 和 Promise.allSettled 模式。

- [ ] **Step 2: 修改 `app/page.tsx`**

把现有文件整体替换为：

```tsx
import { createClient } from '@/lib/supabase/server'

type Bucket = { id: string; name: string }

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export default async function Home() {
  const supabase = await createClient()

  const [authRes, storageRes, userRes] = await Promise.allSettled([
    supabase.auth.getSession(),
    supabase.storage.listBuckets(),
    supabase.auth.getUser(),
  ])

  const auth = authRes.status === 'fulfilled'
    ? { ok: !authRes.value.error, error: authRes.value.error?.message ?? null }
    : { ok: false, error: describeError(authRes.reason) }

  const storage = storageRes.status === 'fulfilled'
    ? {
        ok: !storageRes.value.error,
        error: storageRes.value.error?.message ?? null,
        buckets: (storageRes.value.data ?? []) as Bucket[],
      }
    : { ok: false, error: describeError(storageRes.reason), buckets: [] as Bucket[] }

  const user = userRes.status === 'fulfilled' ? userRes.value.data.user : null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const maskedUrl = url ? `${url.slice(0, 30)}…` : '(unset)'

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-xl w-full bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Next.js × Vercel × Supabase
        </h1>

        {user && (
          <section className="flex items-center justify-between bg-gray-50 rounded px-4 py-3 -mt-2">
            <p className="font-mono text-sm text-gray-800">
              Logged in as <span className="font-semibold">{user.email}</span>
            </p>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-sm bg-gray-900 text-white rounded px-3 py-1.5 hover:bg-gray-800"
              >
                Sign out
              </button>
            </form>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Project
          </h2>
          <p className="font-mono text-sm text-gray-800 break-all">{maskedUrl}</p>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            API reachable
          </h2>
          <p className="text-3xl">{auth.ok && storage.ok ? '✅' : '❌'}</p>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Auth
          </h2>
          <p className="font-mono text-sm">
            {auth.ok
              ? user
                ? `session: ${user.email}`
                : 'session: null (no user logged in)'
              : `error: ${auth.error}`}
          </p>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Storage
          </h2>
          {storage.ok ? (
            storage.buckets.length > 0 ? (
              <ul className="font-mono text-sm space-y-1">
                {storage.buckets.map((b) => (
                  <li key={b.id}>{b.name}</li>
                ))}
              </ul>
            ) : (
              <p className="font-mono text-sm text-gray-500">no buckets yet</p>
            )
          ) : (
            <p className="font-mono text-sm text-red-600 break-all">
              error: {storage.error}
            </p>
          )}
        </section>

        {!user && (
          <div className="flex gap-4 pt-4 border-t border-gray-100 text-sm">
            <a href="/login" className="text-gray-900 underline">
              Log in
            </a>
            <a href="/signup" className="text-gray-900 underline">
              Sign up
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
```

**关键点：**
- 新增第三个 `Promise.allSettled` 调用 `getUser()`
- 顶部 `user &&` 条件渲染登录态行（含 Sign out 按钮）
- `Auth` 卡片文本根据 user 切换：登录后显示 email，否则保持原样
- 底部 `!user &&` 条件渲染 Log in / Sign up 链接

- [ ] **Step 3: 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: 用户执行 git commit**

```bash
git add app/page.tsx
git commit -m "feat(auth): show logged-in state on home page"
```

---

## Task 9: 更新 .env.local.example 和 README

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md`

- [ ] **Step 1: 读现有 `.env.local.example`**

Read: `.env.local.example`

- [ ] **Step 2: 更新 `.env.local.example`**

替换整个文件为：

```
# Vercel 的 Supabase 集成会在 link 后自动注入以下变量
# 本地通过 `npx vercel env pull .env.local` 拉取真实值
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# 邮件验证链接用：本可不设（兜底 http://localhost:3000）
# Vercel 生产环境应设为生产域名，如 https://your-app.vercel.app
NEXT_PUBLIC_SITE_URL=
```

- [ ] **Step 3: 读现有 `README.md`**

Read: `README.md`

- [ ] **Step 4: 在 README 加 Auth 段落**

在「## 扩展路线」前面插入新的 `## 邮箱登录 Auth` 段：

```markdown
## 邮箱登录 Auth

注册、登录、邮箱验证、登出、受保护页都已实现：

- `/signup` — 注册（提交后查收邮件）
- `/login` — 登录
- `/account` — 受保护页（未登录会重定向到 `/login`）
- Supabase 发验证邮件 → 点链接 → 跳到 `/account`

### 本地验证邮箱流程

1. 注册时邮箱必须能收到 Supabase 发出的邮件
2. 本地开发时 Supabase 默认的邮件模板可能进垃圾邮件，或被 SMTP 限速（4 次/小时）
3. 生产前可在 Supabase Dashboard → Authentication → Providers → Email 配置自定义 SMTP

### 新增的环境变量

| 变量名 | 用途 |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | 邮件验证链接的域名。本地可不设（兜底 `http://localhost:3000`）；Vercel 应设为生产域名 |
```

在「环境变量」表中也加一行 `NEXT_PUBLIC_SITE_URL`。

- [ ] **Step 5: 类型检查（README 是 md 不参与 typecheck，跳过；如改了 .env.local.example 也不影响 TS）**

- [ ] **Step 6: 用户执行 git commit**

```bash
git add .env.local.example README.md
git commit -m "docs(auth): document auth flow and new env var"
```

---

## 全部完成后：手动 e2e 验证

按以下路径跑通（用户自己执行 `pnpm dev` 后在浏览器操作）：

1. **未登录状态访问首页** → 看到 `Auth: session: null` + 底部有 Log in / Sign up 链接
2. **访问 `/signup`** → 填邮箱密码 → 提交 → 看到「We sent a verification link to your email」
3. **查收邮件** → Supabase 发的邮件里点验证链接
4. **应自动跳到 `/account`** → 看到邮箱 + User ID + Sign out 按钮
5. **回到首页** → 顶部有 `Logged in as xxx · Sign out`，`Auth` 行显示 email
6. **点 Sign out** → 回首页，未登录态
7. **未登录访问 `/account`** → 中间件重定向到 `/login`
8. **错误路径**：把 callback URL 改坏（比如手动访问 `/auth/callback?code=invalid`）→ 跳 `/login?error=verification_failed` → 顶部红字提示

如果 Supabase Dashboard → Authentication → Email Provider 没配真实 SMTP，本地可能收不到邮件。两种处理：
- 用真实邮箱（gmail / qq 等）注册，多数情况能收到
- 临时在 Supabase Dashboard 关闭 "Confirm email" 开关，绕过验证步骤直接登录

---

## 部署后额外步骤（Vercel）

1. 在 Vercel Dashboard → Project → Settings → Environment Variables 加 `NEXT_PUBLIC_SITE_URL`，值为生产域名（如 `https://next-supabase-app-xxx.vercel.app`），勾选 Production + Preview + Development
2. 在 Supabase Dashboard → Authentication → URL Configuration 加 Site URL 和 Redirect URLs：
   - Site URL: 生产域名
   - Redirect URLs: `https://<your-domain>/auth/callback`
3. push 代码到 GitHub → Vercel 自动部署

---

## 类型一致性检查

| 名称 | 定义位置 | 使用位置 |
|---|---|---|
| `SignUpState` | `app/signup/actions.ts` | `app/signup/signup-form.tsx` import |
| `signUp` | `app/signup/actions.ts` | `app/signup/signup-form.tsx` import (action) |
| `SignInState` | `app/login/actions.ts` | `app/login/login-form.tsx` import |
| `signIn` | `app/login/actions.ts` | `app/login/login-form.tsx` import (action) |
| `getURL()` | `lib/utils.ts` | `app/signup/actions.ts` import |
| `createClient()` | `lib/supabase/server.ts` | actions.ts, app/account/page.tsx, app/page.tsx, middleware.ts |
| `/auth/signout` | `app/auth/signout/route.ts` | app/account/page.tsx, app/page.tsx (form action) |
| `/auth/callback` | `app/auth/callback/route.ts` | signup email link |