"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Minus, Plus, ShoppingBag } from "lucide-react";

interface AddToCartButtonProps {
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    images: string[];
  };
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  const handleIncrement = () => setQuantity((prev) => prev + 1);
  const handleDecrement = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const handleAddToCart = () => {
    addItem(
      {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        image: product.images[0] || "/placeholder.png", // Fallback if no images
      },
      quantity
    );
    
    // Reset quantity selector to 1 after adding
    setQuantity(1);
    
    // Quick UX feedback
    alert(`${product.name} adicionado ao carrinho!`);
  };

  return (
    <div className="flex flex-col gap-4 w-full sm:w-auto">
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
  );
}