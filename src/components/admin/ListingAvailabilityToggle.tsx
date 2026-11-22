"use client";

import { setProductAvailability } from "@/actions/product.actions";
import { useState, useTransition } from "react";

interface ListingAvailabilityToggleProps {
  productId: string;
  productName: string;
  isAvailable: boolean;
}

export function ListingAvailabilityToggle({
  productId,
  productName,
  isAvailable,
}: ListingAvailabilityToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await setProductAvailability(productId, !isAvailable);
        if (!result.success) {
          setError(result.error);
        }
      } catch {
        setError("Erro ao alterar a disponibilidade.");
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={isAvailable}
          aria-label={`Vendas de ${productName}`}
          disabled={isPending}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            isAvailable ? "bg-emerald-500" : "bg-zinc-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              isAvailable ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-xs font-medium text-zinc-600">
          {isAvailable ? "Aberto" : "Fechado"}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
