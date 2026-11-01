// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProductWithVariants } from "@/types";
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

function renderForm(initialData?: ProductWithVariants) {
  const action = vi.fn().mockResolvedValue(undefined);
  render(
    <ProductForm
      action={action}
      drops={drops}
      componentOptions={componentOptions}
      initialData={initialData}
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

  it("adds a component with quantity 1, edits it and can remove it", () => {
    renderForm();
    enableBundle();
    fireEvent.change(screen.getByLabelText("Produtos do Kit"), {
      target: { value: "p1" },
    });
    const quantity = screen.getByLabelText(
      "Quantidade de Camiseta",
    ) as HTMLInputElement;
    expect(quantity.value).toBe("1");
    expect(pickerOptions()).not.toContain("Camiseta");

    fireEvent.change(quantity, { target: { value: "3" } });
    expect(
      (screen.getByLabelText("Quantidade de Camiseta") as HTMLInputElement)
        .value,
    ).toBe("3");

    fireEvent.click(screen.getByLabelText("Remover Camiseta"));
    expect(screen.queryByLabelText("Quantidade de Camiseta")).toBeNull();
    expect(pickerOptions()).toContain("Camiseta");
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
    expect(screen.queryByLabelText("Quantidade de Camiseta")).toBeNull();
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
    fireEvent.change(screen.getByLabelText("Quantidade de Camiseta"), {
      target: { value: "2" },
    });

    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0][0] as FormData;
    expect(formData.get("isBundle")).toBe("true");
    expect(JSON.parse(formData.get("components") as string)).toEqual([
      { componentProductId: "p1", quantity: 2 },
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
  it("loads an existing bundle with its components", () => {
    renderForm({
      ...baseProduct,
      isBundle: true,
      components: [{ componentProductId: "p1", quantity: 2 }],
    });
    expect(
      (screen.getByLabelText("Produto Kit") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Quantidade de Camiseta") as HTMLInputElement)
        .value,
    ).toBe("2");
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
