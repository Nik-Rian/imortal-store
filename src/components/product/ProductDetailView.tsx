"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckIcon,
  PackageIcon,
  RulerIcon,
  ShoppingBagIcon,
  TruckIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn, formatPrice } from "@/lib/utils";
import { Product, ProductSpec } from "@/types";
import { useCart } from "@/context/CartContext";

function Gallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  const photo = images[active] ?? images[0] ?? "/placeholder.png";

  return (
    <div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
      <div className="relative flex-1 overflow-hidden rounded-lg border border-border bg-surface">
        <img
          key={photo}
          src={photo}
          alt={`${name} — Imagem ${active + 1}`}
          width={912}
          height={1104}
          className="aspect-4/5 w-full object-cover"
        />
        <span className="absolute bottom-3 left-3 rounded-sm border border-border bg-background/80 px-3 py-1.5 font-display text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase backdrop-blur-sm">
          Foto {active + 1} de {images.length}
        </span>
      </div>

      {images.length > 1 && (
        <div className="flex gap-3 lg:flex-col">
          {images.map((imgUrl, i) => (
            <button
              key={imgUrl}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-pressed={i === active}
              className={cn(
                "h-24 w-20 shrink-0 cursor-pointer overflow-hidden rounded-md border transition-colors",
                i === active
                  ? "border-primary"
                  : "border-border hover:border-primary/50"
              )}
            >
              <img
                src={imgUrl}
                alt={`Miniatura ${i + 1}`}
                loading="lazy"
                width={912}
                height={1104}
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductDetailView({ product }: { product: Product }) {
  const { addItem } = useCart();

  const availableSizes =
    product.variants && product.variants.length > 0
      ? product.variants.map((v) => v.size)
      : ["PP", "P", "M", "G", "GG", "XG"];

  const [selectedSize, setSelectedSize] = useState(
    availableSizes[0] ?? "M"
  );

  const images =
    product.images && product.images.length > 0
      ? product.images
      : ["/placeholder.png"];

  const specs: ProductSpec[] = Array.isArray(product.specs)
    ? (product.specs as ProductSpec[])
    : [];

  const highlights = product.highlights ?? [];
  const care = product.care ?? [];
  const priceCents = product.priceCents ?? 0;

  const handleAddToCart = () => {
    addItem(
      {
        id: product.id,
        name: product.name,
        slug: product.slug,
        priceCents: priceCents,
        image: images[0] || "/placeholder.png",
        size: selectedSize,
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
        <ArrowLeftIcon className="size-4" /> Voltar para a coleção
      </Link>

      <div className="mt-8 grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <Gallery images={images} name={product.name} />

        <div>
          {(product.line || product.code) && (
            <p className="font-display text-xs tracking-[0.18em] text-muted-foreground uppercase">
              {[product.line, product.code].filter(Boolean).join(" · ")}
            </p>
          )}

          <h1 className="leading-1.05 mt-2 text-4xl font-bold uppercase sm:text-5xl">
            {product.name}
          </h1>

          {product.tag && (
            <span className="mt-4 inline-block rounded-sm bg-primary px-2.5 py-1 font-display text-[0.7rem] font-semibold tracking-[0.16em] text-primary-foreground uppercase">
              {product.tag}
            </span>
          )}

          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            {product.description}
          </p>

          {product.story && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground/90 italic border-l-2 border-primary/40 pl-3">
              {product.story}
            </p>
          )}

          <p className="mt-8 font-display text-4xl font-bold text-primary">
            {formatPrice(priceCents)}
          </p>
          <p className="mt-1 text-xs tracking-[0.18em] text-muted-foreground uppercase">
            ou 3x de {formatPrice(Math.round(priceCents / 3))} sem juros
          </p>

          {/* Sizes */}
          {availableSizes.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between">
                <p className="font-display text-xs font-semibold tracking-[0.2em] uppercase">
                  Tamanho
                </p>
                <Link
                  href="/#tabela"
                  className="inline-flex items-center gap-1.5 text-xs tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-primary"
                >
                  <RulerIcon className="size-3.5" /> Tabela de medidas
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableSizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedSize(s)}
                    aria-pressed={selectedSize === s}
                    className={cn(
                      "h-11 min-w-14 cursor-pointer rounded-md border px-3 font-display text-sm font-semibold uppercase transition-colors",
                      selectedSize === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="ember"
            size="xl"
            className="mt-8 w-full"
            onClick={handleAddToCart}
          >
            <ShoppingBagIcon className="size-4" /> Adicionar à sacola · Tam. {selectedSize}
          </Button>

          <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
            <div className="flex items-start gap-3 bg-surface p-4">
              <PackageIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Produção sob demanda: pronta em até 15 dias após o fechamento do lote.
              </p>
            </div>
            <div className="flex items-start gap-3 bg-surface p-4">
              <TruckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Retirada no centro acadêmico ou entrega combinada pelo Instagram.
              </p>
            </div>
          </div>

          {highlights.length > 0 && (
            <ul className="mt-8 space-y-2.5">
              {highlights.map((h, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-sm text-muted-foreground"
                >
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {(specs.length > 0 || care.length > 0) && (
        <section className="mt-20 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
          {specs.length > 0 && (
            <div className="bg-surface p-8">
              <h2 className="text-lg font-bold tracking-[0.08em] uppercase">
                Ficha técnica
              </h2>
              <dl className="mt-6 space-y-4">
                {specs.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-3"
                  >
                    <dt className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                      {s.label}
                    </dt>
                    <dd className="text-sm font-medium text-foreground">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {care.length > 0 && (
            <div className="bg-surface p-8">
              <h2 className="text-lg font-bold tracking-[0.08em] uppercase">
                Cuidados
              </h2>
              <ul className="mt-6 space-y-3">
                {care.map((c, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-sm text-muted-foreground"
                  >
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

