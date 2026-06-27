import { createClient } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat/chat-interface'
import { AuthOverlay } from '@/components/auth-overlay'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthenticated = !!user

  return (
    <main className="min-h-[calc(100vh-3.5rem)] p-6">
      <div className="max-w-5xl mx-auto h-full">
        {isAuthenticated ? (
          <ChatInterface isAuthenticated />
        ) : (
          <AuthOverlay next="/">
            <ChatInterface isAuthenticated={false} />
          </AuthOverlay>
        )}
      </div>
    </main>
  )
}