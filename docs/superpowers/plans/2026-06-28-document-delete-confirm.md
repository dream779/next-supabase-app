# Document Delete Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmation alert dialog before deleting documents in `/documents`, showing the document title in the prompt so users don't accidentally delete the wrong record.

**Architecture:** Reuse the existing `components/ui/alert-dialog.tsx` (shadcn-style over `@base-ui/react/alert-dialog`). Extract each list row into a Client Component (`DocumentRow`) that owns its own `open` state. The delete still goes through the existing `deleteDocument` Server Action; the dialog is purely a UI guard.

**Tech Stack:** Next.js 16 App Router · React 19 · `@base-ui/react/alert-dialog` · Tailwind CSS 4 · TypeScript strict.

**Conventions (per `CLAUDE.md`):**
- Project has no test framework → skip TDD. Verify with a single `pnpm tsc --noEmit` at the end.
- AI never starts `pnpm dev`. User runs it to verify UI.
- `git add` / `git commit` is done by the user. Plan does NOT include commit steps — instead, end-of-plan reminds user to commit.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `components/ui/alert-dialog.tsx` | Modify | Add `AlertDialogAction` + `AlertDialogCancel` exports (shadcn-standard) |
| `app/documents/document-row.tsx` | Create | `'use client'` row component — owns dialog state, renders trigger + AlertDialog |
| `app/documents/page.tsx` | Modify | Replace inline `<form action>` with `<DocumentRow />` |

No other files touched. `app/documents/actions.ts` and `lib/supabase/server.ts` unchanged.

---

## Task 1: Extend `alert-dialog.tsx` with `AlertDialogAction` / `AlertDialogCancel`

**Files:**
- Modify: `components/ui/alert-dialog.tsx`

**Why first:** `DocumentRow` (Task 2) imports these. Doing this in isolation lets us tsc-check the foundation.

- [ ] **Step 1: Add `buttonVariants` import**

In `components/ui/alert-dialog.tsx`, after the existing `import { cn } from '@/lib/utils'` line, add:

```tsx
import { buttonVariants } from '@/components/ui/button'
```

Resulting top of file:

```tsx
'use client'

import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
```

- [ ] **Step 2: Add `AlertDialogAction` function**

Insert this function directly **after** the `AlertDialogDescription` function (just before the `export {` block):

```tsx
function AlertDialogAction({
  className,
  ...props
}: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-action"
      className={cn(buttonVariants({ variant: 'destructive' }), className)}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  ...props
}: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant: 'outline' }), className)}
      {...props}
    />
  )
}
```

**Why `AlertDialogPrimitive.Close`:** base-ui's `Close` primitive already wires `onClick` to call the root's `onOpenChange(false)`. We don't need a manual `onClick` handler.

- [ ] **Step 3: Update export block**

Replace the existing `export {` block at the bottom of the file:

```tsx
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
}
```

with:

```tsx
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
```

- [ ] **Step 4: Verify the file compiles**

Run:

```bash
pnpm tsc --noEmit
```

Expected: exit code 0, no output. (Only this one file changed so far; nothing imports the new exports yet, but TypeScript should still parse the file cleanly.)

If errors mention `buttonVariants`, double-check `components/ui/button.tsx` exports it as a named export (it does — see line 56 of that file).

---

## Task 2: Create `DocumentRow` client component

**Files:**
- Create: `app/documents/document-row.tsx`

- [ ] **Step 1: Create the file with full contents**

Create `app/documents/document-row.tsx` with the following exact contents:

```tsx
'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deleteDocument } from './actions'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DocumentRow({
  id,
  title,
  source,
  createdAt,
}: {
  id: string
  title: string
  source: string
  createdAt: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center justify-between gap-4 w-full">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 truncate">{title}</p>
        <p className="text-xs text-gray-500 font-mono">
          {id} · {source} · {formatDate(createdAt)}
        </p>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          className="text-sm text-red-600 underline hover:text-red-800 cursor-pointer"
        >
          删除
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文档</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{title}」吗？此操作不可撤销，相关的向量分块也会一并清除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <form
              action={deleteDocument}
              onSubmit={() => setOpen(false)}
            >
              <input type="hidden" name="id" value={id} />
              <AlertDialogAction type="submit">确认删除</AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

**Key behaviors encoded above:**
- Each row owns its own `open` state → independent dialogs, no cross-row interference.
- `<form action={deleteDocument}>` wraps `<AlertDialogAction type="submit">`. The form does the actual delete (Server Action) and `onSubmit` flips `open` to `false` so the dialog dismisses immediately without waiting for the server response.
- `AlertDialogCancel` (base-ui `Close` under the hood) handles its own close behavior.
- The outer `<li>` styling from `page.tsx` stays — `DocumentRow` is just an inner flex container, no `<li>` element.

---

## Task 3: Wire `DocumentRow` into the documents list

**Files:**
- Modify: `app/documents/page.tsx`

- [ ] **Step 1: Add `DocumentRow` import**

At the top of `app/documents/page.tsx`, add this import **below the existing `import { deleteDocument } from './actions'` line**:

```tsx
import { DocumentRow } from './document-row'
```

Keep all existing imports untouched.

- [ ] **Step 2: Replace the inline row body with `<DocumentRow />`**

Find the existing `<li>` body inside the `.map((doc) => (…))` callback in `DocumentsList`:

```tsx
<li
  key={doc.id}
  className="flex items-center justify-between py-3 gap-4"
