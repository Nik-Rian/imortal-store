import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function HomePage() {
  // 1. Fetch all products from the database on the server
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });

  // 2. Helper to format price from cents to BRL (since your routes are /loja and /produto)
  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-8">
        Lançamentos
      </h1>
      
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Link 
            key={product.id}
            href={`/produto/${product.slug}`} 
            className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
          >
            {/* Image Container */}
            <div className="aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-900">
              <img
                src={product.images[0]}
                alt={product.name}
                className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            
            {/* Product Details */}
            <div className="flex flex-col p-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {product.name}
              </h2>
              <p className="mt-1 font-medium text-zinc-600 dark:text-zinc-400">
                {formatPrice(product.price)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}