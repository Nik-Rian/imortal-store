import Link from "next/link";
import { getProducts } from "@/services/product.service";
import { formatPrice } from "@/lib/utils";

export default async function LojaPage() {
  // fetch data
  const products = await getProducts();

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-7xl px-6 py-12">

        {/* HERO */}

        <section className="mb-20 border-b-4 border-orange-500 pb-10">
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-orange-500">
            IMORTAL STORE
          </p>

          <h1 className="mt-4 text-6xl font-black uppercase leading-none tracking-tight sm:text-7xl lg:text-8xl">
            DROP
            <br />
            2026
          </h1>

          <p className="mt-6 max-w-xl text-lg text-zinc-600">
            Vista as cores da Atlética IMORTAL. Peças oficiais e edições
            limitadas.
          </p>
        </section>

        {/* PRODUCTS */}

        <section>
          <div className="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
            <h2 className="text-3xl font-black uppercase tracking-wide">
              Produtos
            </h2>

            <span className="font-bold uppercase tracking-widest text-orange-500">
              {products.length} itens
            </span>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/produto/${product.slug}`}
                className="
                  group
                  overflow-hidden
                  border-2
                  border-black
                  bg-white
                  transition-all
                  duration-300
                  hover:-translate-y-2
                  hover:shadow-[10px_10px_0px_#f97316]
                "
              >
                <div className="aspect-4/5 overflow-hidden border-b-2 border-black bg-zinc-100">
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="
                      h-full
                      w-full
                      object-cover
                      transition-transform
                      duration-500
                      group-hover:scale-105
                    "
                  />
                </div>

                <div className="space-y-4 p-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-500">
                      Vestuário
                    </p>

                    <h3 className="mt-2 text-2xl font-black uppercase leading-tight">
                      {product.name}
                    </h3>
                  </div>

                  <div className="flex items-end justify-between">
                    <span className="text-2xl font-black text-orange-500">
                      {formatPrice(product.price)}
                    </span>

                    <span
                      className="
                        font-bold
                        uppercase
                        tracking-widest
                        transition-transform
                        group-hover:translate-x-1
                      "
                    >
                      Ver →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* FOOTER STRIPE */}

        <section className="mt-24 border-t-4 border-black pt-8">
          <p className="text-center text-sm font-bold uppercase tracking-[0.4em] text-zinc-400">
            IMORTAL • ATLÉTICA • ENGENHARIA • UFC
          </p>
        </section>

      </div>
    </main>
  );
}