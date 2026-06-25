import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "@/lib/env";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId:     GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
    }),
  ],

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },

  session: { strategy: "jwt" },
};
