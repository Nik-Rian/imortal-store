import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ProductGallery } from "@/components/product/ProductGallery";
import { getBundleGalleryImages } from "@/lib/media";
import { formatPrice } from "@/lib/utils";
import { getProductBySlug } from "@/services/product.service";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

// Rendered on every request so price and availability edits are visible
// immediately.
export const dynamic = "force-dynamic";

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

  // A bundle's carousel shows its components' images; its own uploaded image
  // stays the listing thumbnail and the link-preview image (BND-003).
  const galleryImages = product.isBundle
    ? getBundleGalleryImages(product.images, product.components)
    : product.images;

  return (
    <main className="mx-auto max-w-7xl px-4 py-12">
      {/* Breadcrumb / Back Link */}
      <Link
        href="/"
        className="mb-8 inline-block text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        &larr; Voltar para a loja
      </Link>

      <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
        {/* Left Column: Product Gallery */}
        <ProductGallery
          images={galleryImages}
          productName={product.name}
        />

        {/* Right Column: Product Details */}
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            {product.name}
          </h1>
          <p className="mt-4 text-2xl font-medium text-zinc-900 dark:text-zinc-100">
            {formatPrice(product.priceCents)}
          </p>

          <div className="mt-6">
            <h3 className="sr-only">Descrição</h3>
            <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
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
