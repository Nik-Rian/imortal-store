import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductGallery } from "@/components/product/ProductGallery";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { getProductBySlug } from "@/services/product.service";
import { formatPrice } from "@/lib/utils";

// Time-based ISR fallback: revalidate product details every 1 hour (3600 seconds)
export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return {
      title: "Produto Não Encontrado | imortal-store",
    };
  }

  const mainImage = product.images[0];

  return {
    title: `${product.name} | imortal-store`,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: mainImage ? [{ url: mainImage, alt: product.name }] : [],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  // Await the params to extract the slug
  const { slug } = await params;

  // Fetch
  const product = await getProductBySlug(slug);

  // If the slug doesn't match any product, trigger a 404 page
  if (!product) {
    notFound();
  }

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
            {formatPrice(product.priceCents)}
          </p>

          <div className="mt-6">
            <h3 className="sr-only">Descrição</h3>
            <p className="text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {product.description}
            </p>
          </div>

          <div className="mt-8 flex gap-4">
            <AddToCartButton product={product} />
          </div>
        </div>
      </div>
    </main>
  );
}
