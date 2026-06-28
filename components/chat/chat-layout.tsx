'use client'

import { useState, type ReactNode } from 'react'
import { SidebarContext } from './sidebar-context'
import { MobileSidebarTrigger } from './mobile-sidebar-trigger'
import { cn } from '@/lib/utils'

type Props = {
  sidebar: ReactNode
  children: ReactNode
}

export { useSidebar } from './sidebar-context'

export function ChatLayout({ sidebar, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <div className="flex h-[calc(100vh-3.5rem)] relative">
        {/* 桌面侧边栏 */}
        <div className="hidden md:block">{sidebar}</div>

        {/* 移动遮罩 */}
        {open && (
          <div
            className="md:hidden fixed inset-0 top-14 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
        )}

        {/* 移动抽屉 */}
        <div
          className={cn(
            'md:hidden fixed top-14 bottom-0 left-0 z-50 w-72 bg-background border-r transition-transform duration-200',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {sidebar}
        </div>

        {/* 主区域 */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <MobileSidebarTrigger />
          {children}
        </div>
      </div>
    </SidebarContext.Provider>
  )
}
