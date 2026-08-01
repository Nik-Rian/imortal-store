"use client";

import Link from "next/link";
import { ShoppingBagIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

import { Logo } from "./Logo";
import { useCart } from "@/context/CartContext";
import { CartSheet } from "@/components/cart/CartSheet";

const links = [
  { hash: "colecao", label: "Coleção" },
  { hash: "tabela", label: "Tamanhos" },
  { hash: "manifesto", label: "Manifesto" },
];

export function Header() {
  const { cartCount, setIsOpen } = useCart();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-11 w-auto" />
            <span className="hidden leading-none sm:block">
              <span className="block font-display text-sm font-bold tracking-[0.2em] uppercase">
                Imortal
              </span>
              <span className="block text-[0.65rem] tracking-[0.22em] text-muted-foreground uppercase">
                Eng. de Computação
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {links.map((l) => (
              <a
                key={l.hash}
                href={`/#${l.hash}`}
                className="font-display tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:text-primary"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <Button
            variant="ember"
            size="sm"
            className="h-10 px-4"
            onClick={() => setIsOpen(true)}
          >
            <ShoppingBagIcon className="size-4" />
            <span className="hidden sm:inline">Sacola</span>
            <span className="ml-1 rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-[0.7rem] tabular-nums">
              {cartCount}
            </span>
          </Button>
        </div>
      </header>

      {/* Render Shadcn Sheet Cart */}
      <CartSheet />
    </>
  );
}
