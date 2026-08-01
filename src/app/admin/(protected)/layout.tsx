import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  SquaresFourIcon,
  PackageIcon,
  UsersIcon,
  StorefrontIcon,
  ShieldIcon,
  ArrowLeftIcon,
} from "@phosphor-icons/react";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/admin/login");
  }

  const userInitial = session.user.name
    ? session.user.name.charAt(0).toUpperCase()
    : session.user.email.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-surface text-surface-foreground md:flex">
        {/* Brand Header */}
        <div className="flex items-center gap-3 border-b border-border/60 p-6">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-xs">
            <ShieldIcon className="size-5" />
          </div>
          <div>
            <Link
              href="/admin"
              className="font-display text-lg font-bold tracking-wider uppercase transition-colors hover:text-primary"
            >
              Imortal Admin
            </Link>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] uppercase border-primary/40 text-primary">
                v1.0
              </Badge>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 p-4">
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground group"
          >
            <SquaresFourIcon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
            <span>Dashboard</span>
          </Link>
          <Link
            href="/admin/produtos"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground group"
          >
            <PackageIcon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
            <span>Produtos</span>
          </Link>
          <Link
            href="/admin/usuarios"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground group"
          >
            <UsersIcon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
            <span>Usuários</span>
          </Link>
        </nav>

        {/* User profile & actions footer */}
        <div className="space-y-3 border-t border-border/60 p-4 bg-background/40">
          <div className="flex items-center gap-3 px-1 py-1">
            <Avatar className="size-9 border border-border">
              <AvatarFallback className="bg-primary/20 text-xs font-bold text-primary">
                {userInitial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {session.user.name || "Administrador"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {session.user.email}
              </p>
            </div>
          </div>

          <div className="space-y-1 pt-1">
            <LogoutButton />
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            >
              <ArrowLeftIcon className="size-3.5" />
              <span>Voltar para a Loja</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex w-full min-w-0 flex-col">
        {/* Mobile Header Top Navigation */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
          <Link href="/admin" className="font-display font-bold text-primary">
            IMORTAL ADMIN
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <StorefrontIcon className="size-4" />
              <span>Loja</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}


