import Link from "next/link";
import { createProduct } from "@/actions/product.actions";

export default function NewProductPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Novo Produto</h1>
          <p className="text-zinc-500 mt-1">Adicione um novo item ao catálogo.</p>
        </div>
        <Link 
          href="/admin/produtos" 
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          &larr; Voltar
        </Link>
      </div>

      <form action={createProduct} className="space-y-4 bg-white p-6 border rounded-md shadow-sm">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-zinc-900">Nome do Produto</label>
          <input 
            type="text" 
            id="name" 
            name="name" 
            required
            className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="slug" className="text-sm font-medium text-zinc-900">Slug (URL)</label>
          <input 
            type="text" 
            id="slug" 
            name="slug" 
            required
            className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium text-zinc-900">Descrição</label>
          <textarea 
            id="description" 
            name="description" 
            rows={4}
            className="w-full flex rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="price" className="text-sm font-medium text-zinc-900">Preço (em centavos)</label>
          <input 
            type="number" 
            id="price" 
            name="price" 
            required
            className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          />
          <p className="text-xs text-zinc-500">Ex: 15000 para R$ 150,00</p>
        </div>

        <div className="pt-4 flex justify-end">
          <button 
            type="submit"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 transition-colors"
          >
            Salvar Produto
          </button>
        </div>
      </form>
    </div>
  );
}