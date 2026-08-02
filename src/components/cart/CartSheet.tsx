"use client";

import {
  MinusIcon,
  PlusIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  TrashIcon,
} from "@phosphor-icons/react";
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
      <SheetContent className="flex w-full flex-col gap-0 border-l border-border/80 bg-background p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border/80 p-6 pb-4">
          <div className="flex items-center gap-2.5">
            <SheetTitle>Sua sacola</SheetTitle>
            <span className="inline-flex items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
              {cartCount}
            </span>
          </div>
          <SheetDescription className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
            Atlética Imortal Store
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="relative mb-5 flex size-20 items-center justify-center rounded-full border border-border/80 bg-surface/60 text-muted-foreground/50 shadow-inner">
                <ShoppingBagIcon className="size-9 text-muted-foreground/60" />
              </div>
              <h3 className="font-display text-base font-bold tracking-wider text-foreground uppercase">
                Sua sacola está vazia
              </h3>
              <p className="mt-1.5 max-w-60 text-xs leading-relaxed text-muted-foreground">
                Explore nossos produtos exclusivos e garanta o manto da Atlética Imortal.
              </p>
              <Button
                variant="emberOutline"
                size="sm"
                className="mt-6"
                onClick={() => setIsOpen(false)}
              >
                Explorar produtos
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-0.5 pb-1">
                <span className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  Itens Selecionados ({cartCount})
                </span>
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-[11px] text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline"
                >
                  Limpar sacola
                </button>
              </div>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li
                    key={`${item.id}-${item.size || "default"}`}
                    className="group relative flex gap-3.5 rounded-lg border border-border/80 bg-surface/60 p-3 transition-colors hover:border-border hover:bg-surface"
                  >
                    <div className="relative h-22 w-20 shrink-0 overflow-hidden rounded-md border border-border/50 bg-black/40">
                      <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        width={912}
                        height={1104}
                        className="size-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="truncate font-display text-sm font-semibold tracking-wide text-foreground uppercase">
                            {item.name}
                          </h4>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="-mt-1 -mr-1 size-6 shrink-0 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Remover ${item.name}`}
                            onClick={() => removeItem(item.id)}
                          >
                            <TrashIcon className="size-3.5" />
                          </Button>
                        </div>
                        {item.size && (
                          <div className="mt-1">
                            <span className="inline-flex items-center rounded border border-border/60 bg-background/60 px-2 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                              Tam: <strong className="ml-1 font-semibold text-foreground">{item.size}</strong>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex items-center rounded-md border border-border/80 bg-background/80 p-0.5 shadow-xs">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="size-6 rounded text-muted-foreground hover:bg-surface hover:text-foreground"
                            aria-label="Diminuir"
                            onClick={() =>
                              updateQuantity(item.id, item.quantity - 1)
                            }
                          >
                            <MinusIcon className="size-3" />
                          </Button>
                          <span className="w-6 text-center text-xs font-semibold text-foreground tabular-nums">
                            {item.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="size-6 rounded text-muted-foreground hover:bg-surface hover:text-foreground"
                            aria-label="Aumentar"
                            onClick={() =>
                              updateQuantity(item.id, item.quantity + 1)
                            }
                          >
                            <PlusIcon className="size-3" />
                          </Button>
                        </div>
                        <span className="font-display text-sm font-bold text-primary">
                          {formatPrice(item.priceCents * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="shrink-0 space-y-4 border-t border-border/80 bg-surface/30 p-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatPrice(cartTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Retirada / Entrega</span>
              <span className="text-[11px] font-medium tracking-wider text-emerald-400 uppercase">
                A combinar
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-border/50 pt-2">
              <span className="font-display text-xs font-semibold tracking-[0.2em] text-foreground uppercase">
                Total
              </span>
              <span className="font-display text-xl font-bold tracking-tight text-primary">
                {formatPrice(cartTotal)}
              </span>
            </div>
          </div>

          <Button
            variant="ember"
            size="xl"
            className="w-full shadow-lg shadow-primary/15 transition-all hover:shadow-primary/25 disabled:opacity-50"
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

          <div className="flex items-center justify-center gap-2 pt-0.5 text-center text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            <ShieldCheckIcon className="size-3.5 shrink-0 text-primary/70" />
            <span>Pix • Cartão em até 3x • Retirada no Campus</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
