# Next.js × Vercel × Supabase 最小联通骨架 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一个最小可运行的 Next.js 15 项目，部署到 Vercel，并通过 Vercel-Supabase 集成联通 Supabase；首屏能可视化展示 API 联通状态。

**Architecture:** 用 `create-next-app` 起标准 App Router + TS + Tailwind 骨架，加 `@supabase/ssr` 双客户端工厂（浏览器 / 服务端），首页用 Server Component 并发调用 `auth.getSession` + `storage.listBuckets` 验证联通。

**Tech Stack:** Next.js 15（App Router）、TypeScript、Tailwind CSS、pnpm、@supabase/supabase-js、@supabase/ssr。

---

## 文件结构总览

| 文件 | 职责 | 任务 |
|---|---|---|
| `next-supabase-app/package.json` 等 | create-next-app 生成 | T1 |
| `lib/supabase/client.ts` | 浏览器端客户端工厂 | T3 |
| `lib/supabase/server.ts` | 服务端客户端工厂（cookie 适配） | T4 |
| `.env.local.example` | env 占位符 | T5 |
| `app/page.tsx` | 联通验证 Server Component | T6 |
| `README.md` | 本地开发 + Vercel 部署步骤 | T7 |

---

## Task 1: 用 create-next-app 引导项目

**Files:**
- Create: `next-supabase-app/` 整目录

- [ ] **Step 1: 进入项目父目录**

```bash
cd /Users/liuyunlong/Desktop/MyProjects
```

- [ ] **Step 2: 运行 create-next-app（非交互）**

```bash
pnpm create next-app@latest next-supabase-app \
  --typescript \
  --tailwind \
  --app \
  --eslint \
  --no-src-dir \
  --import-alias "@/*" \
  --use-pnpm \
  --turbopack \
  --no-git
```

预期：目录下生成 `app/`、`public/`、`package.json`、`tsconfig.json`、`next.config.ts`、`tailwind.config.ts`（或 v4 风格配置）、`postcss.config.mjs`、`eslint.config.mjs`、`.gitignore` 等。命令退出码 0。

如果 create-next-app 报"flag 未知"，说明版本变了 — 跑 `pnpm create next-app@latest --help` 看当前 flag，替换对应名字。所有非默认开关（TS/Tailwind/App/ESLint/无 src/alias/pnpm/turbopack）必须显式给出，否则会进交互。

- [ ] **Step 3: 验证 install 完成**

```bash
cd next-supabase-app && ls node_modules | head -5
```

预期：看到 `next`、`react`、`react-dom` 等目录。

- [ ] **Step 4: 验证 dev server 能起（可选 sanity check）**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app && timeout 15 pnpm dev
```

预期：看到 `▲ Next.js 15.x` 启动日志、`Ready in ...`、本地 URL（如 `http://localhost:3000`）。15s 后自动停。

- [ ] **Step 5: 用户提交（git 阶段）**

> **用户执行：**
> ```bash
> cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
> git init
> git add -A
> git commit -m "chore: scaffold next.js app via create-next-app"
> ```

---

## Task 2: 安装 Supabase 依赖

**Files:**
- Modify: `next-supabase-app/package.json`、`pnpm-lock.yaml`

- [ ] **Step 1: 安装运行时依赖**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app && pnpm add @supabase/supabase-js @supabase/ssr
```

预期：两包加入 `dependencies`；`pnpm-lock.yaml` 更新；退出码 0。

- [ ] **Step 2: 验证 TS 仍能构建（不真改代码）**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app && pnpm build
```

预期：build 成功。看到 `▲ Next.js 15.x` 和 `Compiled successfully`。

- [ ] **Step 3: 用户提交（git 阶段）**

> **用户执行：**
> ```bash
> git add package.json pnpm-lock.yaml
> git commit -m "chore: add @supabase/supabase-js and @supabase/ssr"
> ```

---

## Task 3: 创建浏览器端 Supabase 客户端工厂

**Files:**
- Create: `next-supabase-app/lib/supabase/client.ts`

- [ ] **Step 1: 写 `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 2: 验证 TS 编译过**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app && pnpm build
```

预期：build 成功。

- [ ] **Step 3: 用户提交（git 阶段）**

> **用户执行：**
> ```bash
> git add lib/supabase/client.ts
> git commit -m "feat(supabase): add browser client factory"
> ```

---

## Task 4: 创建服务端 Supabase 客户端工厂

**Files:**
- Create: `next-supabase-app/lib/supabase/server.ts`

- [ ] **Step 1: 写 `lib/supabase/server.ts`**

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
```

- [ ] **Step 2: 验证 TS 编译过**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app && pnpm build
```

预期：build 成功。

- [ ] **Step 3: 用户提交（git 阶段）**

> **用户执行：**
> ```bash
> git add lib/supabase/server.ts
> git commit -m "feat(supabase): add server client factory"
> ```

---

## Task 5: 添加 .env.local.example

**Files:**
- Create: `next-supabase-app/.env.local.example`

- [ ] **Step 1: 写 `.env.local.example`**

