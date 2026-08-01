"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Package,
  Ruler,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL, products, type Product } from "@/data/products";
import { useCart } from "@/context/CartContext";

function Gallery({ product }: { product: Product }) {
  const [active, setActive] = useState(0);
  const photo = product.photos[active] ?? product.photos[0]!;

  return (
    <div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
      <div className="relative flex-1 overflow-hidden rounded-lg border border-border bg-surface">
        <img
          key={photo.src}
          src={photo.src}
          alt={`${product.name} — ${photo.label}`}
          width={912}
          height={1104}
          className="aspect-4/5 w-full object-cover"
        />
        <span className="absolute bottom-3 left-3 rounded-sm border border-border bg-background/80 px-3 py-1.5 font-[family-name:var(--font-display)] text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase backdrop-blur-sm">
          {photo.label}
        </span>
      </div>

      <div className="flex gap-3 lg:flex-col">
        {product.photos.map((p, i) => (
          <button
            key={p.src}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Ver foto: ${p.label}`}
            aria-pressed={i === active}
            className={cn(
              "h-24 w-20 shrink-0 cursor-pointer overflow-hidden rounded-md border transition-colors",
              i === active
                ? "border-primary"
                : "border-border hover:border-primary/50"
            )}
          >
            <img
              src={p.src}
              alt={p.label}
              loading="lazy"
              width={912}
              height={1104}
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProductDetailView({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [size, setSize] = useState(product.sizes[2] ?? "M");
  const related = products.filter((p) => p.id !== product.id).slice(0, 3);

  const handleAddToCart = () => {
    addItem(
      {
        id: product.id,
        name: product.name,
        slug: product.slug || product.id,
        priceCents: Math.round(product.price * 100),
        image: product.image,
        size: size,
      },
      1
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 md:py-14">
      <Link
        href="/#colecao"
        className="inline-flex items-center gap-2 text-xs tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" /> Voltar para a coleção
      </Link>

      <div className="mt-8 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <Gallery product={product} />

        <div>
          <p className="text-kicker">
            {product.line} · {product.code}
          </p>
          <h1 className="leading-1.05 mt-3 text-4xl font-bold uppercase sm:text-5xl">
            {product.name}
          </h1>
          {product.tag && (
            <span className="mt-4 inline-block rounded-sm bg-primary px-2.5 py-1 font-[family-name:var(--font-display)] text-[0.7rem] font-semibold tracking-[0.16em] text-primary-foreground uppercase">
              {product.tag}
            </span>
          )}

          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            {product.story}
          </p>

          <p className="mt-8 font-[family-name:var(--font-display)] text-4xl font-bold text-primary">
            {formatBRL(product.price)}
          </p>
          <p className="mt-1 text-xs tracking-[0.18em] text-muted-foreground uppercase">
            ou 3x de {formatBRL(product.price / 3)} sem juros
          </p>

          <div className="mt-8">
            <div className="flex items-center justify-between">
              <p className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] uppercase">
                Tamanho
              </p>
              <Link
                href="/#tabela"
                className="inline-flex items-center gap-1.5 text-xs tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-primary"
              >
                <Ruler className="size-3.5" /> Tabela de medidas
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  aria-pressed={size === s}
                  className={cn(
                    "h-11 min-w-14 cursor-pointer rounded-md border px-3 font-[family-name:var(--font-display)] text-sm font-semibold uppercase transition-colors",
                    size === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="ember"
            size="xl"
            className="mt-8 w-full"
            onClick={handleAddToCart}
          >
            <ShoppingBag className="size-4" /> Adicionar à sacola · Tam. {size}
          </Button>

          <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
            <div className="flex items-start gap-3 bg-surface p-4">
              <Package className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Produção sob demanda: pronta em até 15 dias após o fechamento do
                lote.
              </p>
            </div>
            <div className="flex items-start gap-3 bg-surface p-4">
              <Truck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Retirada no centro acadêmico ou entrega combinada pelo
                Instagram.
              </p>
            </div>
          </div>

          <ul className="mt-8 space-y-2.5">
            {product.highlights.map((h) => (
              <li
                key={h}
                className="flex items-start gap-3 text-sm text-muted-foreground"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="mt-20 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
        <div className="bg-surface p-8">
          <h2 className="text-lg font-bold tracking-[0.08em] uppercase">
            Ficha técnica
          </h2>
          <dl className="mt-6 space-y-4">
            {product.specs.map((s) => (
              <div
                key={s.label}
                className="flex flex-wrap justify-between gap-2 border-b border-border pb-3"
              >
                <dt className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                  {s.label}
                </dt>
                <dd className="text-sm">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="bg-surface p-8">
          <h2 className="text-lg font-bold tracking-[0.08em] uppercase">
            Cuidados
          </h2>
          <ul className="mt-6 space-y-3">
            {product.care.map((c) => (
              <li
                key={c}
                className="flex items-start gap-3 text-sm text-muted-foreground"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-20">
        <h2 className="text-2xl font-bold uppercase">Complete o uniforme</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {related.map((p) => (
            <Link
              key={p.id}
              href={`/produto/${p.slug || p.id}`}
              className="group overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-primary/40"
            >
              <div className="aspect-4/5 overflow-hidden bg-background">
                <img
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                  width={912}
                  height={1104}
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <span className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase">
                  {p.name}
                </span>
                <span className="font-[family-name:var(--font-display)] text-sm font-bold text-primary">
                  {formatBRL(p.price)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
