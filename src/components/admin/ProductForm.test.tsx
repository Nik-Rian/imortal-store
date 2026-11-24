;
// @vitest-environment jsdom
import type { StockItemSnapshot } from "@/lib/stock-matrix";
import type { ProductWithVariants } from "@/types";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductForm } from "./ProductForm";


vi.mock("@/actions/blob.actions", () => ({
  uploadProductImage: vi.fn(),
  deleteBlobImages: vi.fn(),
}));

const drops = [
  { id: "d1", name: "2026.2" },
  { id: "d2", name: "2026.1" },
];

const componentOptions = [
  { id: "p1", name: "Camiseta", dropId: "d1", isBundle: false },
  { id: "p2", name: "Caneca", dropId: "d1", isBundle: false },
  { id: "k1", name: "Kit Existente", dropId: "d1", isBundle: true },
  { id: "p3", name: "Boné Antigo", dropId: "d2", isBundle: false },
];

function renderForm(
  initialData?: ProductWithVariants,
  initialStockItems?: StockItemSnapshot[],
) {
  const action = vi.fn().mockResolvedValue(undefined);
  render(
    <ProductForm
      action={action}
      drops={drops}
      componentOptions={componentOptions}
      initialData={initialData}
      initialStockItems={initialStockItems}
    />,
  );
  return action;
}

function enableBundle() {
  fireEvent.click(screen.getByLabelText("Produto Kit"));
}

function pickerOptions() {
  return within(screen.getByLabelText("Produtos do Kit"))
    .getAllByRole("option")
    .map((o) => o.textContent);
}

const baseProduct: ProductWithVariants = {
  id: "b1",
  name: "Kit Imortal",
  slug: "kit-imortal",
  description: "d",
  priceCents: 5000,
  images: [],
  isAvailable: true,
  sortOrder: 0,
  controlStock: false,
  hasSizes: false,
  hasVariants: false,
  showVariantsInStore: true,
  isBundle: false,
  dropId: "d1",
  createdAt: new Date(),
  updatedAt: new Date(),
  sizes: [],
  variants: [],
};

