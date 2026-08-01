"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { useCart } from "@/context/CartContext";

export function CartSheet() {
  const {
    items,
    cartTotal,
    cartCount,
    isOpen,
    setIsOpen,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="flex w-full flex-col gap-0 border-border bg-background sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="font-display tracking-[0.14em] uppercase">
            Sua sacola
          </SheetTitle>
          <SheetDescription className="text-xs tracking-[0.18em] uppercase">
            {cartCount} {cartCount === 1 ? "item" : "itens"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-5">
          {items.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              Sacola vazia. A Atlética Imortal está esperando seu pedido.
            </p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li
                  key={`${item.id}-${item.size || "default"}`}
                  className="flex gap-4 rounded-md border border-border bg-surface p-3"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    width={912}
                    height={1104}
                    className="h-24 w-20 rounded-sm object-cover"
                  />
                  <div className="flex flex-1 flex-col">
                    <p className="font-display uppercase">{item.name}</p>
                    {item.size && (
                      <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                        Tam. {item.size}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="steel"
                          size="icon"
                          className="size-7"
                          aria-label="Diminuir"
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-6 text-center text-sm tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          variant="steel"
                          size="icon"
                          className="size-7"
                          aria-label="Aumentar"
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <span className="font-display">
                        {formatPrice(item.priceCents * item.quantity)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label={`Remover ${item.name}`}
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
              Total
            </span>
            <span className="font-display text-primary">
              {formatPrice(cartTotal)}
            </span>
          </div>
          <Button
            variant="ember"
            size="xl"
            className="mt-4 w-full"
            disabled={items.length === 0}
            onClick={() => {
              toast.success("Pedido reservado!", {
                description:
                  "Combine o pagamento e a retirada com a diretoria da atlética.",
              });
              clearCart();
              setIsOpen(false);
            }}
          >
            Finalizar pedido
          </Button>
          <p className="mt-3 text-center text-[0.7rem] tracking-[0.16em] text-muted-foreground uppercase">
            Pix, cartão em 3x ou dinheiro na retirada
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
