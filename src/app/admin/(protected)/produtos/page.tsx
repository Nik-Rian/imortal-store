// src/app/admin/(protected)/produtos/page.tsx
import Link from "next/link";
import { getProducts } from "@/services/product.service";
import { formatPrice } from "@/lib/utils";
import { DeleteProductButton } from "@/components/admin/DeleteProductButton";

export default async function AdminProductsPage() {
  const products = await getProducts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produtos</h1>
          <p className="mt-1 text-zinc-500">Gerencie o catálogo da sua loja.</p>
        </div>
        <Link
          href="/admin/produtos/novo"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-900/90"
        >
          + Novo Produto
        </Link>
      </div>

      <div className="overflow-hidden rounded-md border bg-white shadow-sm">
        <table className="w-full text-left text-sm text-zinc-600">
          <thead className="border-b bg-zinc-50 font-medium text-zinc-900">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Drop</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Nenhum produto encontrado.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr
                  key={product.id}
                  className="transition-colors hover:bg-zinc-50"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {product.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800">
                      {product.drop?.name ?? "Sem drop"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{product.slug}</td>
                  <td className="px-4 py-3">
                    {formatPrice(product.priceCents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex h-5 items-center justify-end gap-4">
                      <Link
                        href={`/admin/produtos/${product.id}/editar`}
                        className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-800"
                      >
                        Editar
                      </Link>
                      <div className="h-4 border-l border-zinc-200" />
                      <DeleteProductButton productId={product.id} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
