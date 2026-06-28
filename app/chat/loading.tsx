export default function ChatLoading() {
  return (
    <main className="flex-1 min-w-0 h-full">
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[60vh]">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="size-2.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="size-2.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="size-2.5 rounded-full bg-gray-400 animate-bounce" />
            </div>
            <p className="text-sm text-gray-400">正在加载消息记录...</p>
          </div>
        </div>
        <div className="border-t bg-background">
          <div className="max-w-3xl mx-auto px-4 py-4 flex gap-2">
            <div className="flex-1 bg-gray-100 rounded-xl px-4 py-2.5 h-[42px]" />
            <div className="bg-gray-200 rounded-xl px-5 py-2.5 h-[42px] w-16" />
          </div>
        </div>
      </div>
    </main>
  )
}
