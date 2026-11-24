"use client";

import {
  buildCartComponents,
  BundleSelector,
  findIncompleteComponent,
  type BundleComponentView,
  type BundleSelections,
  type ComponentSelection,
} from "@/components/product/BundleSelector";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import {
  findCombination,
  isSizePurchasable,
  isVariantPurchasable,
  type ProductAvailability,
} from "@/lib/availability";
import { getProductImage } from "@/lib/media";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

interface Size {
  id: string;
  size: string;
}

interface Variant {
  id: string;
  name: string;
  image?: string | null;
}

interface AddToCartButtonProps {
  product: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    images: string[];
    sizes: Size[];
    variants: Variant[];
  };
  availability: ProductAvailability;
  initialVariantId?: string | null;
  /** Components of a bundle with their options; empty for a plain product. */
  bundleComponents?: BundleComponentView[];
}

export function AddToCartButton({
  product,
  availability,
  initialVariantId,
  bundleComponents = [],
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  const [componentSelections, setComponentSelections] =
    useState<BundleSelections>({});
  const isBundle = bundleComponents.length > 0;

  // The server supplies only the options that apply to the product, so the
  // presence of rows decides which selectors are shown.
  const hasSizes = product.sizes.length > 0;
  const hasVariants = product.variants.length > 0;

  const firstPurchasableSizeId = (variantId: string | null) =>
    product.sizes.find((s) => isSizePurchasable(availability, variantId, s.id))
      ?.id ?? null;

  // The requested variant is honored only when it can be bought; otherwise
  // the first purchasable variant is preselected.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    () => {
      if (!hasVariants) return null;
      const requested = product.variants.find(
        (v) =>
          v.id === initialVariantId && isVariantPurchasable(availability, v.id),
      );
      const fallback = product.variants.find((v) =>
        isVariantPurchasable(availability, v.id),
      );
      return (requested ?? fallback)?.id ?? null;
    },
  );

  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(() =>
    hasSizes ? firstPurchasableSizeId(selectedVariantId) : null,
  );

  const selectedCombination = findCombination(
    availability,
    selectedVariantId,
    selectedSizeId,
  );
  const maxQuantity = selectedCombination?.maxQuantity ?? null;
  const effectiveQuantity =
    maxQuantity === null
      ? quantity
      : Math.max(1, Math.min(quantity, maxQuantity));

  const incompleteComponent = isBundle
    ? findIncompleteComponent(bundleComponents, componentSelections)
    : null;

  // Closed for now: nothing can be selected or bought.
  if (availability.state === "CLOSED") {
    return (
      <Button
        disabled
        variant="secondary"
        className="w-full font-semibold tracking-wider uppercase sm:w-64"
      >
        Vendas fechadas no momento
      </Button>
    );
  }

  const handleComponentChange = (
    componentProductId: string,
    selection: ComponentSelection,
  ) => {
    setComponentSelections((current) => ({
      ...current,
      [componentProductId]: selection,
    }));
  };

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

    if (!selectedCombination?.purchasable) {
      toast.error("Esta combinação não está disponível.");
      return;
    }

    if (incompleteComponent) {
      toast.error(
        `Escolha as opções de "${incompleteComponent.name}" para adicionar o kit.`,
      );
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
        ...(isBundle
          ? {
              isBundle: true,
              components: buildCartComponents(
                bundleComponents,
                componentSelections,
              ),
            }
          : {}),
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
              const isAvailable = isVariantPurchasable(
                availability,
                variant.id,
              );

              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    setSelectedVariantId(variant.id);
                    if (
                      hasSizes &&
                      (!selectedSizeId ||
                        !isSizePurchasable(
                          availability,
                          variant.id,
                          selectedSizeId,
                        ))
                    ) {
                      setSelectedSizeId(firstPurchasableSizeId(variant.id));
                    }
                  }}
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
              const isAvailable = isSizePurchasable(
                availability,
                selectedVariantId,
                size.id,
              );

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

      {isBundle && (
        <BundleSelector
          components={bundleComponents}
          selections={componentSelections}
          onChange={handleComponentChange}
        />
      )}

      {/* Quantity & Action */}
      {availability.state === "SOLD_OUT" ? (
        <Button
          disabled
          variant="outline"
          className="w-full border-red-800/50 font-semibold tracking-wider text-red-500 uppercase sm:w-64"
        >
          Esgotado
        </Button>
      ) : (
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <div className="flex w-fit items-center rounded-md border border-input bg-background">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Diminuir quantidade"
              onClick={() => setQuantity(Math.max(1, effectiveQuantity - 1))}
              disabled={effectiveQuantity <= 1}
              className="h-10 w-10 rounded-r-none"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center text-sm font-medium select-none">
              {effectiveQuantity}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Aumentar quantidade"
              onClick={() => setQuantity(effectiveQuantity + 1)}
              disabled={
                maxQuantity !== null && effectiveQuantity >= maxQuantity
              }
              className="h-10 w-10 rounded-l-none"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <Button
            onClick={handleAddToCart}
            disabled={incompleteComponent !== null}
            className="w-full gap-2 text-base font-semibold sm:w-64"
            size="lg"
          >
            <ShoppingBag className="h-5 w-5" />
            Adicionar ao Carrinho
          </Button>
        </div>
      )}
      {incompleteComponent && availability.state !== "SOLD_OUT" && (
        <p
          role="status"
          className="text-sm text-red-500"
        >
          {`Escolha as opções de "${incompleteComponent.name}" para adicionar o kit ao carrinho.`}
        </p>
      )}
    </div>
  );
}
