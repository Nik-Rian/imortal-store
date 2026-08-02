import { Hero } from "@/components/store/Hero";
import { ProductGrid } from "@/components/store/ProductGrid";
import { SizeTable } from "@/components/store/SizeTable";
import { Manifesto } from "@/components/store/Manifesto";
import { getProducts } from "@/services/product.service";
import { type Product } from "@/data/products";

export default async function LojaPage() {
  let dbFormattedProducts: Product[] = [];

  try {
    const dbProducts = await getProducts();
    if (dbProducts && dbProducts.length > 0) {
      dbFormattedProducts = dbProducts.map((p) => ({
        id: p.id,
        code: p.code || `IMO-${p.id.slice(0, 3).toUpperCase()}`,
        name: p.name,
        slug: p.slug,
        line: p.line || p.drop?.name || "Coleção Imortal",
        tag: p.tag || undefined,
        description: p.description,
        story: p.story || p.description,
        price: p.priceCents / 100,
        image: p.images[0] || "/placeholder.png",
        photos: (p.images && p.images.length > 0
          ? p.images
          : ["/placeholder.png"]
        ).map((img, i) => ({
          src: img,
          label: i === 0 ? "Frente" : i === 1 ? "Costas" : `Detalhe ${i}`,
        })),
        sizes:
          p.variants && p.variants.length > 0
            ? p.variants.map((v) => v.size)
            : [],
        specs: Array.isArray(p.specs)
          ? (p.specs as { label: string; value: string }[])
          : [],
        highlights: p.highlights ?? [],
        care: p.care ?? [],
      }));
    }
  } catch (error) {
    console.error("Erro ao buscar produtos do banco de dados na home:", error);
  }

  return (
    <>
      <Hero />
      <ProductGrid products={dbFormattedProducts} />
      <SizeTable />
      <Manifesto />
    </>
  );
}
