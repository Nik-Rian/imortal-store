import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { createProduct } from "@/actions/product.actions";

export default function NewProductPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Produto</h1>
          <p className="text-zinc-500 mt-1">Adicione um novo item ao catálogo.</p>
        </div>
        <Link href="/admin/produtos" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
          &larr; Voltar
        </Link>
      </div>

      <ProductForm action={createProduct} />
    </div>
  );
}