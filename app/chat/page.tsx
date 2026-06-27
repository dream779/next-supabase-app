import Link from 'next/link'
import { ChatInterface } from './chat-interface'

export default async function ChatPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Ask your knowledge base</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/documents" className="text-gray-600 underline">
              My documents
            </Link>
            <Link href="/account" className="text-gray-600 underline">
              Account
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-gray-600 underline">
                Sign out
              </button>
            </form>
          </nav>
        </header>

        <ChatInterface />
      </div>
    </main>
  )
}