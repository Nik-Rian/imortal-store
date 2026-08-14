"use client";

import { useState } from "react";
import { AllowedSize } from "@/lib/validations/product.schema";

interface VariantInfo {
  id: string;
  size: AllowedSize;
  isAvailable: boolean;
}

interface AddToCartButtonProps {
  productId: string;
  isProductAvailable: boolean;
  isDropActive: boolean;
  variants: VariantInfo[];
  onAddToCart: (variantId: string) => void;
}

export function AddToCartButton({
  isProductAvailable,
  isDropActive,
  variants,
  onAddToCart,
}: AddToCartButtonProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );

  // Drop Closed State
  if (!isDropActive) {
    return (
      <div className="w-full space-y-3">
        <button
          disabled
          className="w-full rounded-md bg-zinc-800 py-3 font-semibold text-zinc-500 cursor-not-allowed uppercase text-sm tracking-wider"
        >
          Vendas Encerradas
        </button>
      </div>
    );
  }

  // Check if all variants or main product are unavailable
  const hasAvailableVariants = variants.some((v) => v.isAvailable);
  const isSoldOut = !isProductAvailable || !hasAvailableVariants;

  if (isSoldOut) {
    return (
      <div className="w-full space-y-3">
        <button
          disabled
          className="w-full rounded-md bg-zinc-800/80 py-3 font-semibold text-zinc-400 cursor-not-allowed uppercase text-sm tracking-wider border border-zinc-700/50"
        >
          Esgotado
        </button>
      </div>
    );
  }

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  return (
    <div className="w-full space-y-4">
      {/* Size Selector */}
      <div>
        <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">
          Selecione o Tamanho
        </span>
        <div className="flex gap-2">
          {variants.map((v) => {
            const isSelected = selectedVariantId === v.id;
            const isAvailable = v.isAvailable;

            return (
              <button
                key={v.id}
                type="button"
                disabled={!isAvailable}
                onClick={() => setSelectedVariantId(v.id)}
                className={`relative flex-1 py-2.5 border text-sm font-medium transition-all ${
                  !isAvailable
                    ? "border-zinc-800 bg-zinc-900/50 text-zinc-600 line-through cursor-not-allowed"
                    : isSelected
                      ? "border-amber-500 bg-amber-500/10 text-amber-400"
                      : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                {v.size}
                {!isAvailable && (
                  <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-red-950 text-red-400 border border-red-800/50 px-1 rounded">
                    Esgotado
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Button */}
      <button
        type="button"
        disabled={!selectedVariantId || !selectedVariant?.isAvailable}
        onClick={() => selectedVariantId && onAddToCart(selectedVariantId)}
        className="w-full rounded-md bg-amber-500 py-3 font-bold text-black hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase text-sm tracking-wider"
      >
        {!selectedVariantId ? "Escolha um Tamanho" : "Adicionar à Sacola"}
      </button>
    </div>
  );
}
