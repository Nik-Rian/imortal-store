import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LogoutButton } from "@/components/admin/LogoutButton";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen w-full bg-zinc-50">
      <aside className="flex w-64 flex-col bg-zinc-900 text-zinc-50">
        <div className="p-6">
          <Link
            href="/admin"
            className="text-xl font-bold tracking-tight transition-colors hover:text-zinc-300"
          >
            Imortal Admin
          </Link>
        </div>

        <nav className="flex-1 space-y-2 px-4">
          <Link
            href="/admin"
            className="block rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/produtos"
            className="block rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800"
          >
            Produtos
          </Link>
          <Link
            href="/admin/usuarios"
            className="block rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800"
          >
            Usuários
          </Link>
        </nav>

        <div className="space-y-3 border-t border-zinc-800 p-4">
          <p className="truncate text-xs text-zinc-500">{session.user.email}</p>
          <LogoutButton />
          <Link
            href="/"
            className="flex items-center text-sm text-zinc-400 transition-colors hover:text-zinc-50"
          >
            &larr; Voltar para a Loja
          </Link>
        </div>
      </aside>

      <div className="flex w-full min-w-0 flex-col">
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
