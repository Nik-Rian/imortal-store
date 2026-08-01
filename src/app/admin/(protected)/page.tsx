import Link from "next/link";
import { getProducts } from "@/services/product.service";
import { getDrops } from "@/services/drop.service";
import { getUsers } from "@/services/user.service";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

import {
  PackageIcon,
  StackIcon,
  UsersIcon,
  PlusIcon,
  UserPlusIcon,
  ArrowUpRightIcon,
  ShoppingBagIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";


export default async function AdminDashboardPage() {
  const [products, drops, users] = await Promise.all([
    getProducts(),
    getDrops(),
    getUsers(),
  ]);

  const recentProducts = products.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight uppercase">
            Painel Administrativo
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do catálogo, usuários e estatísticas da imortal-store.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button render={<Link href="/admin/produtos/novo" />} size="sm">
            <PlusIcon className="mr-1.5 size-4" />
            Novo Produto
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Products */}
        <Card className="border-border/60 bg-surface/60 transition-colors hover:border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total de Produtos
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <PackageIcon className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold">{products.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastrados no catálogo
            </p>
          </CardContent>
        </Card>

        {/* Drops */}
        <Card className="border-border/60 bg-surface/60 transition-colors hover:border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Drops Ativos
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <StackIcon className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold">{drops.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Coleções no banco de dados
            </p>
          </CardContent>
        </Card>

        {/* Administrators */}
        <Card className="border-border/60 bg-surface/60 transition-colors hover:border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Administradores
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <UsersIcon className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold">{users.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Contas de acesso ao painel
            </p>
          </CardContent>
        </Card>

        {/* Store Status */}
        <Card className="border-border/60 bg-surface/60 transition-colors hover:border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Status da Loja
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
              <TrendUpIcon className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="font-display text-lg font-bold text-emerald-400">Online</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              E-commerce operacional
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Quick Actions & Recent Products */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Products List */}
        <Card className="lg:col-span-2 border-border/80 bg-surface">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-display text-lg font-bold">Últimos Produtos</CardTitle>
              <CardDescription className="text-xs">
                Produtos cadastrados recentemente
              </CardDescription>
            </div>
            <Button render={<Link href="/admin/produtos" />} variant="ghost" size="sm" className="gap-1 text-xs text-primary">
              <span>Ver Todos</span>
              <ArrowUpRightIcon className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum produto cadastrado até o momento.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {recentProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between py-3 transition-colors hover:bg-accent/30 rounded-md px-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {product.images && product.images.length > 0 ? (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="size-10 rounded-md border border-border object-cover bg-background"
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                          <ShoppingBagIcon className="size-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {product.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {product.drop?.name ?? "Sem drop"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm font-semibold text-primary">
                        {formatPrice(product.priceCents)}
                      </span>
                      <Button
                        render={<Link href={`/admin/produtos/${product.id}/editar`} />}
                        variant="outline"
                        size="xs"
                      >
                        Editar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions Panel */}
        <Card className="border-border/80 bg-surface">
          <CardHeader>
            <CardTitle className="font-display text-lg font-bold">Ações Rápidas</CardTitle>
            <CardDescription className="text-xs">
              Atalhos para tarefas administrativas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/admin/produtos/novo"
              className="flex items-center gap-3 rounded-lg border border-border/80 bg-background/50 p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 group"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <PlusIcon className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Adicionar Produto</p>
                <p className="text-xs text-muted-foreground">Cadastrar novo item no catálogo</p>
              </div>
            </Link>

            <Link
              href="/admin/usuarios/novo"
              className="flex items-center gap-3 rounded-lg border border-border/80 bg-background/50 p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 group"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <UserPlusIcon className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Novo Administrador</p>
                <p className="text-xs text-muted-foreground">Conceder acesso de gestão</p>
              </div>
            </Link>

            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-3 rounded-lg border border-border/80 bg-background/50 p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 group"
            >
              <div className="flex size-9 items-center justify-center rounded-md bg-accent text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <ArrowUpRightIcon className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Visualizar Loja</p>
                <p className="text-xs text-muted-foreground">Abrir vitrine pública em nova aba</p>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


