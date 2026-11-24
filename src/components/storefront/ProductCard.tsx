import type { Listing } from "@/lib/listings";
import { cn, formatPrice } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

interface ProductCardProps {
  listing: Listing;
}

export function ProductCard({ listing }: ProductCardProps) {
  const isClosed = listing.state === "CLOSED";

  return (
    <Link
      href={listing.href}
      className="group overflow-hidden border-2 border-black bg-white transition-all duration-300 hover:-translate-y-2 hover:shadow-[10px_10px_0px_#f97316]"
    >
      <div className="relative aspect-4/5 overflow-hidden border-b-2 border-black bg-zinc-100">
        <Image
          src={listing.imageUrl}
          alt={listing.title}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className={cn(
            "object-cover transition-transform duration-500 group-hover:scale-105",
            isClosed && "opacity-60 grayscale",
          )}
        />

        {isClosed && (
          <div className="absolute top-2 right-2 border-2 border-black bg-zinc-900 px-2 py-1 text-xs font-black tracking-widest text-white uppercase">
            Vendas Encerradas
          </div>
        )}
      </div>

      <div className="space-y-4 p-6">
        <h3 className="text-2xl leading-tight font-black uppercase">
          {listing.title}
        </h3>

        <div className="flex items-end justify-between">
          <span className="text-2xl font-black text-orange-500">
            {formatPrice(listing.priceCents)}
          </span>

          <span className="font-bold tracking-widest uppercase transition-transform group-hover:translate-x-1">
            Ver →
          </span>
        </div>
      </div>
    </Link>
  );
}