describe("ProductForm bundle controls", () => {
  it("lists only ordinary products from the selected drop", () => {
    renderForm();
    enableBundle();
    expect(pickerOptions()).toEqual([
      "Adicionar produto ao kit...",
      "Camiseta",
      "Caneca",
    ]);
  });

  it("hides the stock, size and variant controls for a bundle", () => {
    renderForm();
    expect(screen.getByText("Controlar Estoque")).toBeTruthy();
    enableBundle();
    for (const text of [
      "Controlar Estoque",
      "Possui Tamanhos",
      "Possui Variantes",
      "Tamanhos",
      "Variantes",
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });

  it("adds a component without a quantity control and can remove it", () => {
    renderForm();
    enableBundle();
    fireEvent.change(screen.getByLabelText("Produtos do Kit"), {
      target: { value: "p1" },
    });
    expect(screen.getByLabelText("Remover Camiseta")).toBeTruthy();
    expect(screen.queryByLabelText("Quantidade de Camiseta")).toBeNull();
    expect(pickerOptions()).not.toContain("Camiseta");

    fireEvent.click(screen.getByLabelText("Remover Camiseta"));
    expect(screen.queryByLabelText("Remover Camiseta")).toBeNull();
    expect(pickerOptions()).toContain("Camiseta");
  });

  it("states that the customer chooses variant and size of each component", () => {
    renderForm();
    enableBundle();
    expect(
      screen.getByText(/escolhe a variante e o tamanho de cada produto/),
    ).toBeTruthy();
  });

  it("drops components from another drop when the drop changes", () => {
    renderForm();
    enableBundle();
    fireEvent.change(screen.getByLabelText("Produtos do Kit"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Drop"), {
      target: { value: "d2" },
    });
    expect(screen.queryByLabelText("Remover Camiseta")).toBeNull();
    expect(pickerOptions()).toEqual([
      "Adicionar produto ao kit...",
      "Boné Antigo",
    ]);
  });

  it("submits the bundle payload with stock, size and variant flags off", async () => {
    const action = renderForm();
    fireEvent.change(screen.getByLabelText("Nome do Produto"), {
      target: { value: "Kit Imortal" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Camiseta e caneca" },
    });
    fireEvent.change(screen.getByLabelText("Preço (R$)"), {
      target: { value: "50" },
    });
    enableBundle();
    fireEvent.change(screen.getByLabelText("Produtos do Kit"), {
      target: { value: "p1" },
    });

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][0] as FormData;
    expect(formData.get("isBundle")).toBe("true");
    expect(JSON.parse(formData.get("components") as string)).toEqual([
      { componentProductId: "p1", quantity: 1 },
    ]);
    expect(formData.get("dropId")).toBe("d1");
    expect(formData.get("controlStock")).toBe("false");
    expect(formData.get("hasSizes")).toBe("false");
    expect(formData.get("hasVariants")).toBe("false");
    expect(formData.get("sizes")).toBe("[]");
    expect(formData.get("variants")).toBe("[]");
  });

  it("does not submit a bundle without components", async () => {
    const action = renderForm();
    fireEvent.change(screen.getByLabelText("Nome do Produto"), {
      target: { value: "Kit Imortal" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "d" },
    });
    fireEvent.change(screen.getByLabelText("Preço (R$)"), {
      target: { value: "50" },
    });
    enableBundle();
    fireEvent.submit(document.querySelector("form")!);

    expect(
      await screen.findByText("Um kit precisa de ao menos um produto."),
    ).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });
});

describe("ProductForm edit mode", () => {
  it("loads an existing bundle without a quantity input", () => {
    renderForm({
      ...baseProduct,
      isBundle: true,
      components: [{ componentProductId: "p1", quantity: 2 }],
    });
    expect(
      (screen.getByLabelText("Produto Kit") as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByLabelText("Remover Camiseta")).toBeTruthy();
    expect(screen.queryByLabelText("Quantidade de Camiseta")).toBeNull();
  });

  it("saves the components of an existing bundle with quantity 1", async () => {
    const action = renderForm({
      ...baseProduct,
      isBundle: true,
      components: [{ componentProductId: "p1", quantity: 2 }],
    });

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][0] as FormData;
    expect(JSON.parse(formData.get("components") as string)).toEqual([
      { componentProductId: "p1", quantity: 1 },
    ]);
  });

  it("blocks kit conversion and drop changes for a product used as a component", () => {
    renderForm({ ...baseProduct, id: "p1", _count: { componentOf: 1 } });
    expect(
      (screen.getByLabelText("Produto Kit") as HTMLInputElement).disabled,
    ).toBe(true);
    expect((screen.getByLabelText("Drop") as HTMLSelectElement).disabled).toBe(
      true,
    );
  });
});

describe("ProductForm price and availability contract", () => {
  function fillRequiredFields(price: string) {
    fireEvent.change(screen.getByLabelText("Nome do Produto"), {
      target: { value: "Camiseta Imortal" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Camiseta oficial" },
    });
    fireEvent.change(screen.getByLabelText("Preço (R$)"), {
      target: { value: price },
    });
  }

  // The "Disponível na loja" label is not associated with its checkbox.
  function availabilityCheckbox() {
    return document.querySelector<HTMLInputElement>(
      'input[name="isAvailable"]',
    )!;
  }

  it("shows the error returned by the action", async () => {
    const action = renderForm();
    action.mockResolvedValueOnce({
      success: false,
      error: "Já existe um produto com este link.",
    });
    fillRequiredFields("50");

    fireEvent.submit(document.querySelector("form")!);

    expect(
      await screen.findByText("Já existe um produto com este link."),
    ).toBeTruthy();
  });

  it("shows a generic message when the action throws", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const action = renderForm();
    action.mockRejectedValueOnce(new Error("masked in production"));
    fillRequiredFields("50");

    fireEvent.submit(document.querySelector("form")!);

    expect(
      await screen.findByText("Não foi possível salvar o produto."),
    ).toBeTruthy();
    logSpy.mockRestore();
  });

  it("posts the reais input as integer cents and an unchecked box as false", async () => {
    const action = renderForm();
    // A type="number" input always exposes a dot-decimal value ("49,90" typed
    // in a pt-BR browser reads back as "49.90"); jsdom discards a comma value.
    fillRequiredFields("49.90");
    fireEvent.click(availabilityCheckbox());

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][0] as FormData;
    expect(formData.get("priceCents")).toBe("4990");
    expect(formData.get("isAvailable")).toBe("false");
    expect(formData.has("price")).toBe(false);
  });

  it("posts a checked box as true", async () => {
    const action = renderForm();
    fillRequiredFields("50");

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][0] as FormData;
    expect(formData.get("priceCents")).toBe("5000");
    expect(formData.get("isAvailable")).toBe("true");
  });

  it("does not submit a negative price", async () => {
    const action = renderForm();
    fillRequiredFields("-5");

    fireEvent.submit(document.querySelector("form")!);

    expect(await screen.findByText("Informe um preço válido.")).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("shows a stored price in reais and posts it back unchanged", async () => {
    const action = renderForm({ ...baseProduct, priceCents: 4990 });
    expect(
      (screen.getByLabelText("Preço (R$)") as HTMLInputElement).value,
    ).toBe("49.90");

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][0] as FormData;
    expect(formData.get("priceCents")).toBe("4990");
    expect(formData.get("isAvailable")).toBe("true");
  });
});

const sizeRow = (id: string, size: string, isAvailable = true) => ({
  id,
  productId: "b1",
  size,
  isAvailable,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const variantRow = (id: string, name: string, isAvailable = true) => ({
  id,
  productId: "b1",
  name,
  image: null,
  isAvailable,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const trackedProduct = (overrides: Partial<ProductWithVariants> = {}) =>
  ({ ...baseProduct, controlStock: true, ...overrides }) as ProductWithVariants;

describe("ProductForm stock matrix", () => {
  it("renders a single row for a product without options", () => {
    renderForm(trackedProduct());
    expect(screen.getByLabelText("Quantidade de Produto")).toBeTruthy();
  });

  it("renders one row per variant", () => {
    renderForm(
      trackedProduct({
        hasVariants: true,
        variants: [variantRow("v1", "Preta"), variantRow("v2", "Branca")],
      }),
    );
    expect(screen.getByLabelText("Quantidade de Preta")).toBeTruthy();
    expect(screen.getByLabelText("Quantidade de Branca")).toBeTruthy();
  });

  it("renders one row per size", () => {
    renderForm(
      trackedProduct({
        hasSizes: true,
        sizes: [sizeRow("s1", "P"), sizeRow("s2", "M")],
      }),
    );
    expect(screen.getByLabelText("Quantidade de P")).toBeTruthy();
    expect(screen.getByLabelText("Quantidade de M")).toBeTruthy();
  });

  it("renders variant x size rows", () => {
    renderForm(
      trackedProduct({
        hasVariants: true,
        hasSizes: true,
        variants: [variantRow("v1", "Preta"), variantRow("v2", "Branca")],
        sizes: [sizeRow("s1", "P"), sizeRow("s2", "M")],
      }),
    );
    expect(screen.getAllByLabelText(/^Quantidade de /)).toHaveLength(4);
    expect(screen.getByLabelText("Quantidade de Branca / M")).toBeTruthy();
  });

  it("shows stored quantity, reserved and availability and posts edits", async () => {
    const action = renderForm(
      trackedProduct({
        hasVariants: true,
        hasSizes: true,
        variants: [variantRow("v1", "Preta")],
        sizes: [sizeRow("s1", "P")],
      }),
      [
        {
          variantId: "v1",
          sizeId: "s1",
          onHand: 3,
          reserved: 1,
          isAvailable: true,
        },
      ],
    );
    const quantity = screen.getByLabelText(
      "Quantidade de Preta / P",
    ) as HTMLInputElement;
    expect(quantity.value).toBe("3");
    expect(within(quantity.closest("tr")!).getByText("1")).toBeTruthy();

    fireEvent.change(quantity, { target: { value: "7" } });
    fireEvent.click(screen.getByLabelText("Disponível para venda: Preta / P"));
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][0] as FormData;
    expect(JSON.parse(formData.get("stock") as string)).toEqual([
      { variantName: "Preta", sizeLabel: "P", onHand: 7, isAvailable: false },
    ]);
  });

  it("keeps entered quantities when a variant is renamed", () => {
    renderForm(
      trackedProduct({
        hasVariants: true,
        hasSizes: true,
        variants: [variantRow("v1", "Preta")],
        sizes: [sizeRow("s1", "P")],
      }),
      [
        {
          variantId: "v1",
          sizeId: "s1",
          onHand: 3,
          reserved: 0,
          isAvailable: true,
        },
      ],
    );
    fireEvent.change(screen.getByDisplayValue("Preta"), {
      target: { value: "Preto" },
    });
    expect(
      (screen.getByLabelText("Quantidade de Preto / P") as HTMLInputElement)
        .value,
    ).toBe("3");
  });

  it("hides the matrix and posts an empty stock list when tracking is off", async () => {
    const action = renderForm(trackedProduct());
    fireEvent.click(screen.getByLabelText("Controlar Estoque"));
    expect(screen.queryByLabelText("Quantidade de Produto")).toBeNull();

    fireEvent.submit(document.querySelector("form")!);

    // Wait until submission has completed and controls are enabled again.
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);

      const checkbox = screen.getByLabelText(
        "Controlar Estoque",
      ) as HTMLInputElement;

      expect(checkbox.disabled).toBe(false);
    });

    expect((action.mock.calls[0][0] as FormData).get("stock")).toBe("[]");

    const checkbox = screen.getByLabelText(
      "Controlar Estoque",
    ) as HTMLInputElement;

    fireEvent.click(checkbox);

    expect(await screen.findByLabelText("Quantidade de Produto")).toBeTruthy();
  });
});

describe("ProductForm option availability", () => {
  it("posts variant and size availability", async () => {
    const action = renderForm({
      ...baseProduct,
      hasVariants: true,
      hasSizes: true,
      variants: [variantRow("v1", "Preta")],
      sizes: [sizeRow("s1", "P")],
    } as ProductWithVariants);

    fireEvent.click(screen.getByLabelText("Variante Preta disponível"));
    fireEvent.click(screen.getByLabelText("Tamanho P disponível"));
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][0] as FormData;
    expect(JSON.parse(formData.get("variants") as string)[0]).toMatchObject({
      id: "v1",
      isAvailable: false,
    });
    expect(JSON.parse(formData.get("sizes") as string)[0]).toMatchObject({
      id: "s1",
      isAvailable: false,
    });
  });

  it("keeps existing sizes when selecting all standard sizes", async () => {
    const action = renderForm({
      ...baseProduct,
      hasSizes: true,
      sizes: [sizeRow("s1", "P", false)],
    } as ProductWithVariants);

    fireEvent.click(screen.getByText("Selecionar Todos (P ao XGG)"));
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const sizes = JSON.parse(
      (action.mock.calls[0][0] as FormData).get("sizes") as string,
    );
    expect(sizes).toHaveLength(5);
    expect(sizes.find((s: { size: string }) => s.size === "P")).toMatchObject({
      id: "s1",
      isAvailable: false,
    });
  });
});
