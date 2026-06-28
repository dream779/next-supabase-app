export default function DocumentsLoading() {
  return (
    <main className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">我的文档</h1>

        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          <div className="h-5 w-20 bg-gray-200/70 rounded animate-pulse" />
          <div className="h-10 bg-gray-100 rounded-md" />
          <div className="h-32 bg-gray-100 rounded-md" />
          <div className="flex justify-end">
            <div className="h-9 w-24 bg-gray-200/70 rounded-md animate-pulse" />
          </div>
        </div>

        <section className="bg-white rounded-lg shadow p-6 space-y-3">
          <div className="h-5 w-32 bg-gray-200/70 rounded animate-pulse" />
          <div className="space-y-2 pt-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-3 gap-4 border-b border-gray-100 last:border-0"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-4 bg-gray-200/60 rounded animate-pulse w-1/3" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                </div>
                <div className="h-4 w-12 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
