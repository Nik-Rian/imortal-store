import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { createProduct } from "@/actions/product.actions";
import { getDrops } from "@/services/drop.service";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";

export default async function NewProductPage() {
  const drops = await getDrops();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight uppercase">Novo Produto</h1>
          <p className="text-sm text-muted-foreground">
            Adicione um novo item ao catálogo da loja.
          </p>
        </div>
        <Button render={<Link href="/admin/produtos" />} variant="outline" size="sm">
          <ArrowLeftIcon className="mr-1.5 size-4" />
          Voltar
        </Button>
      </div>

      <ProductForm action={createProduct} drops={drops} />
    </div>
  );
}


