"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { getProductImage } from "@/lib/media";

interface Size {
  id: string;
  size: string;
  isAvailable?: boolean;
}

interface Variant {
  id: string;
  name: string;
  image?: string | null;
  isAvailable?: boolean;
}

interface AddToCartButtonProps {
  product: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    images: string[];
    isAvailable?: boolean;
    hasSizes?: boolean;
    hasVariants?: boolean;
    sizes?: Size[];
    variants?: Variant[];
    drop?: {
      startsAt: Date | string;
      endsAt: Date | string;
    } | null;
  };
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  // Check drop activity window
  const now = new Date();
  const isDropActive = product.drop
    ? new Date(product.drop.startsAt) <= now &&
      new Date(product.drop.endsAt) >= now
    : true;

  // Check overall stock/availability
  const hasSizes = Boolean(
    product.hasSizes && product.sizes && product.sizes.length > 0,
  );
  const hasVariants = Boolean(
    product.hasVariants && product.variants && product.variants.length > 0,
  );

  const hasAvailableSizes = hasSizes
    ? product.sizes?.some((s) => s.isAvailable !== false)
    : true;
  const hasAvailableVariants = hasVariants
    ? product.variants?.some((v) => v.isAvailable !== false)
    : true;

  const isSoldOut =
    product.isAvailable === false ||
    (hasSizes && !hasAvailableSizes) ||
    (hasVariants && !hasAvailableVariants);

  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(
    hasSizes
      ? (product.sizes?.find((s) => s.isAvailable !== false)?.id ?? null)
      : null,
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants
      ? (product.variants?.find((v) => v.isAvailable !== false)?.id ?? null)
      : null,
  );

  // Drop Closed State UI
  if (!isDropActive) {
    return (
      <Button
        disabled
        className="w-full sm:w-64 uppercase tracking-wider font-semibold"
      >
        Vendas Encerradas
      </Button>
    );
  }

  // Sold Out State UI
  if (isSoldOut) {
    return (
      <Button
        disabled
        variant="outline"
        className="w-full sm:w-64 uppercase tracking-wider font-semibold border-red-800/50 text-red-500"
      >
        Esgotado
      </Button>
    );
  }

  const handleAddToCart = () => {
    const selectedSize = hasSizes
      ? product.sizes?.find((s) => s.id === selectedSizeId)
      : null;
    const selectedVariant = hasVariants
      ? product.variants?.find((v) => v.id === selectedVariantId)
      : null;

    if (hasSizes && !selectedSize) {
      toast.error("Por favor, selecione um tamanho.");
      return;
    }

    if (hasVariants && !selectedVariant) {
      toast.error("Por favor, selecione uma variação.");
      return;
    }

    addItem(
      {
        id: `${product.id}-${selectedSizeId ?? ""}-${selectedVariantId ?? ""}`,
        productId: product.id,
        variantId: selectedVariant?.id,
        sizeId: selectedSize?.id,
        name: product.name,
        variantName: selectedVariant?.name,
        sizeLabel: selectedSize?.size,
        slug: product.slug,
        priceCents: product.priceCents,
        image: selectedVariant?.image || getProductImage(product.images),
      },
      quantity,
    );

    setQuantity(1);

    const sizeMessage = selectedSize ? ` (${selectedSize.size})` : "";
    const variantMessage = selectedVariant ? ` - ${selectedVariant.name}` : "";
    toast.success(
      `${product.name}${sizeMessage}${variantMessage} adicionado ao carrinho!`,
    );
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Variants Selector */}
      {hasVariants && product.variants && (
        <div className="space-y-2">
          <label className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Modelo / Cor
          </label>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((variant) => {
              const isSelected = variant.id === selectedVariantId;
              const isAvailable = variant.isAvailable !== false;

              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={`
                    relative h-11 px-4 text-sm font-extrabold uppercase rounded-md border-2 transition-all cursor-pointer flex items-center gap-2
                    ${
                      !isAvailable
                        ? "border-zinc-200 bg-zinc-100 text-zinc-400 line-through cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900"
                        : isSelected
                          ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-500 shadow-sm"
                          : "border-zinc-300 dark:border-zinc-700 bg-background text-foreground hover:border-zinc-400 dark:hover:border-zinc-500"
                    }
                  `}
                >
                  {variant.image && (
                    <div className="relative w-6 h-6 rounded-sm overflow-hidden shrink-0">
                      <Image
                        src={variant.image}
                        alt={variant.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  {variant.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Size Selector */}
      {hasSizes && product.sizes && (
        <div className="space-y-2">
          <label className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Tamanho
          </label>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map((size) => {
              const isSelected = size.id === selectedSizeId;
              const isAvailable = size.isAvailable !== false;

              return (
                <button
                  key={size.id}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => setSelectedSizeId(size.id)}
                  className={`
                    relative h-11 min-w-11 px-4 text-sm font-extrabold uppercase rounded-md border-2 transition-all cursor-pointer
                    ${
                      !isAvailable
                        ? "border-zinc-200 bg-zinc-100 text-zinc-400 line-through cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900"
                        : isSelected
                          ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                          : "border-zinc-300 dark:border-zinc-700 bg-background text-foreground hover:border-zinc-400 dark:hover:border-zinc-500"
                    }
                  `}
                >
                  {size.size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity & Action */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
        <div className="flex items-center border border-input rounded-md w-fit bg-background">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setQuantity((prev) => (prev > 1 ? prev - 1 : 1))}
            disabled={quantity <= 1}
            className="h-10 w-10 rounded-r-none"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center font-medium text-sm select-none">
            {quantity}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setQuantity((prev) => prev + 1)}
            className="h-10 w-10 rounded-l-none"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <Button
          onClick={handleAddToCart}
          className="w-full sm:w-64 gap-2 text-base font-semibold"
          size="lg"
        >
          <ShoppingBag className="h-5 w-5" />
          Adicionar ao Carrinho
        </Button>
      </div>
    </div>
  );
}
