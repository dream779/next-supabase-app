export default function AccountLoading() {
  return (
    <main className="p-6">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-8 space-y-6">
        <div className="h-7 w-24 bg-gray-200/70 rounded animate-pulse" />

        <section className="space-y-2">
          <div className="h-3 w-20 bg-gray-200/70 rounded animate-pulse" />
          <div className="h-4 bg-gray-100 rounded animate-pulse" />
        </section>

        <section className="space-y-2">
          <div className="h-3 w-16 bg-gray-200/70 rounded animate-pulse" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-5/6" />
        </section>
      </div>
    </main>
  )
}
