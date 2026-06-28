import { Suspense } from 'react'
import { Sidebar } from '@/components/chat/sidebar'
import { SidebarSkeleton } from '@/components/chat/sidebar-skeleton'
import { ChatLayout } from '@/components/chat/chat-layout'

export default function ChatRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatLayout
      sidebar={
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
      }
    >
      {children}
    </ChatLayout>
  )
}