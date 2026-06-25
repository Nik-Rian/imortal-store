import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductById } from "@/services/product.service";
import { updateProduct } from "@/actions/product.actions";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {

  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    notFound();
  }

  // Bind the product ID to server action so it knows which record to update
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

      <form action={updateProductWithId} className="space-y-4 bg-white p-6 border rounded-md shadow-sm">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-zinc-900">Nome do Produto</label>
          <input 
            type="text" id="name" name="name" required defaultValue={product.name}
            className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="slug" className="text-sm font-medium text-zinc-900">Slug (URL)</label>
          <input 
            type="text" id="slug" name="slug" required defaultValue={product.slug}
            className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium text-zinc-900">Descrição</label>
          <textarea 
            id="description" name="description" rows={4} defaultValue={product.description ?? ""}
            className="w-full flex rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="price" className="text-sm font-medium text-zinc-900">Preço (em centavos)</label>
          <input 
            type="number" id="price" name="price" required defaultValue={product.price}
            className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          />
        </div>

        <div className="pt-4 flex justify-end">
          <button type="submit" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2">
            Salvar Alterações
          </button>
        </div>
      </form>
    </div>
  );
}