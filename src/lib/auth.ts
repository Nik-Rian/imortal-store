import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  rateLimit: {
    enabled: true,
    storage: "database",
  },
  emailAndPassword: {
    enabled: true,
    // Public sign-up is closed. Admins are created with the admin plugin's
    // createUser (Usuários page, scripts/create-admin.ts), never via sign-up.
    disableSignUp: true,
    autoSignIn: false,
  },
  plugins: [
    admin({
      defaultRole: "user",
    }),
    nextCookies(), // must be last — propagates Set-Cookie from Server Actions
  ],
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? [process.env.BETTER_AUTH_URL]
    : [],
});
