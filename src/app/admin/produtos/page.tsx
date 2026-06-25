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
          <p className="text-zinc-500 mt-1">Gerencie o catálogo da sua loja.</p>
        </div>
        <Link 
          href="/admin/produtos/novo" 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 transition-colors"
        >
          + Novo Produto
        </Link>
      </div>

      <div className="border rounded-md bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left text-zinc-600">
          <thead className="bg-zinc-50 text-zinc-900 font-medium border-b">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  Nenhum produto encontrado.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-zinc-900">{product.name}</td>
                  <td className="px-4 py-3">{product.slug}</td>
                  <td className="px-4 py-3">{formatPrice(product.price)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-4 h-5">
                      <Link 
                        href={`/admin/produtos/${product.id}/editar`} 
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Editar
                      </Link>
                      <div className="border-l border-zinc-200 h-4" />
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