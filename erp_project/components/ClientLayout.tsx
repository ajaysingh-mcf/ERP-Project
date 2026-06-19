"use client"

import { usePathname } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import TopBar from "@/components/TopBar"
import { ToastProvider } from "@/components/ui/toast"

interface Props {
  children: React.ReactNode
  user?: { name?: string | null; email?: string | null }
}

const AUTH_ROUTES = ["/auth/"]

export default function ClientLayout({ children, user }: Props) {
  const pathname = usePathname()
  const isAuthPage = AUTH_ROUTES.some(r => pathname.startsWith(r))

  if (isAuthPage) return <>{children}</>

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar user={user} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