```
# Vercel 的 Supabase 集成会在 link 后自动注入以下变量
# 本地通过 `npx vercel env pull .env.local` 拉取真实值
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 2: 用户提交（git 阶段）**

> **用户执行：**
> ```bash
> git add .env.local.example
> git commit -m "chore: add .env.local.example"
> ```

---

## Task 6: 替换首页为联通验证页

**Files:**
- Modify: `next-supabase-app/app/page.tsx`（覆盖 create-next-app 默认的欢迎页）

- [ ] **Step 1: 覆盖 `app/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'

type Bucket = { id: string; name: string }

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export default async function Home() {
  const supabase = await createClient()

  const [authRes, storageRes] = await Promise.allSettled([
    supabase.auth.getSession(),
    supabase.storage.listBuckets(),
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const maskedUrl = url ? `${url.slice(0, 30)}…` : '(unset)'

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-xl w-full bg-white rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Next.js × Vercel × Supabase
        </h1>

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
              ? 'session: null (no user logged in)'
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
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 验证 build 成功（不需要 env）**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app && pnpm build
```

预期：build 成功（即使没 env 也能 build；只有访问 `/` 才会触发 server 端调用）。

- [ ] **Step 3: 验证 dev server 启动后无 env 时给清晰错误（可选 sanity check）**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app && timeout 12 pnpm dev
```

浏览器开 `http://localhost:3000`，应该看到 "Project: (unset)" 和 "API reachable: ❌" + Auth 行的 "error: ..."。这是预期行为，验证了"env 缺失时不会静默通过"。

- [ ] **Step 4: 用户提交（git 阶段）**

> **用户执行：**
> ```bash
> git add app/page.tsx
> git commit -m "feat(home): show supabase api reachability"
> ```

---

## Task 7: 写 README

**Files:**
- Create: `next-supabase-app/README.md`

- [ ] **Step 1: 写 `README.md`**

```markdown
# next-supabase-app

最小 Next.js × Vercel × Supabase 联通骨架。首屏验证 Supabase API 真的可达。

## 技术栈

- Next.js 15（App Router）
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

## 文件结构

```
app/
  layout.tsx        # 根布局
  page.tsx          # 联通验证页
  globals.css       # Tailwind 入口
lib/
  supabase/
    client.ts       # 浏览器端客户端
    server.ts       # 服务端客户端
```

## 扩展路线

加 Auth → 加 RLS + 数据表 → Server Actions CRUD → Storage 上传
```

- [ ] **Step 2: 用户提交（git 阶段）**

> **用户执行：**
> ```bash
> git add README.md
> git commit -m "docs: add README with deploy workflow"
> ```

---

## Task 8: 本地联通验证（用户执行）

> **以下步骤由用户完成。** 完成后回到这里继续 T9。

- [ ] **Step 1: 关联 Vercel 项目**

```bash
cd /Users/liuyunlong/Desktop/MyProjects/next-supabase-app
npx vercel link
```

按提示选 Vercel team 和已配置好 Supabase 集成的项目。预期：`Linked to <team>/<project>`。

- [ ] **Step 2: 拉 env**

```bash
npx vercel env pull .env.local
```

预期：`.env.local` 生成，里面有 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。`cat .env.local` 验证。

- [ ] **Step 3: 跑 dev server**

```bash
pnpm dev
```

- [ ] **Step 4: 打开浏览器看 `http://localhost:3000`**

预期看到：
- Project: `https://<project-ref>.supabase.co…`（前 30 字符）
- API reachable: ✅
- Auth: `session: null (no user logged in)`
- Storage: `no buckets yet`（或列出已有 bucket 名字）

如果看到 ❌，检查：
- `.env.local` 里两个变量是否都有值
- Vercel 项目里 Supabase integration 是否真的 link 上了（`vercel env ls` 应该看到 `NEXT_PUBLIC_SUPABASE_URL` 等）

---

## Task 9: 部署（用户执行）

- [ ] **Step 1: 推 GitHub 或 CLI 部署**

方式 A：

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

方式 B：

```bash
npx vercel --prod
```

- [ ] **Step 2: 等部署完成，在 Vercel dashboard 打开预览 URL**

预期看到和本地一样的 ✅ 页面。

- [ ] **Step 3: 完结**

到此骨架完工。下一步扩展（Auth / 表 / RLS）按 README "扩展路线" 走。

---

## 自审记录

- **Spec 覆盖：** 6 个 spec 关键决策（架构、客户端、env、联通验证、部署、错误处理）→ 9 个任务全部 cover。
- **占位符扫描：** 没有 TBD/TODO/类似 X；所有代码块是完整可粘贴内容。
- **类型一致性：** `createClient()` 函数名在 T3（浏览器）和 T4（服务端）一致；T6 调用的是 T4 的版本。
- **用户偏好：** 全部 git 步骤标为"用户执行"；没自动跑 `git init` / `git commit`。
- **DRY：** T3、T4 的客户端工厂不重复；T6 的 `authResult/storageResult` 模式复用。
- **YAGNI：** 不写单测（spec 已说明）；不引入 service role key（spec 已说明）；不写自定义 error.tsx（spec 已说明）。
