# Document Delete Confirmation Design Spec

**Date:** 2026-06-28
**Status:** Draft (pending user approval)
**Project:** next-supabase-app

## Goal

`/documents` 列表里的删除按钮当前是 `<form action={deleteDocument}>` 直接提交,没有任何确认,容易误删。改成点击后先弹二次确认,显示要删的文档标题,确认后才真正提交 Server Action。

## Decisions (locked)

| Topic | Decision |
|---|---|
| 弹窗技术 | 复用现有 `components/ui/alert-dialog.tsx`(`@base-ui/react/alert-dialog`),不引新依赖 |
| 弹窗位置 | 每行独立的受控 AlertDialog(用 row 自己的 `useState`) |
| 文案 | 标题「删除文档」+ 描述「确定要删除「{title}」吗?此操作不可撤销,相关的向量分块也会一并清除。」 |
| 按钮 | 「取消」(secondary) + 「确认删除」(destructive) |
| 删除逻辑 | 仍是 `deleteDocument` Server Action,不重写后端 |
| 触发方式 | 点删除按钮 → 弹窗 open;点确认 → 弹窗 close + form submit |
| 关闭交互 | 支持点遮罩关闭、按 Esc 关闭、点取消关闭 |
| 范围(不做) | ❌ 输入标题才允许删除(过重) / ❌ toast 反馈(删除成功后页面直接 revalidate,无需额外反馈) |

## Architecture

### 文件改动

| 文件 | 类型 | 说明 |
|---|---|---|
| `app/documents/document-row.tsx` | **新建** `('use client')` | 单行 Client Component,管弹窗 state |
| `app/documents/page.tsx` | 修改 | `<li>` 内容替换成 `<DocumentRow />`,移除内联 `<form action>` |
| `components/ui/alert-dialog.tsx` | 修改 | 新增 `AlertDialogAction` + `AlertDialogCancel` 两个导出(shadcn 习惯,本次需求首次用到) |

### `DocumentRow` 设计

```tsx
'use client'
// props: { id: string; title: string; source: string; createdAt: string }
// state: const [open, setOpen] = useState(false)
// 渲染顺序:
//   1. 左侧: 标题 + id/source/createdAt 元信息(与原来一致)
//   2. 右侧: <AlertDialog open={open} onOpenChange={setOpen}>
//              <AlertDialogTrigger>删除</AlertDialogTrigger>     (样式同现在: 红色下划线)
//              <AlertDialogContent>
//                <AlertDialogHeader>
//                  <AlertDialogTitle>删除文档</AlertDialogTitle>
//                  <AlertDialogDescription>确定要删除「{title}」吗?...</AlertDialogDescription>
//                </AlertDialogHeader>
//                <AlertDialogFooter>
//                  <AlertDialogCancel>取消</AlertDialogCancel>  (secondary 样式)
//                  <form action={deleteDocument} onSubmit={() => setOpen(false)}>
//                    <input type="hidden" name="id" value={id} />
//                    <AlertDialogAction type="submit">确认删除</AlertDialogAction>   (destructive 样式)
//                  </form>
//                </AlertDialogFooter>
//              </AlertDialogContent>
//            </AlertDialog>
```

**关键点**:
- `<form>` 包在 `AlertDialogAction` 外层 — `type="submit"` 让按钮触发表单,而不是直接 close 弹窗
- `onSubmit={() => setOpen(false)}` 确保表单提交的同时弹窗立刻关闭(不等 server 响应)
- 删除按钮用 `AlertDialogTrigger` 包,保持原视觉风格(text-red-600 underline)
- 取消按钮是 `AlertDialogCancel`(自带 close 行为),无需手动 `setOpen(false)`
- 不需要 `useTransition`/`useFormStatus` — 删除失败场景极少(且 RLS 自带保护),失败时页面会被 revalidate 自然刷新

### `AlertDialogAction` / `AlertDialogCancel` 实现

补到 `components/ui/alert-dialog.tsx`,基于 `AlertDialogPrimitive.Close`,**复用现有 `buttonVariants`**(`components/ui/button.tsx` 已有 `destructive` 和 `outline` variant):

```tsx
import { buttonVariants } from '@/components/ui/button'

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

并在 export block 加上 `AlertDialogAction, AlertDialogCancel`。

**注意**:base-ui 的 `Close` 自带 close 行为(`onClick` 自动 close),所以这两个按钮不需要 `onClick={() => setOpen(false)}`。
但因为 `<form>` 包在 Action 外层,Action 的 `type="submit"` 会先触发表单提交,Close 的 click 也会触发 close — 两者顺序由 React 决定,实际效果是 form 先 submit(异步)、弹窗同步 close,符合预期。

### `page.tsx` 改动

把现在的:
```tsx
<li ...>
  <div ...>{title} {meta}</div>
  <form action={deleteDocument}>
    <input type="hidden" name="id" value={doc.id} />
    <button type="submit" ...>删除</button>
  </form>
</li>
```

改成:
```tsx
<li ...>
  <DocumentRow
    id={doc.id}
    title={doc.title}
    source={doc.source}
    createdAt={doc.created_at}
  />
</li>
```

`formatDate` 仍在 `page.tsx` 或直接传入已格式化字符串 — 待实现时定。

## Testing / Acceptance

- [ ] 点删除按钮 → 弹窗弹出,标题正确显示当前文档标题
- [ ] 点取消 / Esc / 遮罩 → 弹窗关闭,文档仍在
- [ ] 点确认删除 → 弹窗关闭 + 文档从列表消失(chunks 通过 `on delete cascade` 自动清理)
- [ ] 不同行独立 — 删 A 的弹窗不影响 B 行的触发器
- [ ] 删除失败(如网络断)→ 弹窗关闭,刷新页面文档仍在(因为 revalidate 在 action 内)
- [ ] 无新增依赖;`pnpm tsc --noEmit` 通过

## Out of Scope

- 撤销删除(undo)
- 删除 loading 态
- 删除 toast 提示
- 批量删除多选