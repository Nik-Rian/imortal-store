"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { CartContextType, CartItem, CartItemComponent } from "../types/cart";

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = "imortal-store-cart";

// Custom event to notify components in the same tab when storage changes
function notifyStorageChange() {
  window.dispatchEvent(new Event("local-storage-cart"));
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("local-storage-cart", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("local-storage-cart", callback);
  };
}

function getSnapshot(): string {
  return localStorage.getItem(STORAGE_KEY) || "[]";
}

function getServerSnapshot(): string {
  return "[]";
}

const INCOMPLETE_BUNDLE_NOTICE_ID = "cart-incomplete-bundles";
const INCOMPLETE_BUNDLE_NOTICE =
  "Alguns kits do seu carrinho estavam incompletos e foram removidos. Adicione-os novamente escolhendo as opções de cada produto.";

// Order-independent, so the same choices merge into one line.
function buildComponentsSignature(
  components: readonly CartItemComponent[],
): string {
  return components
    .map((component) =>
      [
        component.componentProductId,
        component.variantId ?? "",
        component.sizeId ?? "",
      ].join(":"),
    )
    .sort()
    .join(",");
}

function isCartItemComponent(value: unknown): value is CartItemComponent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.componentProductId === "string" &&
    candidate.componentProductId.length > 0 &&
    typeof candidate.componentName === "string"
  );
}

// Lines saved before bundle selections existed keep working. A line flagged as
// a bundle without a complete component list would produce a payload the
// server rejects, so it is dropped and counted for the notice.
function parseStoredCart(rawCart: string): {
  items: CartItem[];
  droppedCount: number;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawCart);
  } catch (error) {
    console.error("Failed to parse cart data from localStorage:", error);
    return { items: [], droppedCount: 0 };
  }
  if (!Array.isArray(parsed)) return { items: [], droppedCount: 0 };

  const items: CartItem[] = [];
  let droppedCount = 0;
  for (const stored of parsed) {
    if (typeof stored !== "object" || stored === null) continue;

    const incompleteBundle =
      stored.isBundle &&
      !(
        Array.isArray(stored.components) &&
        stored.components.length > 0 &&
        stored.components.every(isCartItemComponent)
      );
    if (incompleteBundle) {
      droppedCount += 1;
      continue;
    }

    items.push({ ...stored, productId: stored.productId || stored.id });
  }
  return { items, droppedCount };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Synchronizes React directly with localStorage
  const rawCart = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const { items, droppedCount } = parseStoredCart(rawCart);

  // Persists the cleaned cart once and tells the customer. Re-running is
  // harmless: after the write nothing is dropped, and the toast id dedupes.
  useEffect(() => {
    if (droppedCount === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    notifyStorageChange();
    toast.warning(INCOMPLETE_BUNDLE_NOTICE, {
      id: INCOMPLETE_BUNDLE_NOTICE_ID,
    });
  }, [droppedCount, items]);

  const saveCart = (newItems: CartItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    notifyStorageChange();
  };

  const addItem = (newItem: Omit<CartItem, "quantity">, quantity = 1) => {
    // Generate composite item key (e.g. "prod_123:var_456" or "prod_123")
    const baseKey =
      newItem.id ||
      (newItem.variantId
        ? `${newItem.productId}:${newItem.variantId}`
        : newItem.productId);
    // Bundle lines also identify their component choices, so the same bundle
    // with different choices is a separate line. Plain lines keep their id.
    const itemKey =
      newItem.components && newItem.components.length > 0
        ? `${baseKey}|${buildComponentsSignature(newItem.components)}`
        : baseKey;

    const fullItem: Omit<CartItem, "quantity"> = {
      ...newItem,
      id: itemKey,
      productId: newItem.productId || newItem.id,
    };

    const existingIndex = items.findIndex((item) => item.id === itemKey);
    let updatedItems: CartItem[];

    if (existingIndex > -1) {
      updatedItems = items.map((item, index) =>
        index === existingIndex
          ? { ...item, quantity: item.quantity + quantity }
          : item,
      );
    } else {
      updatedItems = [...items, { ...fullItem, quantity }];
    }

    saveCart(updatedItems);
  };

  const removeItem = (id: string) => {
    saveCart(items.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    saveCart(
      items.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  };

  const clearCart = () => {
    saveCart([]);
  };

  const cartCount = items.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = items.reduce(
    (total, item) => total + item.priceCents * item.quantity,
    0,
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        cartCount,
        cartTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
