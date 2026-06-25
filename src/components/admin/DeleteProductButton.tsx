"use client";

import { useState, useTransition } from "react";
import { deleteProduct } from "@/actions/product.actions";

interface DeleteProductButtonProps {
  productId: string;
}

export function DeleteProductButton({ productId }: DeleteProductButtonProps) {
  // Local state to track whether the user is in the confirmation step
  const [isConfirming, setIsConfirming] = useState(false);
  
  // useTransition hooks give an 'isPending' state for server interactions
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteProduct(productId);
      } catch (error) {
        console.error("Erro ao excluir produto:", error);
        alert("Não foi possível excluir o produto.");
        setIsConfirming(false);
      }
    });
  };

  if (isConfirming) {
    return (
      <div className="flex items-center gap-2 animate-in fade-in duration-200">
        <span className="text-xs font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
          {isPending ? "Excluindo..." : "Certeza?"}
        </span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-xs font-bold text-red-600 hover:text-red-800 disabled:opacity-50 transition-colors"
        >
          Sim
        </button>
        <button
          onClick={() => setIsConfirming(false)}
          disabled={isPending}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-50 transition-colors"
        >
          Não
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsConfirming(true)}
      className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
    >
      Excluir
    </button>
  );
}