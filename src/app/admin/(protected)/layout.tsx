// src/app/admin/(protected)/layout.tsx
import { LogoutButton } from "@/components/admin/LogoutButton";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.role !== "admin") {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 print:bg-white">
      <aside className="flex w-64 flex-col bg-zinc-900 text-zinc-50 print:hidden">
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
            href="/admin/pedidos"
            className="block rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-800"
          >
            Pedidos
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

      <div className="flex w-full min-w-0 flex-col print:m-0 print:p-0">
        <main className="flex-1 p-6 lg:p-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
