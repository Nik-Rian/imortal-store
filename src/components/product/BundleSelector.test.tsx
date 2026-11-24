// @vitest-environment jsdom
import {
  buildCartComponents,
  BundleSelector,
  findIncompleteComponent,
  type BundleComponentView,
} from "@/components/product/BundleSelector";
import type { ProductAvailability } from "@/lib/availability";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

function option(
  variantId: string | null,
  sizeId: string | null,
  purchasable: boolean,
) {
  return {
    variantId,
    sizeId,
    purchasable,
    reason: purchasable ? null : ("OUT_OF_STOCK" as const),
    maxQuantity: null,
  };
}

function availability(
  overrides: Partial<ProductAvailability>,
): ProductAvailability {
  return {
    state: "OPEN",
    hasVariantOptions: false,
    hasSizeOptions: false,
    combinations: [option(null, null, true)],
    ...overrides,
  };
}

const cap: BundleComponentView = {
  productId: "cap",
  name: "Boné",
  image: "/cap.png",
  quantity: 1,
  variants: [
    { id: "v-blue", name: "Azul" },
    { id: "v-black", name: "Preto" },
  ],
  sizes: [],
  availability: availability({
    hasVariantOptions: true,
    combinations: [
      option("v-blue", null, true),
      option("v-black", null, false),
    ],
  }),
};

const shirt: BundleComponentView = {
  productId: "shirt",
  name: "Camisa",
  image: "/shirt.png",
  quantity: 1,
  variants: [],
  sizes: [
    { id: "s-p", size: "P" },
    { id: "s-m", size: "M" },
  ],
  availability: availability({
    hasSizeOptions: true,
    combinations: [option(null, "s-p", true), option(null, "s-m", false)],
  }),
};

const sticker: BundleComponentView = {
  productId: "sticker",
  name: "Adesivo",
  image: "/sticker.png",
  quantity: 1,
  variants: [],
  sizes: [],
  availability: availability({}),
};

const isDisabled = (element: HTMLElement) =>
  (element as HTMLButtonElement).disabled;

describe("BundleSelector", () => {
  it("lists every component, including one without options", () => {
    render(
      <BundleSelector
        components={[cap, shirt, sticker]}
        selections={{}}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "Boné" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Camisa" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Adesivo" })).toBeTruthy();
  });

  it("asks for the missing choice of each component with options", () => {
    render(
      <BundleSelector
        components={[cap, shirt, sticker]}
        selections={{}}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Selecione a variação.")).toBeTruthy();
    expect(screen.getByText("Selecione o tamanho.")).toBeTruthy();
  });

  it("disables options that cannot be bought", () => {
    render(
      <BundleSelector
        components={[cap, shirt]}
        selections={{}}
        onChange={vi.fn()}
      />,
    );

    const capGroup = within(screen.getByRole("group", { name: "Boné" }));
    const shirtGroup = within(screen.getByRole("group", { name: "Camisa" }));
    expect(isDisabled(capGroup.getByRole("button", { name: "Azul" }))).toBe(
      false,
    );
    expect(isDisabled(capGroup.getByRole("button", { name: "Preto" }))).toBe(
      true,
    );
    expect(isDisabled(shirtGroup.getByRole("button", { name: "P" }))).toBe(
      false,
    );
    expect(isDisabled(shirtGroup.getByRole("button", { name: "M" }))).toBe(
      true,
    );
  });

  it("emits the chosen option for its component", () => {
    const onChange = vi.fn();
    render(
      <BundleSelector
        components={[cap, shirt]}
        selections={{}}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Azul" }));
    expect(onChange).toHaveBeenCalledWith("cap", {
      variantId: "v-blue",
      sizeId: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "P" }));
    expect(onChange).toHaveBeenCalledWith("shirt", {
      variantId: null,
      sizeId: "s-p",
    });
  });

  it("keeps sizes disabled until a variant is chosen", () => {
    const both: BundleComponentView = {
      ...shirt,
      productId: "jacket",
      name: "Jaqueta",
      variants: [{ id: "v-red", name: "Vermelha" }],
      availability: availability({
        hasVariantOptions: true,
        hasSizeOptions: true,
        combinations: [
          option("v-red", "s-p", true),
          option("v-red", "s-m", true),
        ],
      }),
    };
    const { rerender } = render(
      <BundleSelector
        components={[both]}
        selections={{}}
        onChange={vi.fn()}
      />,
    );
    expect(isDisabled(screen.getByRole("button", { name: "P" }))).toBe(true);

    rerender(
      <BundleSelector
        components={[both]}
        selections={{ jacket: { variantId: "v-red", sizeId: null } }}
        onChange={vi.fn()}
      />,
    );
    expect(isDisabled(screen.getByRole("button", { name: "P" }))).toBe(false);
  });
});

describe("bundle selection helpers", () => {
  const components = [cap, shirt, sticker];

  it("reports the first component whose choice is missing", () => {
    expect(
      findIncompleteComponent(components, {
        cap: { variantId: "v-blue", sizeId: null },
      })?.name,
    ).toBe("Camisa");
  });

  it("reports nothing once every required choice is made", () => {
    expect(
      findIncompleteComponent(components, {
        cap: { variantId: "v-blue", sizeId: null },
        shirt: { variantId: null, sizeId: "s-p" },
      }),
    ).toBeNull();
  });

  it("builds one cart entry per component, with labels only where chosen", () => {
    expect(
      buildCartComponents(components, {
        cap: { variantId: "v-blue", sizeId: null },
        shirt: { variantId: null, sizeId: "s-p" },
      }),
    ).toEqual([
      {
        componentProductId: "cap",
        componentName: "Boné",
        variantId: "v-blue",
        variantName: "Azul",
        sizeId: undefined,
        sizeLabel: undefined,
      },
      {
        componentProductId: "shirt",
        componentName: "Camisa",
        variantId: undefined,
        variantName: undefined,
        sizeId: "s-p",
        sizeLabel: "P",
      },
      {
        componentProductId: "sticker",
        componentName: "Adesivo",
        variantId: undefined,
        variantName: undefined,
        sizeId: undefined,
        sizeLabel: undefined,
      },
    ]);
  });
});
