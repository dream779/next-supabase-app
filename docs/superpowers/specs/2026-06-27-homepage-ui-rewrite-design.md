# Homepage UI Rewrite + shadcn/ui Migration Design

**Date:** 2026-06-27
**Status:** Draft (pending user approval)
**Project:** next-supabase-app

## Goal

Replace the debug-style home page and bare-form auth pages with a proper
SaaS-style UI driven by shadcn/ui. After this change:

- `/` is the chat page (with auth gate overlay for unauthenticated users)
- A global `<TopNav>` lives in `app/layout.tsx`
- Login / signup pages are visually polished with shadcn primitives
- No Supabase-internal debug info (project URL, auth state, storage buckets)
  leaks into the user-facing UI
- Successful login / email verification lands on `/` (the chat page), not
  the legacy `/account` default

## Decisions (locked)

| Topic | Decision |
|---|---|
| Approach | **A: Full refactor** — global layout, shadcn migration, `/chat` merged into `/` |
| `/chat` route | **Delete**, content moves into `/` |
| Auth overlay style | **Mask + center CTA card** (previewed & approved) |
| Authenticated user display | **Avatar + DropdownMenu** (email + Account + Sign out) |
| `/account` route | **Keep**, used as the "Account settings" destination from the avatar menu |
| Post-login default | `/` (was `/account`); `?next=` query preserved if present |
| shadcn scope | **Minimal set**: `button`, `input`, `label`, `card`, `form`, `dropdown-menu`, `avatar`, `sonner` |
| shadcn init | **Custom preset** `b1tM5ZPOK` with `--base base --template next --pointer` |

## Architecture

### Route map

| Route | Type | Change |
|---|---|---|
| `/` | Server | Rewrite → chat body + auth overlay |
| `/chat` | — | **Delete entire directory** |
| `/documents` | Server | Drop inline nav; rely on global `<TopNav>` |
| `/account` | Server | Drop inline nav; rely on global `<TopNav>` |
| `/login` | Server + Client | Rewrite using shadcn Form |
| `/signup` | Server + Client | Rewrite using shadcn Form |
| `/auth/callback` | Route Handler | Default `next` query from `/account` → `/` |
| `/auth/signout` | Route Handler | Unchanged |
| `/api/chat` | Route Handler | Unchanged |

### Auth redirect rules

1. **Login success** (`signIn` action):
   - If `formData.get('next')` is a safe relative path → `redirect(next)`
   - Else `redirect('/')`
2. **Signup success** (email verification required):
   - Verification email uses `emailRedirectTo = ${getURL()}auth/callback?next=/`
   - `/auth/callback/route.ts` defaults `next` to `/` when missing/invalid
3. **Middleware gate** (`middleware.ts`):
   - `PROTECTED_PREFIXES = ['/documents', '/account']` (`/chat` removed)
   - Unauthenticated request → `redirect('/login?next=' + encodeURIComponent(pathname))`

### Layout structure

```
app/
├── layout.tsx                 # RootLayout → renders <TopNav /> + children
├── (auth)/
│   ├── layout.tsx             # Auth layout → <AuthHeader /> + children (no TopNav)
│   ├── login/page.tsx
│   ├── login/login-form.tsx
│   ├── login/actions.ts
│   ├── signup/page.tsx
│   ├── signup/signup-form.tsx
│   └── signup/actions.ts
├── page.tsx                   # Chat page (was app/chat/page.tsx)
├── documents/
│   ├── page.tsx               # Drop inline nav
│   ├── actions.ts             # Unchanged
│   └── new-document-form.tsx  # Unchanged
├── account/
│   └── page.tsx               # Drop inline nav
├── auth/
│   ├── callback/route.ts      # Default next → '/'
│   └── signout/route.ts       # Unchanged
└── api/chat/route.ts          # Unchanged
```

## shadcn/ui installation

### Step 1 — init with custom preset

```bash
pnpm dlx shadcn@latest init \
  --preset b1tM5ZPOK \
  --base base \
  --template next \
  --pointer
```

