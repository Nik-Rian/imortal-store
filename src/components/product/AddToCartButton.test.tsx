// @vitest-environment jsdom
import { AddToCartButton } from "@/components/product/AddToCartButton";
import type {
  CombinationAvailability,
  ProductAvailability,
} from "@/lib/availability";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { addItem } = vi.hoisted(() => ({ addItem: vi.fn() }));

vi.mock("@/context/CartContext", () => ({ useCart: () => ({ addItem }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const product = {
  id: "p1",
  name: "Camiseta",
  slug: "camiseta",
  priceCents: 5000,
  images: ["/a.png"],
  variants: [],
  sizes: [
    { id: "s1", size: "P" },
    { id: "s2", size: "M" },
  ],
};

function combination(
  sizeId: string,
  purchasable: boolean,
  maxQuantity: number | null,
): CombinationAvailability {
  return {
    variantId: null,
    sizeId,
    purchasable,
    reason: purchasable ? null : "OUT_OF_STOCK",
    maxQuantity: purchasable ? maxQuantity : null,
  };
}

function makeAvailability(
  overrides: Partial<ProductAvailability> = {},
): ProductAvailability {
  return {
    state: "OPEN",
    hasVariantOptions: false,
    hasSizeOptions: true,
    combinations: [
      combination("s1", true, null),
      combination("s2", true, null),
    ],
    ...overrides,
  };
}

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled;
}

describe("AddToCartButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the closed state and never the sold-out text", () => {
    render(
      <AddToCartButton
        product={product}
        availability={makeAvailability({ state: "CLOSED", combinations: [] })}
      />,
    );

    expect(
      isDisabled(
        screen.getByRole("button", { name: "Vendas fechadas no momento" }),
      ),
    ).toBe(true);
    expect(screen.queryByText("Esgotado")).toBeNull();
    expect(screen.queryByRole("button", { name: "P" })).toBeNull();
  });

  it("shows sold out with every size visible but disabled", () => {
    render(
      <AddToCartButton
        product={product}
        availability={makeAvailability({
          state: "SOLD_OUT",
          combinations: [
            combination("s1", false, null),
            combination("s2", false, null),
          ],
        })}
      />,
    );

    expect(isDisabled(screen.getByRole("button", { name: "Esgotado" }))).toBe(
      true,
    );
    expect(isDisabled(screen.getByRole("button", { name: "P" }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: "M" }))).toBe(true);
    expect(screen.queryByText("Vendas fechadas no momento")).toBeNull();
  });

  it("keeps a sold-out size visible but disabled while others stay selectable", () => {
    render(
      <AddToCartButton
        product={product}
        availability={makeAvailability({
          combinations: [
            combination("s1", true, 3),
            combination("s2", false, null),
          ],
        })}
      />,
    );

    expect(isDisabled(screen.getByRole("button", { name: "P" }))).toBe(false);
    expect(isDisabled(screen.getByRole("button", { name: "M" }))).toBe(true);
    expect(
      isDisabled(screen.getByRole("button", { name: /Adicionar ao Carrinho/ })),
    ).toBe(false);
  });

  it("stops the quantity stepper at the available units", () => {
    render(
      <AddToCartButton
        product={product}
        availability={makeAvailability({
          combinations: [
            combination("s1", true, 2),
            combination("s2", true, 2),
          ],
        })}
      />,
    );

    const increase = screen.getByRole("button", {
      name: "Aumentar quantidade",
    });
    fireEvent.click(increase);

    expect(screen.getByText("2")).toBeTruthy();
    expect(isDisabled(increase)).toBe(true);
  });

  it("has no ceiling for an untracked combination", () => {
    render(
      <AddToCartButton
        product={product}
        availability={makeAvailability()}
      />,
    );

    const increase = screen.getByRole("button", {
      name: "Aumentar quantidade",
    });
    fireEvent.click(increase);
    fireEvent.click(increase);
    fireEvent.click(increase);

    expect(screen.getByText("4")).toBeTruthy();
    expect(isDisabled(increase)).toBe(false);
  });

  it("adds the selected size with the chosen quantity", () => {
    render(
      <AddToCartButton
        product={product}
        availability={makeAvailability({
          combinations: [
            combination("s1", true, 5),
            combination("s2", true, 5),
          ],
        })}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Aumentar quantidade" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Adicionar ao Carrinho/ }),
    );

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "p1", sizeId: "s1" }),
      2,
    );
  });
});
