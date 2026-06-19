import { auth, signOut } from "@/lib/auth"

export default async function AppHeader() {
  const session = await auth()

  return (
    <header className="border-b border-black/10 dark:border-white/10 px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">ERP System</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Enterprise Resource Planning</p>
      </div>
      <div className="flex items-center gap-4">
        {session?.user?.name && (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {session.user.name}
          </span>
        )}
        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/auth/signin" })
          }}
        >
          <button
            type="submit"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}