This creates:

- `components.json`
- `lib/utils.ts` (merges with the existing one — keep `getURL`, add `cn`)
- `components/ui/*` placeholders
- Updates `app/globals.css` with the preset's CSS variables (light + dark)
- May add a font import in `app/layout.tsx` if the preset specifies one

If `lib/utils.ts` already exists and `getURL()` is defined there, the init
script must **not** clobber it. Verify with `git diff lib/utils.ts` after
init. If clobbered, restore `getURL()` manually.

### Step 2 — add components

```bash
pnpm dlx shadcn@latest add \
  button input label card form dropdown-menu avatar sonner
```

Each component lands in `components/ui/`. No changes to existing components
in this step.

## Components to build

### `components/top-nav.tsx` (Server)

- Reads user via `lib/supabase/server.ts`
- Renders:
  - **Left:** logo link to `/`
  - **Center:** nav links `聊天` (`/`) and `文档上传` (`/documents`)
    - Active route highlighted via shadcn `<Button variant="secondary">`
  - **Right:**
    - Unauthenticated → `<Button asChild><Link href="/login">登录</Link></Button>` + `<Button variant="ghost" asChild><Link href="/signup">注册</Link></Button>`
    - Authenticated → `<UserMenu />`
- Hidden on `/login` and `/signup` via `(auth)/layout.tsx` (not by feature flag)

### `components/user-menu.tsx` (Client)

- Uses shadcn `DropdownMenu` + `Avatar`
- Trigger: avatar with email-initial fallback
- Menu items:
  - `<DropdownMenuLabel>{email}</DropdownMenuLabel>`
  - `<DropdownMenuItem asChild><Link href="/account">个人中心</Link></DropdownMenuItem>`
  - `<DropdownMenuSeparator />`
  - `<DropdownMenuItem>` containing `<form action="/auth/signout" method="post">` with submit button

### `components/auth-header.tsx` (Server)

- Used by `(auth)/layout.tsx`
- Renders: logo link to `/` on the left, optional "返回首页" link on the right
- No nav links, no user menu

### `components/auth-overlay.tsx` (Client)

- Props: `children` (the disabled chat input region)
- Renders:
  - Children inside `position: relative` parent with disabled state
  - Absolute-positioned overlay:
    - Semi-transparent backdrop (`bg-background/80 backdrop-blur-sm`)
    - Centered `<Card>`:
      - Icon (lock or shield emoji)
      - Title: "登录后可发起对话"
      - Description: "登录后即可向你的知识库提问"
      - `<Button asChild><Link href={`/login?next=${encodeURIComponent('/')}`}>立即登录</Link></Button>`
      - Secondary link: `还没有账号? 注册`

### `components/chat/chat-interface.tsx` (Client)

- Moved verbatim from `app/chat/chat-interface.tsx`
- No functional changes
- The input `<form>` and textarea get `disabled` when rendered inside the
  auth overlay (driven by an `isAuthenticated` prop)

### `app/page.tsx` (Server)

- `const { data: { user } } = await supabase.auth.getUser()`
- Render `<ChatInterface isAuthenticated={!!user} />` wrapped in
  `<AuthOverlay>` only when `!user`
- No Supabase debug data (storage buckets, project URL, etc.) is rendered

## Login / Signup pages

### `app/(auth)/login/page.tsx` (Server)

```tsx
<main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
  <Card className="max-w-md w-full">
    <CardHeader>
      <CardTitle>登录</CardTitle>
      <CardDescription>使用邮箱继续</CardDescription>
    </CardHeader>
    <CardContent>
      {errorMessage && <p className="text-sm text-destructive mb-4">{errorMessage}</p>}
      <LoginForm />
    </CardContent>
  </Card>
</main>
```

### `app/login/login-form.tsx` (Client)

