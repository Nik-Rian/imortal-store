"use client";

import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/utils";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function Header() {
  const { items, cartCount, cartTotal, updateQuantity, removeItem } = useCart();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Main Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight transition hover:opacity-80"
          >
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
              <span className="absolute -top-1 -right-1 flex h-5 w-5 animate-in items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground duration-200 zoom-in-50">
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
        className={`fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-border bg-background p-6 shadow-xl transition-transform duration-300 ease-in-out sm:w-[450px] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShoppingBag className="h-5 w-5" /> Seu Carrinho
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <ShoppingBag className="h-12 w-12 stroke-1" />
              <p className="font-medium">Seu carrinho está vazio.</p>
              <Button
                variant="link"
                onClick={() => setIsOpen(false)}
              >
                Continuar comprando
              </Button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-3 transition-all"
              >
                {/* Product Thumbnail Image */}
                <img
                  src={item.image}
                  alt={item.name}
                  className="h-16 w-16 rounded-md bg-muted object-cover"
                />

                {/* Info and Item Actions */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2 pr-2">
                    <h4 className="truncate text-sm font-medium">
                      {item.name}
                    </h4>
                    {item.sizeLabel && (
                      <span className="text-xs text-zinc-500">
                        Tamanho: {item.sizeLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-primary">
                    {formatPrice(item.priceCents * item.quantity)}
                  </p>

                  {/* Quantity Actions */}
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex items-center rounded border border-input bg-background">
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                        className="p-1 text-muted-foreground hover:bg-muted"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-xs font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                        className="p-1 text-muted-foreground hover:bg-muted"
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
          <div className="space-y-4 border-t border-border bg-background pt-4">
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Subtotal:</span>
              <span className="text-xl text-primary">
                {formatPrice(cartTotal)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Frete e taxas calculados no encerramento da compra.
            </p>
            <Link
              href="/checkout"
              onClick={() => setIsOpen(false)}
              className="block w-full rounded bg-black py-3 text-center font-medium text-white"
            >
              Finalizar Compra
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
