'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import { Menu01Icon } from '@hugeicons/core-free-icons'
import { useSidebar } from './chat-layout'

export function MobileSidebarTrigger() {
  const sidebar = useSidebar()
  if (!sidebar) return null

  return (
    <button
      type="button"
      onClick={() => sidebar.setOpen(true)}
      className="md:hidden absolute top-2 left-2 z-30 p-2 rounded hover:bg-accent"
      aria-label="打开侧边栏"
    >
      <HugeiconsIcon icon={Menu01Icon} size={20} />
    </button>
  )
}
