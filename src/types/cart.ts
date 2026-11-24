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
  /** Marks a bundle line so an incomplete stored line can be recognised. */
  isBundle?: boolean;
  /** One entry per bundle component, with the chosen options. */
  components?: CartItemComponent[];
  quantity: number;
}

export interface CartItemComponent {
  componentProductId: string;
  // Display snapshots. The server re-validates every id and never uses names.
  componentName: string;
  variantId?: string;
  variantName?: string;
  sizeId?: string;
  sizeLabel?: string;
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
