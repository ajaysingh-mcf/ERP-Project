import Link from "next/link"
import { auth } from "@/lib/auth"

export default async function UnauthorizedPage() {
  const session = await auth()

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-10 w-full max-w-sm text-center">
        <h1 className="text-xl font-bold text-zinc-100 mb-2">No Access</h1>
        <p className="text-zinc-400 text-sm mb-1">
          {session?.user?.name && `Hi ${session.user.name} —`} you don&apos;t
          have permission to view this page.
        </p>
        <p className="text-zinc-500 text-xs mb-8">
          Contact your administrator if you need access.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium px-5 py-2.5 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  )
}
