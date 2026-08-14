// src/components/cart/AddToCartButton.tsx

"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

interface Variant {
  id: string;
  size: string;
  sortOrder?: number;
}

interface AddToCartButtonProps {
  product: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    images: string[];
    variants?: Variant[];
  };
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  const hasVariants = Boolean(product.variants && product.variants.length > 0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants ? (product.variants?.[0]?.id ?? null) : null,
  );

  const handleIncrement = () => setQuantity((prev) => prev + 1);
  const handleDecrement = () =>
    setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const handleAddToCart = () => {
    const selectedVariant = product.variants?.find(
      (v) => v.id === selectedVariantId,
    );

    if (hasVariants && !selectedVariant) {
      toast.error("Por favor, selecione um tamanho.");
      return;
    }

    const itemKey = selectedVariant
      ? `${product.id}:${selectedVariant.id}`
      : product.id;

    addItem(
      {
        id: itemKey,
        productId: product.id,
        variantId: selectedVariant?.id,
        size: selectedVariant?.size,
        name: product.name,
        slug: product.slug,
        priceCents: product.priceCents,
        image: product.images[0] || "/placeholder.png",
      },
      quantity,
    );

    // Reset quantity selector to 1 after adding
    setQuantity(1);

    const variantMessage = selectedVariant ? ` (${selectedVariant.size})` : "";
    toast.success(`${product.name}${variantMessage} adicionado ao carrinho!`);
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Size Selector (rendered only if product has variants) */}
      {hasVariants && product.variants && (
        <div className="space-y-2">
          <label className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Tamanho
          </label>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((variant) => {
              const isSelected = variant.id === selectedVariantId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={`
                    h-11 min-w-11 px-4 text-sm font-extrabold uppercase rounded-md border-2 transition-all cursor-pointer
                    ${
                      isSelected
                        ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                        : "border-zinc-300 dark:border-zinc-700 bg-background text-foreground hover:border-zinc-400 dark:hover:border-zinc-500"
                    }
                  `}
                >
                  {variant.size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity & Add to Cart Action Row */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
        {/* Quantity Selector */}
        <div className="flex items-center border border-input rounded-md w-fit bg-background">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDecrement}
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
            onClick={handleIncrement}
            className="h-10 w-10 rounded-l-none"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Add to Cart Button */}
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
