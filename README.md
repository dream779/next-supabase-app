# next-supabase-app

最小 Next.js × Vercel × Supabase 联通骨架。首屏验证 Supabase API 真的可达。

## 技术栈

- Next.js（App Router）
- TypeScript
- Tailwind CSS
- @supabase/supabase-js + @supabase/ssr

## 本地开发

```bash
# 1. 装依赖（如果还没装）
pnpm install

# 2. 关联到 Vercel 项目
npx vercel link

# 3. 拉 env 到本地
npx vercel env pull .env.local

# 4. 跑起来
pnpm dev
# 打开 http://localhost:3000，应看到 "API reachable ✅"
```

## 部署

方式 A：通过 Git（推荐）

```bash
git init
git add -A
git commit -m "init"
git remote add origin <your-github-repo>
git push -u origin main
# Vercel 会在 push 后自动 build + deploy
```

方式 B：直接 CLI

```bash
npx vercel --prod
```

## 环境变量

由 Vercel 的 Supabase 集成在 link 后自动注入：

| 变量名 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `NEXT_PUBLIC_SITE_URL` | 邮件验证链接的域名。本地可不设（兜底 `http://localhost:3000`）；Vercel 应设为生产域名 |

## 文件结构

```
app/
  layout.tsx        # 根布局
  page.tsx          # 联通验证页（已登录后顶部显示登出按钮）
  globals.css       # Tailwind 入口
  login/
    page.tsx        # 登录页（Server Component）
    login-form.tsx  # 登录表单（Client Component）
    actions.ts      # signIn Server Action
  signup/
    page.tsx        # 注册页
    signup-form.tsx # 注册表单
    actions.ts      # signUp Server Action
  account/
    page.tsx        # 受保护页（未登录跳 /login）
  auth/
    callback/
      route.ts      # 邮箱验证 callback handler
    signout/
      route.ts      # 登出 handler
lib/
  supabase/
    client.ts       # 浏览器端客户端
    server.ts       # 服务端客户端
  utils.ts          # getURL() helper
middleware.ts       # 刷新 session + 拦截 /account
```

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

## 扩展路线

加 RLS + 数据表 → Server Actions CRUD → Storage 上传