>
  <div className="min-w-0 flex-1">
    <p className="font-medium text-gray-900 truncate">
      {doc.title}
    </p>
    <p className="text-xs text-gray-500 font-mono">
      {doc.id} · {doc.source} · {formatDate(doc.created_at)}
    </p>
  </div>
  <form action={deleteDocument}>
    <input type="hidden" name="id" value={doc.id} />
    <button
      type="submit"
      className="text-sm text-red-600 underline hover:text-red-800"
    >
      删除
    </button>
  </form>
</li>
```

Replace with:

```tsx
<li
  key={doc.id}
  className="flex items-center justify-between py-3 gap-4"
>
  <DocumentRow
    id={doc.id}
    title={doc.title}
    source={doc.source}
    createdAt={doc.created_at}
  />
</li>
```

- [ ] **Step 3: Remove the now-unused `formatDate` from `page.tsx`**

`DocumentRow` has its own `formatDate` (Task 2). The one in `page.tsx` is no longer referenced.

Delete the entire `formatDate` function definition from `app/documents/page.tsx` (lines 14-23 in the current file):

```tsx
function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
```

- [ ] **Step 4: Remove the now-unused `deleteDocument` import from `page.tsx`**

`deleteDocument` is no longer called directly from `page.tsx` — `DocumentRow` imports it. Remove this line from the imports block:

```tsx
import { deleteDocument } from './actions'
```

If `createDocument` is also imported from `'./actions'` in the same statement, keep that one and only drop the `deleteDocument` symbol.

---

## Task 4: Verify everything compiles

**Files:** none modified

- [ ] **Step 1: Run typecheck**

Run:

```bash
pnpm tsc --noEmit
```

Expected: exit code 0, no errors.

Common failure modes:
- "Cannot find module '@/components/ui/alert-dialog'" → check `components/ui/alert-dialog.tsx` still has `'use client'` directive at top.
- "buttonVariants is not exported" → confirm `components/ui/button.tsx` exports `buttonVariants` (line 56 in current file). Should already be there.
- "Property 'Close' does not exist on type ..." → confirm `@base-ui/react/alert-dialog` is the package (not `@base-ui/react/dialog`). Re-check the existing `AlertDialogOverlay` usage in the same file uses `Backdrop` — that's the correct primitive name.

- [ ] **Step 2: Hand off to user for visual verification**

Tell the user:

> 请运行 `pnpm dev`，打开 `/documents`，验证：
> 1. 点任一文档的「删除」→ 弹窗弹出，标题里正确显示该文档的标题
> 2. 点「取消」/ Esc / 弹窗遮罩 → 弹窗关闭，文档仍在
> 3. 点「确认删除」→ 弹窗关闭，文档从列表消失（chunks 通过 cascade 自动清理）
> 4. 不同行的弹窗互相独立
>
> 验证通过后，请自行 commit（建议消息：`feat(documents): 删除文档前弹窗二次确认`）。

---

## Acceptance Checklist (cross-check with spec)

- [ ] 删除按钮弹窗显示文档标题（spec §Decisions）
- [ ] 取消/Esc/遮罩都能关弹窗（spec §Decisions 关闭交互）
- [ ] 确认后走 `deleteDocument` Server Action，文档消失（spec §Architecture）
- [ ] chunks 通过 cascade 自动清理（已有行为，未改）
- [ ] 不同行弹窗互不干扰（每行独立 `useState`）
- [ ] `pnpm tsc --noEmit` 通过
- [ ] 无新增 npm 依赖
- [ ] UI 风格与项目其他 alert-dialog 用法保持一致