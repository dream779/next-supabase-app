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
        <AlertDialogTrigger className="text-sm text-red-600 underline hover:text-red-800 cursor-pointer">
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
            <form action={deleteDocument} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={id} />
              <AlertDialogAction type="submit">确认删除</AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}