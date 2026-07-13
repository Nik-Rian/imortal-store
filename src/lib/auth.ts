import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // No public sign-up route exists anywhere in the app — accounts are only
    // created via scripts/create-admin.ts or the in-app Usuários page.
    autoSignIn: false, //creating a user shouldn't log the creator out of their own session
  },
  plugins: [nextCookies()], // must be last — propagates Set-Cookie from Server Actions
});