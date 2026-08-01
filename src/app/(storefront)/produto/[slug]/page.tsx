import { notFound } from "next/navigation";
import { getProduct, products } from "@/data/products";
import { getProductBySlug } from "@/services/product.service";
import { ProductDetailView } from "@/components/product/ProductDetailView";
import { Product } from "@/types";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return products.map((p) => ({
    slug: p.slug || p.id,
  }));
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;

  let product: Product | null = null;

  // 1. Try querying Prisma database first
  try {
    const dbProduct = await getProductBySlug(slug);
    if (dbProduct) {
      product = dbProduct as Product;
    }
  } catch (error) {
    console.error("Erro ao buscar produto do banco:", error);
  }

  // 2. Fallback to static mock product dataset if not found in database
  if (!product) {
    const mockProduct = getProduct(slug);
    if (mockProduct) {
      product = {
        id: mockProduct.id,
        code: mockProduct.code,
        name: mockProduct.name,
        slug: mockProduct.id,
        line: mockProduct.line,
        tag: mockProduct.tag || null,
        description: mockProduct.description,
        story: mockProduct.story,
        priceCents: Math.round(mockProduct.price * 100),
        images: mockProduct.photos ? mockProduct.photos.map((p) => p.src) : [mockProduct.image],
        specs: mockProduct.specs,
        highlights: mockProduct.highlights,
        care: mockProduct.care,
        sortOrder: 0,
        dropId: "",
        createdAt: new Date(),
        updatedAt: new Date(),
        variants: mockProduct.sizes.map((s, idx) => ({
          id: `${mockProduct.id}-${s}`,
          productId: mockProduct.id,
          size: s,
          sortOrder: idx,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      };
    }
  }

  if (!product) {
    notFound();
  }

  return <ProductDetailView product={product} />;
}

