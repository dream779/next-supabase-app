# Next.js × Supabase 邮箱密码 Auth 设计

**Date:** 2026-06-22
**Status:** Approved
**Project location:** `/Users/liuyunlong/Desktop/MyProjects/next-supabase-app`
**Predecessor:** `2026-06-22-nextjs-vercel-supabase-design.md`（最小联通骨架）

## 目标

在已有的最小骨架基础上，**加上 Supabase 邮箱+密码登录/注册 + 邮箱验证 + 一个受保护页面**，端到端跑通：注册 → 收邮件 → 点验证链接 → 跳到受保护页 → 登出。

非目标（YAGNI，留给后续）：

- OAuth（Google / GitHub 等）
- Magic Link（免密码）
- 重置密码、改邮箱、删账号
- 用户资料表、RLS、Server Actions CRUD
- 全局 header / nav 组件
- 单测

## 范围确认

| 决策点 | 选择 |
|---|---|
| 登录方式 | 邮箱 + 密码 |
| 邮箱验证 | 启用（生产推荐） |
| 注册/登录页面 | 两个独立页 `/login` 和 `/signup` |
| 受保护页面 | 新增 `/account`，middleware 拦截未登录用户 |
| 表单提交 | Server Action（`'use server'`） |
| Session 刷新 | `middleware.ts` 每个请求调 `getUser()` |

## 架构

- 表单 → Server Action（`'use server'`）调用 Supabase Auth API
- Server Component 在首次渲染时读 session（`supabase.auth.getUser()`）
- `middleware.ts` 每个请求刷新 session cookie + 拦截 `/account`
- Route Handler `/auth/callback` 用一次性 `code` 换 session
- 登出走独立 Route Handler `/auth/signout`
- Cookie 由 `lib/supabase/server.ts` 现有工厂管理（**不动**）
- 浏览器端工厂 `lib/supabase/client.ts` 暂不使用（表单全走 Server Action，不在前端直连 supabase）

## 文件结构

新增的文件：

```
app/
├── login/
│   ├── page.tsx              # Server Component：读 ?error= 渲染头部提示 + 嵌入 LoginForm
│   ├── login-form.tsx        # 'use client'：表单（useActionState + useFormStatus）
│   └── actions.ts            # 'use server'：signIn action
├── signup/
│   ├── page.tsx              # Server Component：注册表单 + "请查收邮件"提示（用 state 切换）
│   ├── signup-form.tsx       # 'use client'：表单（useActionState + useFormStatus）
│   └── actions.ts            # 'use server'：signUp action
├── account/
│   └── page.tsx              # Server Component：受保护页，展示 user.email + 登出表单
├── auth/
│   ├── callback/
│   │   └── route.ts          # GET：邮箱验证 code → session → redirect(next)
│   └── signout/
│       └── route.ts          # POST：signOut → 清 cookie → redirect('/')

lib/
└── utils.ts                  # getURL() helper：拼 callback 用绝对 URL

middleware.ts                 # 项目根：刷新 session + 拦截 /account
```

不改动的文件：

- `app/layout.tsx`、`app/globals.css`、`app/page.tsx`（首页小改：登录后展示邮箱和登出按钮）
- `lib/supabase/client.ts`、`lib/supabase/server.ts`
- `package.json`（所有依赖已在）

`app/page.tsx` 的小改：未登录时保持原样；登录后顶部加一行 `Logged in as xxx@example.com · Sign out`。`Sign out` 是一个 `<form action="/auth/signout" method="post">` 提交按钮。

## 数据流

### 1. 注册

```
用户访问 /signup
  → 填邮箱 + 密码，提交
  → Server Action signUp() 调用 supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: getURL() + '/auth/callback?next=/account' }
    })
  → Supabase 发验证邮件，链接指向 emailRedirectTo
  → Action 返回 { ok: true }
  → /signup 页面切换到"请查收邮件"提示（含 next 跳的 /account 提示）
```

如果 supabase 返回错误（比如 password 太短、email 格式错、rate limit）→ Action `return { error: e.message }`，页面内联展示。

### 2. 邮箱验证

```
用户点邮件里的链接
  → 浏览器跳到 /auth/callback?code=XXX&next=/account
  → Route Handler GET：
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) redirect('/login?error=verification_failed')
      else       redirect(next ?? '/account')
```

`exchangeCodeForSession` 内部会写 session cookie（通过 `lib/supabase/server.ts` 的 cookies adapter）。

### 3. 登录

```
用户访问 /login?error=verification_failed
  → page.tsx（Server Component）读 searchParams.error → 顶部展示红字提示
  → 渲染 <LoginForm />

用户访问 /login（无 error）
  → 直接渲染 <LoginForm />

提交表单：
  → Server Action signIn() 调用 supabase.auth.signInWithPassword({ email, password })
  → 成功 → redirect('/account')
  → 失败 → return { error: e.message }
       可能错误："Invalid login credentials" / "Email not confirmed" / rate limit
       <LoginForm /> 用 useActionState 拿错误，内联展示
```

### 4. 访问受保护页 /account

```
浏览器请求 /account
  → middleware.ts：
      supabase.auth.getUser()（刷新 cookie）
      if (!user) redirect('/login')
  → /account/page.tsx（Server Component）：
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) redirect('/login')  // 兜底，正常不会触发
      渲染 user.email + 登出表单
```

双重检查的原因：middleware 的 redirect 是最佳努力，server component 自己再判一次更稳。

### 5. 登出

```
/account（或登录后的首页）点 Sign out
  → <form action="/auth/signout" method="post"> 提交
  → Route Handler POST：
      await supabase.auth.signOut()  // 清 cookie
      redirect('/')
```

