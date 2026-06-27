# Homepage UI Rewrite + shadcn/ui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `next-supabase-app`'s home page into a chat-style UI with a global shadcn/ui nav and polished login/signup pages; replace debug Supabase info with a proper user-facing layout.

**Architecture:** Merge `/chat` content into `/`. Add a global `<TopNav>` to `app/layout.tsx`. Use a `(auth)` route group for `/login` and `/signup` so they can opt out of the nav. Auth-gated routes now redirect to `/login?next=<path>` so the user lands back where they started. shadcn/ui (custom preset `b1tM5ZPOK`) supplies all primitives.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind 4 · shadcn/ui · `@supabase/ssr` · `node:test` for unit tests.

**Conventions (from project `CLAUDE.md`):**
- **No dev-server starts.** User runs `pnpm dev` themselves.
- **No git operations.** User commits at logical breakpoints.
- **One final typecheck** (`pnpm tsc --noEmit`) at the end, not per task.
- Next.js 16: `cookies()`, `headers()`, `params`, `searchParams` are all **async**. Await them.

---

## File Structure (post-plan)

```
app/
├── layout.tsx                              # MODIFIED — adds <TopNav />
├── page.tsx                                # REWRITTEN — chat + auth overlay
├── (auth)/
│   ├── layout.tsx                          # NEW — auth pages layout (AuthHeader)
│   ├── login/page.tsx                      # REWRITTEN
│   ├── login/login-form.tsx                # REWRITTEN — shadcn primitives
│   ├── login/actions.ts                    # MODIFIED — sanitizeNext, default '/'
│   ├── signup/page.tsx                     # REWRITTEN
│   ├── signup/signup-form.tsx              # REWRITTEN — shadcn primitives
│   └── signup/actions.ts                   # MODIFIED — next='/'
├── auth/
│   ├── callback/route.ts                   # MODIFIED — default next='/'
│   └── signout/route.ts                    # UNCHANGED
├── account/page.tsx                        # MODIFIED — drop inline nav
├── documents/page.tsx                      # MODIFIED — drop inline nav
├── chat/                                   # DELETED entirely
└── api/chat/route.ts                       # UNCHANGED

components/                                 # NEW directory (created by shadcn init)
├── ui/                                     # NEW — shadcn primitives
├── top-nav.tsx                             # NEW (Server)
├── user-menu.tsx                           # NEW (Client)
├── auth-header.tsx                         # NEW (Server)
├── auth-overlay.tsx                        # NEW (Client)
└── chat/chat-interface.tsx                 # MOVED from app/chat/

lib/
├── auth/next.ts                            # NEW — sanitizeNext helper
├── utils.ts                                # MODIFIED — add `cn`, keep `getURL`
└── (rest unchanged)

middleware.ts                               # MODIFIED — /chat removed from protected, ?next= support
```

---

## Task 1: Initialize shadcn/ui with custom preset

**Files:** none (CLI creates files)

- [ ] **Step 1: Run shadcn init**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
pnpm dlx shadcn@latest init --preset b1tM5ZPOK --base base --template next --pointer
```

When prompted, accept defaults. The CLI creates:
- `components.json`
- Modifies `app/globals.css` (adds CSS variables for the preset)
- Modifies `app/layout.tsx` (adds font import if the preset specifies one)
- May create `lib/utils.ts` (merge with existing — see step 2)

- [ ] **Step 2: Verify `lib/utils.ts` was not clobbered**

```bash
cat lib/utils.ts
```

Expected output includes **both** the existing `getURL()` function (a multi-line function that returns a URL string) **and** the new `cn()` helper:

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getURL() {
  // ...existing implementation preserved...
}
```

If `getURL()` is **missing**, restore it from git:

```bash
git checkout HEAD -- lib/utils.ts
# then re-add the cn() helper from the shadcn-generated file (or paste from another shadcn project)
```

- [ ] **Step 3: Verify `components.json` was created**

```bash
cat components.json
```

