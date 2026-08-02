import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import {
  formatBRL,
  products as defaultProducts,
  type Product,
} from "@/data/products";


function ProductCard({ product }: { product: Product }) {
  const productHref = `/produto/${product.slug || product.id}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-primary/40">
      <Link
        href={productHref}
        className="relative block aspect-4/5 overflow-hidden bg-background"
      >
        <img
          src={product.image}
          alt={`Camisa ${product.name} da Atlética Imortal`}
          loading="lazy"
          width={912}
          height={1104}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute top-3 left-3 rounded-sm border border-border bg-background/80 px-2 py-1 font-display text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase backdrop-blur-sm">
          {product.code}
        </span>
        {product.tag && (
          <span className="absolute top-3 right-3 rounded-sm bg-primary px-2 py-1 font-display text-sm font-bold tracking-[0.16em] text-primary-foreground uppercase">
            {product.tag}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-kicker">{product.line}</p>
        <h3 className="mt-2 text-xl font-bold uppercase">
          <Link
            href={productHref}
            className="transition-colors hover:text-primary"
          >
            {product.name}
          </Link>
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
          {product.description}
        </p>

        <p className="mt-4 text-xs tracking-[0.18em] text-muted-foreground uppercase">
          {product.photos?.length || 1} fotos · PP ao XG
        </p>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-5">
          <p className="font-display text-lg font-bold">{formatBRL(product.price)}</p>
          <Link
            href={productHref}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 font-display font-semibold text-primary-foreground uppercase transition-colors hover:bg-primary/90"
          >
            Ver peça <ArrowUpRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

interface ProductGridProps {
  products?: Product[];
}

export function ProductGrid({ products = defaultProducts }: ProductGridProps) {
  const displayProducts = products.length > 0 ? products : defaultProducts;

  return (
    <section
      id="colecao"
      className="mx-auto max-w-7xl px-5 py-20 sm:px-8 md:py-28"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-kicker">Drop 01</p>
          <h2 className="mt-3 text-4xl font-bold uppercase sm:text-5xl">
            A coleção
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Produção sob demanda com retirada no centro acadêmico. Pedidos
          fechados a cada quinzena.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {displayProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