- Uses shadcn `<Form>` (from `react-hook-form` + `@hookform/resolvers`) — actually **simplify to `useActionState` + native form** to avoid adding `react-hook-form` dependency. shadcn `<Form>` is optional, only used if `<FormField>` ergonomics are wanted.
- **Decision:** keep `useActionState` (already in the codebase), just style inputs with shadcn `<Input>` and `<Label>`. Avoid pulling `react-hook-form` for two-field forms.
- Fields: email, password
- Submit button: shadcn `<Button>` with pending state from `useFormStatus`
- Bottom link: "还没有账号? 注册"

### `app/login/actions.ts`

- New behavior:
  ```ts
  const next = sanitizeNext(formData.get('next'))
  // ... existing validation + signInWithPassword ...
  redirect(next ?? '/')
  ```
- `sanitizeNext`: reject anything not starting with `/` (absolute URLs / protocol-relative blocked)

### `app/signup/signup-form.tsx` + `actions.ts`

- Same shadcn treatment
- `actions.ts` passes `next=/` (or the validated next query) to `emailRedirectTo`

### `(auth)/layout.tsx`

```tsx
<>
  <AuthHeader />
  {children}
</>
```

## Auth callback

`app/auth/callback/route.ts`:

- Read `next` from query
- `sanitizeNext(next)` (same helper as login actions)
- Default to `/` when missing/invalid
- `NextResponse.redirect(new URL(safeNext, request.url))`

## Middleware

```ts
const PROTECTED_PREFIXES = ['/documents', '/account']

if (!user && PROTECTED_PREFIXES.some(p => request.nextUrl.pathname.startsWith(p))) {
  const next = request.nextUrl.pathname + request.nextUrl.search
  return NextResponse.redirect(
    new URL(`/login?next=${encodeURIComponent(next)}`, request.url)
  )
}
```

## Files changed

### New

- `components.json` (via shadcn init)
- `components/top-nav.tsx`
- `components/user-menu.tsx`
- `components/auth-header.tsx`
- `components/auth-overlay.tsx`
- `components/chat/chat-interface.tsx`
- `app/(auth)/layout.tsx`
- `lib/auth/next.ts` (the `sanitizeNext` helper, shared by login + callback)

### Modified

- `app/layout.tsx` (add `<TopNav />` inside `<body>`, remove any inline)
- `app/page.tsx` (rewrite to chat + overlay)
- `app/login/page.tsx` (move into `(auth)/login/page.tsx`, rewrite)
- `app/login/login-form.tsx` (shadcn primitives)
- `app/login/actions.ts` (`sanitizeNext`, default `/`)
- `app/signup/page.tsx` (rewrite)
- `app/signup/signup-form.tsx` (shadcn primitives)
- `app/signup/actions.ts` (`next=/` default)
- `app/auth/callback/route.ts` (default `/`, `sanitizeNext`)
- `app/documents/page.tsx` (drop inline `<header>` nav)
- `app/account/page.tsx` (drop inline `<header>` nav)
- `middleware.ts` (`PROTECTED_PREFIXES` + `?next=`)
- `lib/utils.ts` (preserve `getURL`, may add `cn` from shadcn)
- `app/globals.css` (shadcn preset CSS variables)
- `package.json` (shadcn-declared deps via `components.json`)

### Deleted

- `app/chat/` (entire directory: `page.tsx`, `chat-interface.tsx`)

### Untouched

- `app/auth/signout/route.ts`
- `app/api/chat/route.ts`
- `app/documents/actions.ts`
- `app/documents/new-document-form.tsx`
- `lib/supabase/*`
- `lib/embedding.ts`
- `lib/chunking.ts`
- `lib/chunking.test.ts`
- `scripts/*`

## Out of scope

- Migrating `<ChatInterface>` inner UI to shadcn primitives (input/button there stay Tailwind-styled for now — they're already custom)
- Adding dark-mode toggle (shadcn preset handles the CSS vars, but no UI switch)
- Marketing / pricing pages
- Internationalization (UI text stays in zh-CN for now)
- Changing `documents/new-document-form.tsx` UI (only the page header is updated)

## Open questions for implementation plan

None — design is complete pending user approval of this spec.