export function SidebarSkeleton() {
  return (
    <aside
      aria-hidden
      className="flex flex-col h-full w-full md:w-64 border-r bg-gray-50/50"
    >
      <div className="p-3">
        <div className="h-9 w-full rounded-md bg-gray-200/70 animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="h-[52px] rounded-md bg-gray-200/60 animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </aside>
  )
}