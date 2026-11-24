// @vitest-environment jsdom
import { CartProvider, useCart } from "@/context/CartContext";
import type {
  CartContextType,
  CartItem,
  CartItemComponent,
} from "@/types/cart";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

const STORAGE_KEY = "imortal-store-cart";

function Probe({ onCart }: { onCart: (cart: CartContextType) => void }) {
  const cart = useCart();
  useEffect(() => {
    onCart(cart);
  });
  return null;
}

function renderCart() {
  const latest: { current: CartContextType | null } = { current: null };
  render(
    <CartProvider>
      <Probe
        onCart={(cart) => {
          latest.current = cart;
        }}
      />
    </CartProvider>,
  );
  return () => {
    if (!latest.current) throw new Error("Cart not rendered");
    return latest.current;
  };
}

const capChoice = (variantId: string): CartItemComponent => ({
  componentProductId: "cap",
  componentName: "Boné",
  variantId,
  variantName: variantId,
});
const shirtChoice = (sizeId: string): CartItemComponent => ({
  componentProductId: "shirt",
  componentName: "Camisa",
  sizeId,
  sizeLabel: sizeId,
});

function kit(components: CartItemComponent[]): Omit<CartItem, "quantity"> {
  return {
    id: "kit--",
    productId: "kit",
    name: "Kit Calouro",
    slug: "kit-calouro",
    priceCents: 12000,
    image: "/kit.png",
    isBundle: true,
    components,
  };
}

describe("CartProvider bundle lines", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("merges identical component choices into one line", () => {
    const getCart = renderCart();

    act(() => getCart().addItem(kit([capChoice("blue"), shirtChoice("m")]), 1));
    act(() => getCart().addItem(kit([capChoice("blue"), shirtChoice("m")]), 2));

    expect(getCart().items).toHaveLength(1);
    expect(getCart().items[0].quantity).toBe(3);
  });

  it("merges the same choices listed in a different order", () => {
    const getCart = renderCart();

    act(() => getCart().addItem(kit([capChoice("blue"), shirtChoice("m")]), 1));
    act(() => getCart().addItem(kit([shirtChoice("m"), capChoice("blue")]), 1));

    expect(getCart().items).toHaveLength(1);
  });

  it("keeps different component choices as separate lines", () => {
    const getCart = renderCart();

    act(() => getCart().addItem(kit([capChoice("blue"), shirtChoice("m")]), 1));
    act(() => getCart().addItem(kit([capChoice("blue"), shirtChoice("g")]), 1));

    expect(getCart().items).toHaveLength(2);
    expect(new Set(getCart().items.map((item) => item.id)).size).toBe(2);
  });

  it("leaves the id of a plain line unchanged", () => {
    const getCart = renderCart();

    act(() =>
      getCart().addItem(
        {
          id: "p1-s1-",
          productId: "p1",
          sizeId: "s1",
          name: "Camiseta",
          slug: "camiseta",
          priceCents: 5000,
          image: "/a.png",
        },
        1,
      ),
    );

    expect(getCart().items[0].id).toBe("p1-s1-");
  });
});

describe("CartProvider stored carts", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("loads a cart saved before component selections existed", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "p1",
          name: "Camiseta",
          slug: "camiseta",
          priceCents: 5000,
          image: "/a.png",
          quantity: 2,
        },
      ]),
    );

    const getCart = renderCart();

    expect(getCart().items).toHaveLength(1);
    expect(getCart().items[0]).toMatchObject({ productId: "p1", quantity: 2 });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("drops a stored bundle line without components, keeps the rest and notifies", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { ...kit([]), components: undefined, quantity: 1 },
        {
          id: "p1",
          productId: "p1",
          name: "Camiseta",
          slug: "camiseta",
          priceCents: 5000,
          image: "/a.png",
          quantity: 1,
        },
      ]),
    );

    const getCart = renderCart();

    expect(getCart().items.map((item) => item.productId)).toEqual(["p1"]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toHaveLength(
      1,
    );
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it("keeps a complete stored bundle line", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { ...kit([capChoice("blue"), shirtChoice("m")]), quantity: 1 },
      ]),
    );

    const getCart = renderCart();

    expect(getCart().items).toHaveLength(1);
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
