# Next.js + Vercel + Supabase 最小联通骨架

**Date:** 2026-06-22
**Status:** Approved
**Project location:** `/Users/liuyunlong/Desktop/MyProjects/next-supabase-app`

## 目标

产出一个最小可运行的 Next.js 项目，部署到 Vercel，并通过 Vercel 的 Supabase 集成联通到 Supabase。首屏能直观展示 Supabase API 真的可达（不需手动建表、不需配 RLS、不需写 SQL）。

非目标（YAGNI，留给后续按需扩展）：

- 任何 Supabase Auth 登录/注册流程
- 任何数据库表、CRUD、Server Actions 示例
- Storage 上传/下载
- 任何业务页面
- 任何 server-side 写入

## 范围确认

- **Scaffold 程度：** 最小可运行 + 联通验证
- **联通证明方式：** 不建表，调用 Supabase 内置 API（`auth.getSession` + `storage.listBuckets`）
- **样式方案：** Tailwind CSS
- **项目路径：** `~/Desktop/MyProjects/next-supabase-app`

## 架构与文件结构

```
next-supabase-app/
├── app/
│   ├── layout.tsx          # 根布局
│   ├── page.tsx            # 首页（Server Component）：调用 supabase 验证联通
│   └── globals.css         # Tailwind 入口
├── lib/
│   └── supabase/
│       ├── client.ts       # createBrowserClient：给 client component / event handler
│       └── server.ts       # createServerClient：给 server component / route handler / server action
├── public/
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-06-22-nextjs-vercel-supabase-design.md
├── .env.local.example
├── .gitignore
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

**技术栈选择：**

- **App Router**（Next 15 当前默认）
- **TypeScript**（strict）
- **Tailwind CSS**（create-next-app 默认；具体版本以当时跑出来为准）
- **包管理器：** pnpm
- **不用** `src/` 目录（保持扁平，文件少时易读）

## Supabase 客户端策略

两个工厂，遵循 `@supabase/ssr` 官方推荐：

### `lib/supabase/client.ts`（浏览器端）

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

### `lib/supabase/server.ts`（服务端）

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
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
```

**关键点：** Next 15 的 `cookies()` 返回 Promise，必须 `await`。`setAll` 里的 try/catch 是 `@supabase/ssr` 官方示例的固定模式，处理 Server Component 内 set cookie 抛错的情况。

## 环境变量

Vercel 的 Supabase 集成在项目上 link 后会自动注入以下变量，本地通过 `vercel env pull .env.local` 拉取。

| 变量名 | 用途 | 暴露到浏览器 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | 是 |

`.env.local.example` 内容：

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

**不引入 `SUPABASE_SERVICE_ROLE_KEY`**：本骨架没有后台管理需求，按需后续添加。

## 首屏联通验证实现

`app/page.tsx` 是 Server Component，逻辑：

1. `await createClient()`（server client）
2. **并发**调用两个无副作用 API：
   - `supabase.auth.getSession()` —— 验证 Auth 服务可达
   - `supabase.storage.listBuckets()` —— 验证 Storage 服务可达
3. 渲染：
   - 项目 URL：取前 30 字符 + `…`（脱敏）
   - `API reachable`：两个调用都成功才显示 ✅
   - `Auth`：session 状态（null = 没人登录，调用本身成功）
   - `Storage`：bucket 数量 + 名字列表
   - 任何一步失败：显示对应错误对象，不抛异常

样式：Tailwind 把卡片居中、灰底圆角、状态行用等宽字体。无需任何动效。

## 本地开发与部署

README 写明：

```bash
# 1. 装依赖
cd next-supabase-app
pnpm install

# 2. 关联到 Vercel 项目（拉 env 用）
npx vercel link
npx vercel env pull .env.local

# 3. 本地跑
pnpm dev
# 打开 http://localhost:3000，应看到 "API reachable ✅"

# 4. 部署（用户自行处理 git）
# 方式 A：推到 GitHub 让 Vercel 自动部署
#   git init && git add -A && git commit -m "init"
#   git remote add origin <your-repo>
#   git push -u origin main
# 方式 B：直接 CLI 部署
#   npx vercel --prod
```

## 错误处理

- 任何 env 缺失：`@supabase/ssr` 会在初始化时抛 `MissingSupabaseEnvVarsError`（`NEXT_PUBLIC_SUPABASE_URL is required` 之类）。不在页面里捕获，让它直接 crash，开发者一眼能看到问题。
- API 调用失败：在 page.tsx 内 `if (error)` 显示错误对象的 `message`，不抛。
- 任何 Server Component 抛错由 Next 15 默认 error boundary 兜底（本骨架不写自定义 error.tsx）。

## 测试

**本骨架不写单测。** 理由：

- 没有业务逻辑
- 联通验证本身就是端到端测试（"打开页面看到 ✅"）
- 加单测等于让用户维护一堆 mock，没有价值

如果未来要加测试，在 writing-plans 阶段重新评估。

## 关键决策记录

1. **App Router 而非 Pages Router**：Next 15 默认，未来所有官方示例都基于 App Router。
2. **不用 `src/` 目录**：文件少时扁平更易读；超过 20 个文件再考虑迁移。
3. **不用 `create-next-app --example with-supabase`**：例子作者的个人风格（路径、目录名）不一定符合用户习惯，且我们只想要它的依赖列表和构建配置，不要它的示例页面。
4. **`storage.listBuckets` 而非自定义 RPC**：内置 API 零配置；如果 anon 权限不够 list buckets，回退到 `auth.getSession` 单调用验证。
5. **没有 `vercel.json`**：Next.js on Vercel 零配置工作。
6. **不引入 service role key**：最小骨架不需要 server-side 写操作。

## 用户偏好（来自 memory）

- 包管理器：**pnpm**（已采用）
- Git 操作（init / commit / push）：**用户自行处理**，不自动跑（已遵守 —— 文档里写明步骤但不执行）

## 后续扩展路线（不实现，仅记录）

加 Auth → 加 RLS + 数据表 → 加 Server Actions CRUD → 加 Storage 上传 → 拆出 API 层
