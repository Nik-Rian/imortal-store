import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductGallery } from "@/components/ProductGallery";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ProductPage({ params }: Props) {
  //Await the params to extract the slug (Next.js 15 standard)
  const { slug } = await params;

  //Fetch the specific product using the unique slug
  const product = await prisma.product.findUnique({
    where: { slug },
  });

  //If the slug doesn't match any product, trigger a 404 page
  if (!product) {
    notFound();
  }

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      {/* Breadcrumb / Back Link */}
      <Link 
        href="/" 
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-8 inline-block transition-colors"
      >
        &larr; Voltar para a loja
      </Link>

      <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
        {/* Left Column: Product Gallery */}
        <ProductGallery images={product.images} productName={product.name} />
        
        {/* Right Column: Product Details */}
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {product.name}
          </h1>
          <p className="mt-4 text-2xl font-medium text-zinc-900 dark:text-zinc-100">
            {formatPrice(product.price)}
          </p>

          <div className="mt-6">
            <h3 className="sr-only">Descrição</h3>
            <p className="text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {product.description}
            </p>
          </div>

          <div className="mt-8 flex gap-4">
            {/* Dummy Add to Cart Button (We'll wire this up in a future phase) */}
            <button className="flex-1 rounded-md bg-zinc-900 px-8 py-3 text-base font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors">
              Adicionar ao Carrinho
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}