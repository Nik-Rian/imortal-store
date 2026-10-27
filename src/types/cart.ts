export interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  sizeId?: string;
  name: string;
  variantName?: string;
  sizeLabel?: string;
  slug: string;
  priceCents: number;
  image: string;
  quantity: number;
}

export interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
}
