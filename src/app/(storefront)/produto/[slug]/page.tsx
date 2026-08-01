import { notFound } from "next/navigation";
import { getProduct, products } from "@/data/products";
import { getProductBySlug } from "@/services/product.service";
import { ProductDetailView } from "@/components/product/ProductDetailView";

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

  let product = null;

  // 1. Try querying Prisma database first
  try {
    const dbProduct = await getProductBySlug(slug);
    if (dbProduct) {
      const dbSizes =
        dbProduct.variants && dbProduct.variants.length > 0
          ? dbProduct.variants.map((v) => v.size)
          : ["PP", "P", "M", "G", "GG", "XG"];

      product = {
        id: dbProduct.id,
        code: `IMR-${dbProduct.id.slice(0, 3).toUpperCase()}`,
        name: dbProduct.name,
        slug: dbProduct.slug,
        line: dbProduct.drop?.name || "Linha Guardiã",
        description: dbProduct.description,
        story: dbProduct.description,
        price: dbProduct.priceCents / 100,
        image: dbProduct.images[0] || "/placeholder.png",
        photos: (dbProduct.images && dbProduct.images.length > 0
          ? dbProduct.images
          : ["/placeholder.png"]
        ).map((img, idx) => ({
          src: img,
          label: idx === 0 ? "Frente" : idx === 1 ? "Costas" : `Detalhe ${idx}`,
        })),
        sizes: dbSizes,
        specs: [
          { label: "Material", value: "100% Algodão Penteado" },
          { label: "Modelagem", value: "Unissex" },
        ],
        highlights: ["Produto Oficial Atlética Imortal"],
        care: ["Lavar em ciclo delicado", "Secar à sombra"],
      };
    }
  } catch (error) {
    console.error("Erro ao buscar produto do banco:", error);
  }

  // 2. Fallback to static products dataset if not found in database
  if (!product) {
    product = getProduct(slug) || null;
  }

  if (!product) {
    notFound();
  }

  return <ProductDetailView product={product} />;
}
