"use client";

import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import type { DropStatus } from "@/generated/prisma/client";
import { getProductImage } from "@/lib/media";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

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
      status: DropStatus;
    } | null;
  };
  initialVariantId?: string | null;
}

export function AddToCartButton({
  product,
  initialVariantId,
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  // Sales are open only while the drop is active; the status comes from the server.
  const isDropActive = product.drop ? product.drop.status === "ACTIVE" : true;

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

  // The requested variant is honored only when it exists and is available;
  // otherwise the first available variant is preselected.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants
      ? ((
          product.variants?.find(
            (v) => v.id === initialVariantId && v.isAvailable !== false,
          ) ?? product.variants?.find((v) => v.isAvailable !== false)
        )?.id ?? null)
      : null,
  );

  // Drop Closed State UI
  if (!isDropActive) {
    return (
      <Button
        disabled
        className="w-full font-semibold tracking-wider uppercase sm:w-64"
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
        className="w-full border-red-800/50 font-semibold tracking-wider text-red-500 uppercase sm:w-64"
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
    <div className="flex w-full flex-col gap-6">
      {/* Variants Selector */}
      {hasVariants && product.variants && (
        <div className="space-y-2">
          <label className="text-sm font-bold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
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
                  className={`relative flex h-11 cursor-pointer items-center gap-2 rounded-md border-2 px-4 text-sm font-extrabold uppercase transition-all ${
                    !isAvailable
                      ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 line-through dark:border-zinc-800 dark:bg-zinc-900"
                      : isSelected
                        ? "border-orange-500 bg-orange-500/10 text-orange-600 shadow-sm dark:text-orange-500"
                        : "border-zinc-300 bg-background text-foreground hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                  } `}
                >
                  {variant.image && (
                    <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-sm">
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
          <label className="text-sm font-bold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
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
                  className={`relative h-11 min-w-11 cursor-pointer rounded-md border-2 px-4 text-sm font-extrabold uppercase transition-all ${
                    !isAvailable
                      ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 line-through dark:border-zinc-800 dark:bg-zinc-900"
                      : isSelected
                        ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                        : "border-zinc-300 bg-background text-foreground hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                  } `}
                >
                  {size.size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity & Action */}
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
        <div className="flex w-fit items-center rounded-md border border-input bg-background">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setQuantity((prev) => (prev > 1 ? prev - 1 : 1))}
            disabled={quantity <= 1}
            className="h-10 w-10 rounded-r-none"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-sm font-medium select-none">
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
          className="w-full gap-2 text-base font-semibold sm:w-64"
          size="lg"
        >
          <ShoppingBag className="h-5 w-5" />
          Adicionar ao Carrinho
        </Button>
      </div>
    </div>
  );
}
