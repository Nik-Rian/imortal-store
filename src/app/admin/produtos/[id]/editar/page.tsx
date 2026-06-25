import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductById } from "@/services/product.service";
import { updateProduct } from "@/actions/product.actions";
import { ProductForm } from "@/components/admin/ProductForm";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    notFound();
  }

  // Pre-bind the database row ID to update action
  const updateProductWithId = updateProduct.bind(null, product.id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Editar Produto</h1>
          <p className="text-zinc-500 mt-1">Altere as informações de {product.name}.</p>
        </div>
        <Link href="/admin/produtos" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
          &larr; Voltar
        </Link>
      </div>

      {/* Render the shared component with pre-filled database info */}
      <ProductForm action={updateProductWithId} initialData={product} />
    </div>
  );
}