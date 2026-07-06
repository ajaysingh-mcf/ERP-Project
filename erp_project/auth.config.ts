import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// This config is imported by middleware.ts, which runs on the Edge runtime —
// it must not pull in "@/lib/env" (validates DB/AWS/Gmail vars too), so the
// two OAuth vars it needs are read directly from process.env here instead.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId:     required("GOOGLE_CLIENT_ID"),
      clientSecret: required("GOOGLE_CLIENT_SECRET"),
    }),
  ],

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },

  session: { strategy: "jwt" },
};
