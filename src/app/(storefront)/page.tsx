import { ProductCard } from "@/components/storefront/ProductCard";
import { buildListings } from "@/lib/listings";
import { getStorefrontDrop } from "@/services/drop.service";
import { getStorefrontProducts } from "@/services/product.service";

// Rendered on every request so prices, availability and the closed-sales
// state always reflect the database.
export const dynamic = "force-dynamic";

export default async function LojaPage() {
  const [drop, products] = await Promise.all([
    getStorefrontDrop(),
    getStorefrontProducts(),
  ]);

  if (!drop) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-zinc-50 px-6 text-zinc-900">
        <div className="w-full max-w-xl border-4 border-black bg-white p-8 text-center shadow-[10px_10px_0px_#f97316]">
          <p className="text-sm font-black tracking-[0.25em] text-orange-500 uppercase">
            IMORTAL STORE
          </p>
          <h1 className="mt-4 text-4xl leading-tight font-black tracking-tight uppercase">
            Aguarde o próximo semestre
          </h1>
          <p className="mt-4 font-medium text-zinc-600">
            No momento não há nenhum drop disponível. Volte em breve para
            conferir as novidades da Atlética IMORTAL.
          </p>
        </div>
      </div>
    );
  }

  // Sales read as closed once every listing of the active drop is closed.
  const isSalesClosed =
    products.length > 0 && products.every((product) => !product.isAvailable);

  const listings = buildListings(products);
  const kitListings = listings.filter((listing) => listing.group === "BUNDLES");
  const productListings = listings.filter(
    (listing) => listing.group === "PRODUCTS",
  );
  const sections = [
    ...(kitListings.length > 0
      ? [{ id: "kits", title: "Kits", listings: kitListings }]
      : []),
    { id: "products", title: "Produtos", listings: productListings },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* HERO */}

        <section className="mb-20 border-b-4 border-orange-500 pb-10">
          <p className="text-sm font-bold tracking-[0.35em] text-orange-500 uppercase">
            IMORTAL STORE
          </p>

          <h1 className="mt-4 text-6xl leading-none font-black tracking-tight uppercase sm:text-7xl lg:text-8xl">
            DROP
            <br />
            2026
          </h1>

          <p className="mt-6 max-w-xl text-lg text-zinc-600">
            Vista as cores da Atlética IMORTAL. Peças oficiais e edições
            limitadas.
          </p>

          {isSalesClosed && (
            <p className="mt-6 inline-block border-2 border-black bg-zinc-900 px-4 py-2 text-sm font-black tracking-widest text-white uppercase">
              Vendas encerradas
            </p>
          )}
        </section>

        {/* LISTINGS */}

        <div className="space-y-16">
          {sections.map((section) => (
            <section key={section.id}>
              <div className="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
                <h2 className="text-3xl font-black tracking-wide uppercase">
                  {section.title}
                </h2>

                <span className="font-bold tracking-widest text-orange-500 uppercase">
                  {section.listings.length} itens
                </span>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {section.listings.map((listing) => (
                  <ProductCard
                    key={listing.key}
                    listing={listing}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-24 border-t-4 border-black pt-8">
          <p className="text-center text-sm font-bold tracking-[0.4em] text-zinc-400 uppercase">
            IMORTAL • ATLÉTICA • ENGENHARIA • UFC
          </p>
        </section>
      </div>
    </main>
  );
}
