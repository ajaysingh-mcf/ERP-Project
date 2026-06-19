import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"
import { v4 as uuidv4 } from "uuid"
import { query, execute } from "@/lib/db"
import { auth as authSql } from "@/lib/queries/auth"

type DbUser = { id: number; name: string; email: string; status: string | null }
type DbSession = { id: number; session_id: string; user_id: number }

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ user }) {
      console.log("[AUTH] signIn attempt for email:", user.email)
      const rows = await query<DbUser>(authSql.getUserByEmail, [user.email!])
      const dbUser = rows[0] ?? null
      console.log("[AUTH] dbUser found:", dbUser ? `id=${dbUser.id} status=${dbUser.status}` : "NOT FOUND")
      if (!dbUser || dbUser.status === "inactive") return false
      return true
    },

    async jwt({ token, user, trigger }) {
      if (user || trigger === "signIn") {
        const userRows = await query<DbUser>(authSql.getUserIdByEmail, [token.email!])
        const dbUser = userRows[0] ?? null
        if (dbUser) {
          token.userId = dbUser.id
          const roleRows = await query<{ role: string }>(authSql.getUserRoles, [dbUser.id])
          token.roles = roleRows.map((r) => r.role)
        }
      }
      return token
    },

    async session({ session, token }) {
      if (token.userId != null) session.user.id = String(token.userId)
      session.user.roles = token.roles ?? []
      return session
    },
  },

  events: {
    async signIn({ user }) {
      const rows = await query<DbUser>(authSql.getUserIdByEmail, [user.email!])
      const dbUser = rows[0] ?? null
      if (!dbUser) return
      const sessionId = uuidv4()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      await execute(authSql.insertSession, [sessionId, dbUser.id, "google-oauth-jwt", expiresAt, true])
      await execute(authSql.insertSessionHistory, [sessionId, dbUser.id, "login"])
    },

    async signOut(message) {
      if (!("token" in message) || !message.token?.userId) return
      const userId = message.token.userId as number
      const rows = await query<DbSession>(authSql.getActiveSession, [userId])
      const latest = rows[0] ?? null
      if (!latest) return
      await execute(authSql.deactivateSession, [latest.id])
      await execute(authSql.insertSessionHistory, [latest.session_id, userId, "logout"])
    },
  },
})
