"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { ShoppingBag, X, Trash2, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  const { items, cartCount, cartTotal, updateQuantity, removeItem } = useCart();
  const [isOpen, setIsOpen] = useState(false);

  // Helper to format cents into Brazilian Real (BRL)
  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  return (
    <>
      {/* Main Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold tracking-tight hover:opacity-80 transition">
            imortal<span className="text-primary">-store</span>
          </Link>

          {/* Cart Trigger Button */}
          <Button
            variant="outline"
            size="icon"
            className="relative h-10 w-10"
            onClick={() => setIsOpen(true)}
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-in zoom-in-50 duration-200">
                {cartCount}
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Cart Drawer Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Cart Drawer Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-450px bg-background p-6 shadow-xl transition-transform duration-300 ease-in-out border-l border-border flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" /> Seu Carrinho
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center gap-2 text-muted-foreground">
              <ShoppingBag className="h-12 w-12 stroke-1" />
              <p className="font-medium">Seu carrinho está vazio.</p>
              <Button variant="link" onClick={() => setIsOpen(false)}>
                Continuar comprando
              </Button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-3 border border-border rounded-lg bg-card transition-all"
              >
                {/* Product Thumbnail Image */}
                <img
                  src={item.image}
                  alt={item.name}
                  className="h-16 w-16 rounded-md object-cover bg-muted"
                />

                {/* Info and Item Actions */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <h4 className="font-medium text-sm truncate">{item.name}</h4>
                  <p className="text-sm font-semibold text-primary">
                    {formatCurrency(item.price * item.quantity)}
                  </p>

                  {/* Quantity Actions */}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center border border-input rounded bg-background">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="p-1 hover:bg-muted text-muted-foreground"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-xs font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="p-1 hover:bg-muted text-muted-foreground"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer */}
        {items.length > 0 && (
          <div className="border-t border-border pt-4 space-y-4 bg-background">
            <div className="flex items-center justify-between font-semibold text-base">
              <span>Subtotal:</span>
              <span className="text-xl text-primary">{formatCurrency(cartTotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Frete e taxas calculados no encerramento da compra.
            </p>
            <Button className="w-full text-base font-semibold h-12" size="lg">
              Finalizar Compra
            </Button>
          </div>
        )}
      </div>
    </>
  );
}