Expected: JSON with `$schema`, `style`, `rsc: true`, `tsx: true`, `tailwind`, `aliases` pointing to `@/components` and `@/lib/utils`.

- [ ] **Step 4: Verify globals.css was extended**

```bash
head -50 app/globals.css
```

Expected: still has `@import "tailwindcss"` at top, then a `:root` block (possibly with shadcn CSS variables added by the preset).

- [ ] **Checkpoint — review and commit yourself**

This is a logical breakpoint. Run `git diff` and commit if everything looks right.

---

## Task 2: Add shadcn components

**Files:** `components/ui/*` (created by CLI)

- [ ] **Step 1: Add the minimal component set**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
pnpm dlx shadcn@latest add button input label card form dropdown-menu avatar sonner
```

If `form` requires additional packages (it pulls `react-hook-form`, `@hookform/resolvers`, `zod`), accept the install. We will only use `<Button>`, `<Input>`, `<Label>`, `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardDescription>`, `<CardContent>`, `<DropdownMenu>`, `<Avatar>`, `<AvatarFallback>`, and `<Toaster>` (from `sonner`).

- [ ] **Step 2: Verify components landed**

```bash
ls components/ui
```

Expected files (subset, names depend on shadcn version):
`button.tsx`, `input.tsx`, `label.tsx`, `card.tsx`, `form.tsx`, `dropdown-menu.tsx`, `avatar.tsx`, `sonner.tsx`, plus their dependency files (`utils.ts` is already in `lib/`, not duplicated).

- [ ] **Step 3: Verify package.json has new deps**

```bash
grep -E '"(class-variance-authority|clsx|tailwind-merge|@radix-ui|sonner|react-hook-form|@hookform|zod)"' package.json
```

Expected: at least `clsx`, `tailwind-merge`, `class-variance-authority`, `sonner`, and several `@radix-ui/*` packages.

- [ ] **Checkpoint — review and commit yourself**

---

## Task 3: `sanitizeNext` helper + unit test

**Files:**
- Create: `lib/auth/next.ts`
- Create: `lib/auth/next.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/auth/next.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeNext } from './next'

test('relative path passes through', () => {
  assert.equal(sanitizeNext('/documents'), '/documents')
})

test('relative path with query passes through', () => {
  assert.equal(sanitizeNext('/documents?foo=bar'), '/documents?foo=bar')
})

test('protocol-relative URL is rejected', () => {
  assert.equal(sanitizeNext('//evil.com/path'), '/')
})

test('absolute http URL is rejected', () => {
  assert.equal(sanitizeNext('https://evil.com'), '/')
})

test('empty string falls back to default', () => {
  assert.equal(sanitizeNext(''), '/')
})

test('null falls back to default', () => {
  assert.equal(sanitizeNext(null), '/')
})

test('undefined falls back to default', () => {
  assert.equal(sanitizeNext(undefined), '/')
})

test('path without leading slash is rejected', () => {
  assert.equal(sanitizeNext('documents'), '/')
})

test('default is configurable', () => {
  assert.equal(sanitizeNext(null, '/account'), '/account')
})

test('javascript: scheme is rejected', () => {
  assert.equal(sanitizeNext('javascript:alert(1)'), '/')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
node --import tsx --test lib/auth/next.test.ts
```

Expected: failure with "Cannot find module './next'" or similar.

- [ ] **Step 3: Implement the helper**

Create `lib/auth/next.ts`:

```ts
const DEFAULT_NEXT = '/'

export function sanitizeNext(value: unknown, fallback: string = DEFAULT_NEXT): string {
  if (typeof value !== 'string' || value.length === 0) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//')) return fallback
  return value
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --import tsx --test lib/auth/next.test.ts
```

Expected: all 9 tests pass.

- [ ] **Checkpoint — review and commit yourself**

---

## Task 4: `AuthHeader` component (used by `(auth)/layout.tsx`)

**Files:**
- Create: `components/auth-header.tsx`

- [ ] **Step 1: Create the component**

Create `components/auth-header.tsx`:

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function AuthHeader() {
  return (
    <header className="border-b">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg">
          Knowledge Base
        </Link>
        <Button variant="ghost" asChild>
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Verify it compiles (no tsc yet, just visual check on file)**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
ls components/auth-header.tsx
```

(No run needed yet — it'll be exercised once `(auth)/layout.tsx` is in place.)

---

## Task 5: `UserMenu` component (Client)

**Files:**
- Create: `components/user-menu.tsx`

- [ ] **Step 1: Create the component**

Create `components/user-menu.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Props = {
  email: string
}

function initials(email: string): string {
  const local = email.split('@')[0] ?? ''
  return (local[0] ?? '?').toUpperCase()
}

export function UserMenu({ email }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar>
            <AvatarFallback>{initials(email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">个人中心</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action="/auth/signout" method="post" className="w-full">
            <button type="submit" className="w-full text-left">
              登出
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

---

## Task 6: `TopNav` component (Server)

**Files:**
- Create: `components/top-nav.tsx`

- [ ] **Step 1: Create the component**

Create `components/top-nav.tsx`:

```tsx
import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; match: (path: string) => boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '聊天', match: (p) => p === '/' },
  { href: '/documents', label: '文档上传', match: (p) => p.startsWith('/documents') },
]

export async function TopNav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const h = await headers()
  const pathname = h.get('x-pathname') ?? '/'

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg">
          Knowledge Base
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname)
            return (
              <Button
                key={item.href}
                asChild
                variant={active ? 'secondary' : 'ghost'}
                size="sm"
              >
                <Link href={item.href} className={cn(!active && 'text-muted-foreground')}>
                  {item.label}
                </Link>
              </Button>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <UserMenu email={user.email ?? ''} />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">登录</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">注册</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
```

**Note on `x-pathname` header:** Next.js does **not** set this automatically. It's set by middleware (see Task 14). If middleware isn't updated yet, `pathname` will always be `/` and active-link highlighting won't work — that's OK, the nav still renders.

---

## Task 7: Move `chat-interface.tsx` into `components/chat/`

**Files:**
- Create: `components/chat/chat-interface.tsx`
- Delete: `app/chat/chat-interface.tsx`

- [ ] **Step 1: Create the directory and copy the file**

```bash
mkdir -p components/chat
# Read the existing file first to know what's in it
cat app/chat/chat-interface.tsx
```

- [ ] **Step 2: Recreate it at the new path with one change**

Add `isAuthenticated` prop so the input can be disabled when the parent is rendered inside the auth overlay. If `app/chat/chat-interface.tsx` does not currently expose an `isAuthenticated` prop, add it:

Create `components/chat/chat-interface.tsx`:

```tsx
'use client'

import { useChat } from '@ai-sdk/react'
import { useEffect, useRef } from 'react'

type Props = {
  isAuthenticated?: boolean
}

export function ChatInterface({ isAuthenticated = true }: Props) {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    api: '/api/chat',
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] border rounded-lg bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-12">
            <p>开始向你的知识库提问吧</p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                m.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="border-t p-4 flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          disabled={!isAuthenticated || status === 'streaming'}
          placeholder={isAuthenticated ? '输入你的问题...' : '请先登录'}
          className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="submit"
          disabled={!isAuthenticated || status === 'streaming' || !input.trim()}
          className="bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800 disabled:opacity-50"
        >
          发送
        </button>
      </form>
    </div>
  )
}
```

> **Note:** This is the current shape of `app/chat/chat-interface.tsx`. If your file differs, port it verbatim and only add the `isAuthenticated` prop + the disabled/placeholder branches shown.

- [ ] **Step 3: Do not delete the old file yet**

Leave `app/chat/chat-interface.tsx` and `app/chat/page.tsx` in place for now. They'll be removed in Task 17 once `/page.tsx` is rewritten.

---

## Task 8: `AuthOverlay` component (Client)

**Files:**
- Create: `components/auth-overlay.tsx`

- [ ] **Step 1: Create the component**

Create `components/auth-overlay.tsx`:

```tsx
'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Props = {
  next: string
  children: ReactNode
}

export function AuthOverlay({ next, children }: Props) {
  const href = `/login?next=${encodeURIComponent(next)}`
  return (
    <div className="relative">
      {children}
      <div
        aria-hidden
        className="absolute inset-0 bg-background/70 backdrop-blur-sm rounded-lg flex items-center justify-center pointer-events-auto"
      >
        <Card className="w-full max-w-sm mx-4 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span aria-hidden>🔒</span> 登录后可发起对话
            </CardTitle>
            <CardDescription>登录后即可向你的知识库提问</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button asChild>
              <Link href={href}>立即登录</Link>
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              还没有账号?{' '}
              <Link
                href={`/signup?next=${encodeURIComponent(next)}`}
                className="underline"
              >
                注册
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

---

## Task 9: `(auth)` route group layout

**Files:**
- Create: `app/(auth)/layout.tsx`

- [ ] **Step 1: Create the layout**

Create `app/(auth)/layout.tsx`:

```tsx
import { AuthHeader } from '@/components/auth-header'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <AuthHeader />
      <main className="flex-1 flex items-center justify-center p-6">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Move `/login` and `/signup` into the route group**

Next.js route groups do **not** affect URL paths, so `app/(auth)/login/page.tsx` still serves `/login`. We will rewrite these files in the next two tasks — at that point the old `app/login/` and `app/signup/` directories should be removed to avoid duplicate routes.

---

## Task 10: Rewrite `/` (homepage = chat)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace the file contents**

Overwrite `app/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat/chat-interface'
import { AuthOverlay } from '@/components/auth-overlay'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthenticated = !!user

  return (
    <main className="min-h-[calc(100vh-3.5rem)] p-6">
      <div className="max-w-4xl mx-auto h-full">
        {isAuthenticated ? (
          <ChatInterface isAuthenticated />
        ) : (
          <AuthOverlay next="/">
            <ChatInterface isAuthenticated={false} />
          </AuthOverlay>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Sanity check the file**

```bash
head -10 /Users/liuyunlong/Desktop/MyProjects/next-supabase-app/app/page.tsx
```

Expected: imports `createClient`, `ChatInterface`, `AuthOverlay`. **No reference** to `process.env.NEXT_PUBLIC_SUPABASE_URL`, `supabase.storage`, or storage buckets — those debug sections are gone.

---

## Task 11: Update root layout to render `<TopNav />`

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add the import and the nav**

Overwrite `app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { TopNav } from '@/components/top-nav'
import './globals.css'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Knowledge Base",
  description: "向你的知识库提问",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TopNav />
        <div className="flex-1 flex flex-col">{children}</div>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Verify no `bg-background` / `text-foreground` warnings**

The shadcn preset defines these tokens in `app/globals.css` (set up in Task 1). If you see raw CSS variable warnings, double-check `globals.css` has the `--color-background` and `--color-foreground` definitions from the preset.

---

## Task 12: Rewrite `/login` (page + form + actions)

**Files:**
- Delete: `app/login/page.tsx`, `app/login/login-form.tsx`
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/login/login-form.tsx`
- Modify: `app/login/actions.ts` → move to `app/(auth)/login/actions.ts`

- [ ] **Step 1: Delete the old `/login` directory**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
rm -rf app/login
```

- [ ] **Step 2: Create the new login page**

Create `app/(auth)/login/page.tsx`:

```tsx
import Link from 'next/link'
import { LoginForm } from './login-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const ERROR_MESSAGES: Record<string, string> = {
  verification_failed:
    'Email verification link is invalid or has expired. Please try signing up again or contact support.',
}

type Props = {
  searchParams: Promise<{ error?: string; next?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : undefined
  const next = params.next ?? '/'

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>登录</CardTitle>
        <CardDescription>使用邮箱继续</CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage && (
          <p className="text-sm text-destructive mb-4">{errorMessage}</p>
        )}
        <LoginForm next={next} />
        <p className="text-sm text-muted-foreground text-center mt-4">
          还没有账号?{' '}
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="text-foreground underline"
          >
            注册
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create the login form**

Create `app/(auth)/login/login-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn, type SignInState } from './actions'

const initialState: SignInState = { error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? '登录中...' : '登录'}
    </Button>
  )
}

type Props = {
  next: string
}

export function LoginForm({ next }: Props) {
  const [state, formAction] = useActionState(signIn, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <SubmitButton />
    </form>
  )
}
```

- [ ] **Step 4: Create the actions file**

Create `app/(auth)/login/actions.ts`:

```ts
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
```

---

## Task 13: Rewrite `/signup` (page + form + actions)

**Files:**
- Delete: `app/signup/page.tsx`, `app/signup/signup-form.tsx`
- Create: `app/(auth)/signup/page.tsx`, `app/(auth)/signup/signup-form.tsx`
- Modify: `app/signup/actions.ts` → move to `app/(auth)/signup/actions.ts`

- [ ] **Step 1: Delete the old `/signup` directory**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
rm -rf app/signup
```

- [ ] **Step 2: Create the new signup page**

Create `app/(auth)/signup/page.tsx`:

```tsx
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
```

- [ ] **Step 3: Create the signup form**

Create `app/(auth)/signup/signup-form.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signUp, type SignUpState } from './actions'

const initialState: SignUpState = { ok: false, error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? '注册中...' : '注册'}
    </Button>
  )
}

type Props = {
  next: string
}

export function SignupForm({ next }: Props) {
  const [state, formAction] = useActionState(signUp, initialState)

  if (state.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          我们已经发送验证邮件到你的邮箱。点击邮件中的链接激活账号,然后你将回到首页。
        </p>
        <p className="text-sm text-muted-foreground">
          已经验证?{' '}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="text-foreground underline"
          >
            登录
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">至少 6 个字符</p>
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <SubmitButton />
    </form>
  )
}
```

- [ ] **Step 4: Create the signup actions**

Create `app/(auth)/signup/actions.ts`:

```ts
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
```

---

## Task 14: Update middleware (drop `/chat`, add `?next=`)

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Rewrite middleware**

Overwrite `middleware.ts`:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

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

  // Surface the current pathname to Server Components for active-link highlighting
  response.headers.set('x-pathname', request.nextUrl.pathname)

  const PROTECTED_PREFIXES = ['/documents', '/account']
  if (
    !user &&
    PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))
  ) {
    const next = request.nextUrl.pathname + request.nextUrl.search
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}`, request.url),
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Checkpoint — review and commit yourself**

The middleware change is the riskiest piece in this plan. Run `git diff` carefully.

---

## Task 15: Update auth callback default

**Files:**
- Modify: `app/auth/callback/route.ts`

- [ ] **Step 1: Read the current file and patch it**

```bash
cat /Users/liuyunlong/Desktop/MyProjects/next-supabase-app/app/auth/callback/route.ts
```

Replace the file with:

```ts
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeNext } from '@/lib/auth/next'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitizeNext(searchParams.get('next'))

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

(If your current file is structured differently, keep its existing structure but: read `next` from `searchParams.get('next')`, run it through `sanitizeNext`, default to `'/'`, and pass the sanitized value to `NextResponse.redirect`.)

---

## Task 16: Strip inline nav from `/documents` and `/account`

**Files:**
- Modify: `app/documents/page.tsx`
- Modify: `app/account/page.tsx`

- [ ] **Step 1: Read the current files**

```bash
cat app/documents/page.tsx
echo "---"
cat app/account/page.tsx
```

For each file:
- Remove any inline `<header>` / `<nav>` containing links to `/`, `/documents`, `/account`, `/chat`, or a sign-out button.
- Keep all other content (page heading, document list, etc.).
- The global `<TopNav>` now provides the nav.

For `app/documents/page.tsx`, also:
- Replace the outer `<main className="min-h-screen bg-gray-50 p-6"><div className="max-w-3xl mx-auto space-y-4"><header>...</header>...</div></main>` with `<main className="p-6"><div className="max-w-4xl mx-auto space-y-4">...</div></main>` (drop the header, bump `max-w-3xl` → `max-w-4xl` for visual harmony with the new layout).

For `app/account/page.tsx`, do the analogous trim.

---

## Task 17: Delete the legacy `/chat` directory

**Files:**
- Delete: `app/chat/` (entire directory)

- [ ] **Step 1: Confirm `app/page.tsx` no longer references `/chat`**

```bash
grep -rn "from '@/app/chat" /Users/liuyunlong/Desktop/MyProjects/next-supabase-app/app /Users/liuyunlong/Desktop/MyProjects/next-supabase-app/components /Users/liuyunlong/Desktop/MyProjects/next-supabase-app/lib 2>/dev/null
```

Expected: no output.

- [ ] **Step 2: Delete the directory**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
rm -rf app/chat
ls app/
```

Expected: `(auth)`, `account`, `api`, `auth`, `documents`, `favicon.ico`, `globals.css`, `layout.tsx`, `login` (should be gone — confirm), `page.tsx`, `signup` (should be gone — confirm).

> ⚠️ If `app/login/` or `app/signup/` still exist, that means the deletion in Tasks 12/13 didn't run. Stop and remove them before continuing — Next.js will error on duplicate routes.

---

## Task 18: Final typecheck

**Files:** none

- [ ] **Step 1: Run the full project typecheck**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
pnpm tsc --noEmit
```

Expected: exit code 0, no errors.

Common fixes if errors appear:
- **`Module not found: Can't resolve '@/components/ui/button'`** — `components.json` `aliases` block doesn't match. Re-check it points to `@/components` and `@/lib/utils`.
- **`cookies() is async`** — already handled in `lib/supabase/server.ts`; if you see this in a new file, ensure `await cookies()`.
- **`headers() is async`** — handled in `TopNav` (we `await headers()`).
- **`searchParams` is a Promise** — handled in `(auth)/login/page.tsx` and `(auth)/signup/page.tsx` (we `await searchParams`).
- **React 19 `useActionState` types** — make sure `actions.ts` exports the State type and `useActionState(action, initialState)` is called in the matching order.

- [ ] **Step 2: User verifies in browser**

```bash
pnpm dev
```

User checks (per CLAUDE.md, you do **not** start the dev server):

1. `/` — chat interface with auth overlay visible when logged out
2. Click "立即登录" in the overlay → lands on `/login?next=%2F`
3. Login succeeds → redirected to `/`
4. Top-right shows avatar with email initial → click → dropdown with "个人中心" + "登出"
5. Click "文档上传" in nav → `/documents` (or `/login?next=/documents` if logged out)
6. Logout from dropdown → back to `/` with auth overlay

- [ ] **Checkpoint — review and commit yourself**

This is the final logical breakpoint. Commit everything together.

---

## Done criteria

- `/` shows chat interface (no Supabase debug info anywhere)
- Unauthenticated users see the chat UI behind a translucent overlay with a "立即登录" CTA
- `<TopNav>` renders globally on `/`, `/documents`, `/account`
- `<TopNav>` is **not** rendered on `/login`, `/signup` (they use the auth layout's `<AuthHeader>` instead)
- Login / signup forms use shadcn `<Input>`, `<Label>`, `<Button>`, `<Card>` primitives
- Post-login default destination is `/` (overridable via `?next=`)
- Email verification default landing is `/` (overridable via `?next=`)
- `/chat` route no longer exists
- `pnpm tsc --noEmit` passes
- `node --import tsx --test lib/auth/next.test.ts` passes (9 tests)