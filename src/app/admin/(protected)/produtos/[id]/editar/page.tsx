import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductById } from "@/services/product.service";
import { updateProduct } from "@/actions/product.actions";
import { ProductForm } from "@/components/admin/ProductForm";
import { getDrops } from "@/services/drop.service";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";


interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;
  const product = await getProductById(id);
  const drops = await getDrops();

  if (!product) {
    notFound();
  }

  const updateProductWithId = updateProduct.bind(null, product.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight uppercase">Editar Produto</h1>
          <p className="text-sm text-muted-foreground">
            Altere as informações de <strong className="text-foreground">{product.name}</strong>.
          </p>
        </div>
        <Button render={<Link href="/admin/produtos" />} variant="outline" size="sm">
          <ArrowLeftIcon className="mr-1.5 size-4" />
          Voltar
        </Button>
      </div>

      <ProductForm
        action={updateProductWithId}
        initialData={product}
        drops={drops}
      />
    </div>
  );
}

