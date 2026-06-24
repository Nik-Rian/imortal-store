import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function LojaPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-16">
      <div className="mb-16 text-center">
        <h1 className="text-3xl font-bold tracking-widest text-zinc-900 uppercase dark:text-zinc-50 sm:text-4xl">
          Drop Atual
        </h1>
        <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
          Disponível por tempo limitado
        </p>
      </div>
      
      {/* 3-Column Grid (lg:grid-cols-3) with balanced spacing */}
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
        {products.map((product) => (
          <Link 
            key={product.id}
            href={`/produto/${product.slug}`} 
            className="group flex flex-col overflow-hidden transition-all"
          >
            {/* Keeping the 4/5 portrait ratio for apparel */}
            <div className="aspect-4/5 overflow-hidden bg-zinc-100 dark:bg-zinc-900 rounded-sm">
              <img
                src={product.images[0]}
                alt={product.name}
                className="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
              />
            </div>
            
            <div className="flex flex-col items-center pt-6 pb-4">
              <h2 className="text-lg font-bold text-zinc-900 uppercase tracking-wide dark:text-zinc-100 text-center">
                {product.name}
              </h2>
              <p className="mt-2 text-base font-medium text-zinc-500 dark:text-zinc-400">
                {formatPrice(product.price)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}