### 6. 每个请求的 session 刷新

```
任何请求 → middleware.ts：
  → createServerClient + request.cookies.getAll/setAll
  → supabase.auth.getUser()  // 副作用：刷新 cookie
  → 判断 /account 未登录则 redirect
  → 返回带新 cookie 的 response
```

## Supabase 客户端复用

**不动** `lib/supabase/{client,server}.ts`。两个工厂已经写好且通过之前的联通验证。

中间件需要单独构造 client（不能在 server component 里复用），因为 middleware 拿到的是 `NextRequest`/`NextResponse` 而不是 `next/headers` 的 `cookies()`。中间件里直接用 `createServerClient` 重新构一个，cookies adapter 用 `request.cookies` 和 `response.cookies`。

## 邮箱验证链接的绝对 URL

`getURL()` helper（`lib/utils.ts`）：

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

- 本地：fallback `http://localhost:3000`
- Vercel：自动有 `NEXT_PUBLIC_VERCEL_URL`（每个部署的临时域名）；生产环境应在 Vercel Dashboard 设 `NEXT_PUBLIC_SITE_URL` 为生产域名

## 环境变量

新增：`NEXT_PUBLIC_SITE_URL`

| 变量 | 用途 | 暴露到浏览器 | 来源 |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | 邮件 callback 链接的域名 | 是 | 本地：可不设（兜底 localhost）；Vercel：设为生产域名 |

已有（不动）：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

更新 `.env.local.example` 增加新变量。

## 错误处理

| 场景 | 处理 |
|---|---|
| Server Action 失败（signIn / signUp） | `return { error: e.message }`，Client Component 用 `useActionState` 渲染 |
| Callback 失败（code 无效或过期） | redirect 到 `/login?error=verification_failed` |
| SignOut 失败 | 仍 redirect 到 `/`（不阻断 UX），dev 环境 console.error |
| Middleware 没拿到 user | redirect 到 `/login`，不暴露原因 |
| `/account` 内 `getUser()` 返回 null（middleware 失效） | redirect `/login` 兜底 |
| env var 缺失 | `@supabase/ssr` 抛 `MissingSupabaseEnvVarsError`，不捕获，让开发时一眼看到 |

**不要**把整个 supabase 错误对象透到 UI，只用 `.message`，避免泄漏内部细节。

## UI

- **风格沿用首页**：灰底 `bg-gray-50` + 白卡片 + `font-mono` 显示状态文本 + `shadow p-8 space-y-6`
- **表单布局**：`<label>` + `<input type="email|password">` 堆叠，input 用 `border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900`
- **主按钮**：`bg-gray-900 text-white rounded px-4 py-2 hover:bg-gray-800 disabled:opacity-50`
- **错误文本**：`text-red-600 text-sm`，放在按钮上方
- **提交中状态**：`useFormStatus()` 拿 `pending` → 按钮文字变 `Signing in...` / `Signing up...` / `Signing out...` 并 `disabled`
- **页面间导航**：
  - `/login` 底部：「没有账号？Sign up」链接到 `/signup`
  - `/signup` 底部：「已有账号？Log in」链接到 `/login`
  - `/signup` 成功后：显示一个「请查收邮件」卡片，含「去登录」链接
  - `/account`：登出表单 + 「回首页」链接
  - 首页（已登录态）：顶部 `Logged in as xxx · Sign out`
- **不**加全局 header / nav 组件

## 测试

**不写单测**。理由跟最小骨架一致：

- Auth 流是端到端的：Supabase 真发邮件、点链接、写 cookie；mock 测试意义不大
- 手动验证路径明确：`访问 /signup → 提交 → 查收邮件（Supabase Dashboard → Authentication → Users 也能看到用户状态） → 点验证链接 → 应跳 /account → 点 Sign out → 回首页`

实施计划里写明"如何手动 e2e 验证"，不写自动化测试。

## 关键决策记录

1. **Server Action 而非 client 直连**：跟 Next.js 16 App Router 推荐路径一致；表单天然 progressive enhancement（即便 JS 没加载也能提交）；cookie 由 server 管理更安全
2. **登出走 Route Handler 而非 Server Action**：登出是浏览器用 `<form method="post">` 直接触发的，POST 到固定 URL 语义清晰；不依赖 React 表单状态
3. **Middleware 双重 cookie 写入**：必须同时写 `request.cookies`（让后续 server action / route handler 能读到）和 `response.cookies`（让浏览器接收）。这是 `@supabase/ssr` 官方示例的固定模式
4. **`/account` 双重检查**：middleware redirect 是最佳努力，server component 再判一次更稳
5. **不写单测**：端到端验证更有价值
6. **不引入 `lib/supabase/client.ts` 的浏览器工厂**：表单走 Server Action，不在前端直连 supabase；减少攻击面（anon key 不出现在网络请求 body 里），代码也更少
7. **不修改 layout.tsx**：不加全局 header，避免改动现有渲染
8. **`getURL()` 兜底 localhost**：避免本地开发时忘记设 env var 而无法收到邮件

## 用户偏好（来自 memory）

- 包管理器：**pnpm**
- Git 操作（init / commit / push）：**用户自行处理**，不自动跑
- Dev 服务：**不自动启动**，由用户自己跑 `pnpm dev` 验证

## 后续扩展路线（不实现，仅记录）

- 改密码 / 找回密码
- OAuth（Google / GitHub）
- 用户资料表 + RLS
- Server Actions CRUD
- Storage 上传
- 全局 header / nav 组件
- 单元测试（如果引入复杂业务逻辑）