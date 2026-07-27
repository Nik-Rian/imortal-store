"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import { CartItem, CartContextType } from "../types/cart";

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

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Synchronizes React directly with localStorage
  const rawCart = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  let items: CartItem[] = [];
  try {
    items = JSON.parse(rawCart);
  } catch (error) {
    console.error("Failed to parse cart data from localStorage:", error);
  }

  const saveCart = (newItems: CartItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    notifyStorageChange();
  };

  const addItem = (newItem: Omit<CartItem, "quantity">, quantity = 1) => {
    const existingIndex = items.findIndex((item) => item.id === newItem.id);
    let updatedItems: CartItem[];

    if (existingIndex > -1) {
      updatedItems = items.map((item, index) =>
        index === existingIndex
          ? { ...item, quantity: item.quantity + quantity }
          : item,
      );
    } else {
      updatedItems = [...items, { ...newItem, quantity }];
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
