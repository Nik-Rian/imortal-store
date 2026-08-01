import Link from "next/link";
import { getProducts } from "@/services/product.service";
import { formatPrice } from "@/lib/utils";
import { DeleteProductButton } from "@/components/admin/DeleteProductButton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PlusIcon,
  PencilSimpleIcon,
  PackageIcon,
  ImageIcon,
} from "@phosphor-icons/react";

export default async function AdminProductsPage() {
  const products = await getProducts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight uppercase">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie o catálogo e inventário da sua loja.
          </p>
        </div>
        <Button render={<Link href="/admin/produtos/novo" />} size="sm">
          <PlusIcon className="mr-1.5 size-4" />
          Novo Produto
        </Button>
      </div>

      {/* Table Card */}
      <Card className="border-border/80 bg-surface overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-12 text-center">Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Drop</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <PackageIcon className="size-8 text-muted-foreground/50" />
                      <p>Nenhum produto cadastrado até o momento.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow key={product.id} className="transition-colors hover:bg-accent/40">
                    <TableCell className="text-center">
                      {product.images && product.images.length > 0 ? (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="size-9 rounded-md border border-border object-cover bg-background"
                        />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
                          <ImageIcon className="size-4" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {product.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-border/60 bg-background/50 font-normal">
                        {product.drop?.name ?? "Sem drop"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {product.slug}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-primary">
                      {formatPrice(product.priceCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          render={<Link href={`/admin/produtos/${product.id}/editar`} />}
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-foreground"
                          title="Editar produto"
                        >
                          <PencilSimpleIcon className="size-4" />
                        </Button>
                        <DeleteProductButton productId={product.id} productName={product.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


