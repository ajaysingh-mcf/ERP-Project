import Link from "next/link"

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const message =
    params.error === "AccessDenied"
      ? "Your Google account is not authorised to access this system. Contact your administrator."
      : "An authentication error occurred. Please try again."

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="rounded-2xl border border-rose-800 bg-zinc-900 p-10 w-full max-w-sm text-center">
        <h1 className="text-xl font-bold text-rose-400 mb-3">Access Denied</h1>
        <p className="text-zinc-400 text-sm mb-8">{message}</p>
        <Link
          href="/auth/signin"
          className="text-sm text-zinc-300 underline underline-offset-4 hover:text-white"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
