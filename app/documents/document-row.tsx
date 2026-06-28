'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
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

function DeleteButton() {
  const { pending } = useFormStatus()
  return (
    <AlertDialogAction type="submit" disabled={pending}>
      {pending ? '删除中...' : '确认删除'}
    </AlertDialogAction>
  )
}

export function DocumentRow({
  id,
  title,
  createdAt,
}: {
  id: string
  title: string
  createdAt: string
}) {
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  return (
    <div
      className={`flex items-center justify-between gap-4 w-full transition-opacity ${
        isDeleting ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 truncate">{title}</p>
        <p className="text-xs text-gray-500">{formatDate(createdAt)}</p>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger className="text-sm text-red-600 underline hover:text-red-800 cursor-pointer disabled:no-underline disabled:opacity-50">
          {isDeleting ? '删除中...' : '删除'}
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
              onSubmit={() => {
                setOpen(false)
                setIsDeleting(true)
              }}
            >
              <input type="hidden" name="id" value={id} />
              <DeleteButton />
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
