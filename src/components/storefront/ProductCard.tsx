import Image from "next/image";
import Link from "next/link";

interface ProductCardProps {
  slug: string;
  name: string;
  priceCents: number;
  imageUrl: string;
  isAvailable: boolean;
  isDropActive: boolean;
  variants: { isAvailable: boolean }[];
}

export function ProductCard({
  slug,
  name,
  priceCents,
  imageUrl,
  isAvailable,
  isDropActive,
  variants,
}: ProductCardProps) {
  const hasAvailableVariants = variants.some((v) => v.isAvailable);
  const isSoldOut = !isAvailable || !hasAvailableVariants;

  return (
    <Link
      href={`/produto/${slug}`}
      className="group relative block"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-900">
        <Image
          src={imageUrl}
          alt={name}
          fill
          className={`object-cover transition-transform group-hover:scale-105 ${
            isSoldOut || !isDropActive ? "opacity-60 grayscale" : ""
          }`}
        />

        {/* Status Badges */}
        {!isDropActive ? (
          <div className="absolute top-2 right-2 rounded border border-zinc-800 bg-zinc-950/90 px-2 py-1 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
            Vendas Encerradas
          </div>
        ) : isSoldOut ? (
          <div className="absolute top-2 right-2 rounded border border-red-800/50 bg-red-950/90 px-2 py-1 text-xs font-semibold tracking-wider text-red-400 uppercase">
            Esgotado
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex justify-between text-sm">
        <h3 className="font-medium text-zinc-200 transition-colors group-hover:text-amber-400">
          {name}
        </h3>
        <span className="font-bold text-zinc-100">
          {(priceCents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </span>
      </div>
    </Link>
  );
}
