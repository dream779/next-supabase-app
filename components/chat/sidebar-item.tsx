'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { MoreVerticalIcon, Edit01Icon, Delete01Icon } from '@hugeicons/core-free-icons'
import { renameConversation, deleteConversation } from '@/app/chat/actions'
import { useSidebar } from './chat-layout'

type Props = {
  id: string
  title: string
  formattedTime: string
}

export function SidebarItem({ id, title, formattedTime }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sidebar = useSidebar()
  const isActive = pathname === `/chat/${id}`

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function commitRename() {
    const newTitle = editValue.trim()
    if (!newTitle || newTitle === title) {
      setEditing(false)
      setEditValue(title)
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', id)
      fd.set('title', newTitle)
      await renameConversation({ error: null }, fd)
      setEditing(false)
    })
  }

  async function handleDelete() {
    setConfirmDelete(false)
    await deleteConversation(id)
    window.dispatchEvent(new CustomEvent('conversation-deleted', { detail: { id } }))
    sidebar?.setOpen(false)
    if (isActive) router.push('/chat')
  }

  return (
    <div
      className={cn(
        'group relative flex items-center rounded-md hover:bg-accent',
        isActive && 'bg-accent',
      )}
    >
      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') {
              setEditing(false)
              setEditValue(title)
            }
          }}
          className="flex-1 px-3 py-2 text-sm bg-background border rounded"
        />
      ) : (
        <Link
          href={`/chat/${id}`}
          onClick={() => sidebar?.setOpen(false)}
          className="flex-1 min-w-0 px-3 py-2"
        >
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-xs text-muted-foreground">{formattedTime}</div>
        </Link>
      )}

      {!editing && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="opacity-0 group-hover:opacity-100 p-2 rounded hover:bg-accent-foreground/10"
            aria-label="会话操作"
          >
            <HugeiconsIcon icon={MoreVerticalIcon} size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onClick={() => { setEditValue(title); setEditing(true) }}>
              <HugeiconsIcon icon={Edit01Icon} size={14} className="mr-2" />
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setConfirmDelete(true)}
              className="text-destructive"
            >
              <HugeiconsIcon icon={Delete01Icon} size={14} className="mr-2" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话？</AlertDialogTitle>
            <AlertDialogDescription>
              这会删除「{title}」及其所有消息，且不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
