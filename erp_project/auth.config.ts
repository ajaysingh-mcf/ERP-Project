import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// This config is imported by proxy.ts, which Amplify Hosting runs as an
// isolated compute unit that does not receive the app's environment
// variables (a known Amplify limitation, independent of Node vs Edge
// runtime). proxy.ts only decodes an already-issued session JWT — it never
// performs the OAuth handshake — so falling back to an empty string here is
// safe: the real handshake happens in lib/auth.ts's NextAuth handlers, which
// run as a normal Next.js route and do receive real env vars.
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },

  session: { strategy: "jwt" },
};
