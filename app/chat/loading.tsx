export default function ChatLoading() {
  return (
    <main className="flex-1 min-w-0 h-full">
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
            <div className="text-center text-gray-400 mt-24">
              <p className="text-base">开始向你的知识库提问吧</p>
            </div>
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
