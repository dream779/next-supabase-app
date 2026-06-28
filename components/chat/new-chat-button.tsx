'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import { useSidebar } from './chat-layout'

export function NewChatButton() {
  const sidebar = useSidebar()
  return (
    <Button
      variant="default"
      className="w-full justify-start"
      nativeButton={false}
      render={
        <Link
          href="/chat"
          onClick={() => sidebar?.setOpen(false)}
        />
      }
    >
      <HugeiconsIcon icon={Add01Icon} size={16} className="mr-2" />
      新会话
    </Button>
  )
}
