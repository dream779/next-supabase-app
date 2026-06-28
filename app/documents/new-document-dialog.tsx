'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createDocument,
  type CreateDocumentState,
} from './actions'

const initialState: CreateDocumentState = { error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} variant="default">
      {pending ? '创建中...' : '创建文档'}
    </Button>
  )
}

export function NewDocumentDialog() {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const wrappedAction = async (
    prev: CreateDocumentState,
    formData: FormData,
  ): Promise<CreateDocumentState> => {
    const result = await createDocument(prev, formData)
    if (result.success) {
      toast.success(`已创建，共 ${result.chunkCount ?? 0} 个分块`)
      setOpen(false)
      formRef.current?.reset()
    }
    return result
  }

  const [state, formAction] = useActionState(wrappedAction, initialState)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) formRef.current?.reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)}>上传文档</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建文档</DialogTitle>
          <DialogDescription>
            填写标题和内容。较长的内容会自动分块并生成向量。
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">标题</Label>
            <Input
              id="title"
              name="title"
              type="text"
              required
              maxLength={200}
              placeholder="我的知识笔记"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">内容</Label>
            <textarea
              id="content"
              name="content"
              required
              rows={8}
              className="w-full border border-input rounded-md px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
              placeholder="在此粘贴或输入内容。较长的内容会自动分块。"
            />
          </div>

          {state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <SubmitButton />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
