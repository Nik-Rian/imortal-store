"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

interface AddToCartButtonProps {
  product: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    images: string[];
  };
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  const handleIncrement = () => setQuantity((prev) => prev + 1);
  const handleDecrement = () =>
    setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const handleAddToCart = () => {
    addItem(
      {
        id: product.id,
        name: product.name,
        slug: product.slug,
        priceCents: product.priceCents,
        image: product.images[0] || "/placeholder.png", // Fallback if no images
      },
      quantity
    );

    // Reset quantity selector to 1 after adding
    setQuantity(1);

    // feedback
    toast.success(`${product.name} adicionado ao carrinho!`);
  };

  return (
    <div className="flex w-full flex-col gap-4 sm:w-auto">
      {/* Quantity Selector */}
      <div className="flex w-fit items-center rounded-md border border-input bg-background">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDecrement}
          disabled={quantity <= 1}
          className="size-10 rounded-r-none"
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-12 text-center text-sm font-medium select-none">
          {quantity}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleIncrement}
          className="size-10 rounded-l-none"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Add to Cart Button */}
      <Button
        onClick={handleAddToCart}
        className="w-full gap-2 text-base font-semibold sm:w-64"
        size="lg"
      >
        <ShoppingBag className="size-5" />
        Adicionar ao Carrinho
      </Button>
    </div>
  );
}
