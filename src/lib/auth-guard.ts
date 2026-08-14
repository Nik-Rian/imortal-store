import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface AuthGuardOptions {
  /**
   * Required role string to check against session.user.role.
   * If omitted when passing an options object, role check is skipped.
   */
  role?: string;
}

/**
 * Validates that an active user session exists and optionally enforces a required role.
 * Defaults to requiring the "admin" role for server action security.
 *
 * @param roleOrOptions Required role string, options object, or omitted (defaults to "admin")
 * @returns The authenticated session object
 * @throws Error if unauthenticated ("Não autenticado.") or unauthorized ("Não autorizado.")
 */
export async function requireSession(
  roleOrOptions: string | AuthGuardOptions = "admin",
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Não autenticado.");
  }

  const requiredRole =
    typeof roleOrOptions === "string" ? roleOrOptions : roleOrOptions.role;

  if (requiredRole && session.user.role !== requiredRole) {
    throw new Error("Não autorizado.");
  }

  return session;
}
