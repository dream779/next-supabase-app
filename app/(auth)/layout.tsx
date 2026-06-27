export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
      {children}
    </div>
  )
}
