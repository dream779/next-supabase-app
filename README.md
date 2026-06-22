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
