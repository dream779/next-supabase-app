# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

最小 Next.js × Vercel × Supabase 联通骨架。已实现邮箱注册 + 登录 + 邮箱验证 + 登出 + 受保护页。

## 技术栈

- Next.js **16.2.9** App Router · React 19 · TypeScript strict
- Tailwind CSS 4 (`@tailwindcss/postcss`)
- `@supabase/ssr` 0.12 + `@supabase/supabase-js` 2.x
- pnpm

## ⚠️ 必须遵守的开发规范

1. **Next.js 16 是 breaking 版本**：与训练数据差异很大。任何 Next / React API 调用前**必须**先读 `node_modules/next/dist/docs/` 对应章节，不要凭记忆写。详见 `AGENTS.md`。
2. **不要启动 dev server**：用户自己跑 `pnpm dev` 验证。AI 只在改完后跑一次 `pnpm tsc --noEmit` 即可，不要频繁验证。
3. **git init / commit / push 由用户操作**：不要主动执行。如用户明确要求才执行。
4. **最小验证**：不要对每个子任务都跑 typecheck / lint / build，全部改完后统一跑一次 `pnpm tsc --noEmit`。

## 常用命令

```bash
pnpm install              # 装依赖
pnpm dev                  # 本地开发（用户自己跑）
pnpm build                # 生产构建
pnpm lint                 # eslint
pnpm tsc --noEmit         # 类型检查
npx vercel env pull .env.local   # 拉 Supabase env（项目须先 npx vercel link）
npx vercel link           # 关联 Vercel 项目
npx vercel --prod         # 直接部署到生产
```

## 路由结构

| 路由 | 类型 | 说明 |
|---|---|---|
| `/` | Server | 联通验证页 + auth 状态展示 |
| `/signup` | Server + Client form | 注册（Server Action + `useActionState`） |
| `/login` | Server + Client form | 登录，支持 `?error=verification_failed` |
| `/account` | Server | **受保护页**，未登录由 middleware 跳 `/login` |
| `/documents` | Server | **受保护页**（M3 文档管理），列文档 + 新建/删除 |
| `/chat` | Server + Client | **受保护页**（M4 流式问答），用 `useChat` 调 `/api/chat` |
| `/api/chat` | Route Handler POST | M4 RAG 流式 endpoint：embed query → `match_chunks` → DashScope `qwen-plus` |
| `/auth/callback` | Route Handler GET | 邮箱验证 `code` 换 session |
| `/auth/signout` | Route Handler POST | 登出 → 跳 `/` |

## 关键架构

### Supabase 三处 client，必须用对

- `lib/supabase/client.ts` → **浏览器端**（`'use client'` 组件内）
- `lib/supabase/server.ts` → **Server Components / Server Actions / Route Handlers**。注意 `cookies()` 是 **async** 的，必须 `await cookies()`
- `middleware.ts` → 直接用 `@supabase/ssr` 的 `createServerClient`，传入 `NextRequest` / `NextResponse` cookies adapter。setAll 时必须**同时写** `request.cookies` 和 `response.cookies`，否则 session 不刷新

### Auth 数据流

1. `/signup` 提交 → `signUp` Server Action 调 `supabase.auth.signUp({ emailRedirectTo: \`${getURL()}auth/callback?next=/account\` })`
2. Supabase 发验证邮件 → 用户点链接 → 跳到 `/auth/callback?code=xxx`
3. `exchangeCodeForSession(code)` → 写 session cookies → 跳 `next`（默认 `/account`）
4. `/login` 用 `signInWithPassword`，成功后 `redirect('/account')`
5. 登出走 `<form action="/auth/signout" method="post">`

### `getURL()` (`lib/utils.ts`)

构建邮件回调链接用。优先级：`NEXT_PUBLIC_SITE_URL` → `NEXT_PUBLIC_VERCEL_URL` → `http://localhost:3000`。本地开发可不设。

### 文档管理流程（M3）

1. `/documents` 是 Server Component，从 `documents` 表 `select` 当前用户的所有记录（RLS 自动过滤）
2. 新建走 `createDocument` Server Action（`app/documents/actions.ts`）：插入 document → `recursiveCharSplit` chunk → `embedChunks`（含 3 次重试）→ 批量 insert chunks。任一中间步骤失败，best-effort 删除已建的 document（不保证事务性）
3. 删除走 `deleteDocument` Server Action（同样文件），传 `id` via hidden input；chunks 通过 `on delete cascade` 自动清理
4. **必须用 `lib/supabase/server.ts`（anon + user JWT），走 RLS**；不要在这里用 `lib/supabase/admin.ts`（会绕过 RLS）

### 问答流程（M4）

1. 浏览器 `/chat` 是 Client Component (`useChat`)，POST `/api/chat` 发消息
2. Route Handler 做 3 步: `embedQuery(question)` → RPC `match_chunks` 拿 top-5 → 拼到 system prompt
3. `streamText` 调 DashScope `qwen-plus`，流回 `UIMessage` 给客户端
4. **必须用 `lib/supabase/server.ts`** (走 RLS, user 自动隔离); embed 走 ARK (`lib/embedding.ts`), LLM 走 DashScope
5. 没装 `@ai-sdk/react` 的话 `useChat` 不可用

## 环境变量

由 Vercel × Supabase 集成在 `vercel link` 后自动注入到 Production / Preview。**Development 环境需手动在 Vercel Dashboard 添加**，或本地 `vercel env pull`。

| 变量 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `NEXT_PUBLIC_SITE_URL` | 邮件验证链接域名。本地可不设；生产必填生产域名 |

## ⚠️ 上线 checklist

部署到生产后必须配：

1. **Vercel Dashboard** → Project Settings → Environment Variables：给所有环境（Production / Preview / Development）加 `NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app`
2. **Supabase Dashboard** → Authentication → URL Configuration：
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: `https://your-app.vercel.app/auth/callback`
3. Supabase 默认邮件可能被限速（4 次/小时）或进垃圾箱。生产前到 Authentication → Providers → Email 配置自定义 SMTP

## Next.js 16 容易踩坑的点

- `cookies()` / `headers()` / `params` / `searchParams` 全部是 **async**，必须 `await`
- Server Action 返回值配合 React 19 的 `useActionState` + `useFormStatus` 处理 pending 态
- `lib/supabase/server.ts` 的 `cookies.set` 在 Server Component 内会抛错（已 try/catch 吞掉），只能在 Server Action / Route Handler 里写
- middleware matcher 已排除 `_next/static`、`_next/image`、`favicon.ico`、常见图片扩展名