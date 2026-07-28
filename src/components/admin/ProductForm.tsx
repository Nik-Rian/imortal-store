"use client";

import { useState, ChangeEvent } from "react";
import { slugify } from "@/lib/utils";
import { Product } from "@/types";
import { productSchema } from "@/lib/validations/product.schema";

type DropOption = {
  id: string;
  name: string;
};

interface ProductFormProps {
  action: (formData: FormData) => Promise<void>;
  initialData?: Product;
  drops: DropOption[];
}

export function ProductForm({ action, initialData, drops }: ProductFormProps) {
  const isEditMode = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [selectedDropId, setSelectedDropId] = useState(
    initialData?.dropId ?? (drops[0]?.id || ""),
  );

  const originalSlug = initialData?.slug ?? "";
  const currentSlug = slugify(name);

  const initialPriceDisplay = initialData
    ? (initialData.priceCents / 100).toFixed(2)
    : "";
  const [priceInput, setPriceInput] = useState(initialPriceDisplay);

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const clientAction = async (formData: FormData) => {
    setError(null);

    const description = (formData.get("description") as string) ?? "";
    const parsedDisplayPrice = parseFloat(priceInput);
    const priceCents = isNaN(parsedDisplayPrice)
      ? NaN
      : Math.round(parsedDisplayPrice * 100);

    const validationResult = productSchema.safeParse({
      name,
      slug: currentSlug,
      description,
      dropId: selectedDropId,
      priceCents,
    });

    if (!validationResult.success) {
      const firstErrorMessage =
        validationResult.error.issues[0]?.message ??
        "Por favor, verifique os campos do formulário.";
      setError(firstErrorMessage);
      return;
    }

    const validData = validationResult.data;

    formData.set("name", validData.name);
    formData.set("slug", validData.slug);
    formData.set("description", validData.description);
    formData.set("priceCents", validData.priceCents.toString());
    formData.set("dropId", validData.dropId);

    setIsPending(true);
    try {
      await action(formData);
    } catch (err) {
      console.error("Erro ao salvar produto:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar o produto.",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form
      action={clientAction}
      className="space-y-4 bg-white p-6 border rounded-md shadow-sm"
    >
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2 animate-in fade-in duration-200">
          {error}
        </p>
      )}

      <input type="hidden" name="slug" value={currentSlug} />

      {/* Drop Selection */}
      <div className="space-y-2">
        <label htmlFor="dropId" className="text-sm font-medium text-zinc-900">
          Drop
        </label>
        <select
          id="dropId"
          name="dropId"
          value={selectedDropId}
          onChange={(e) => setSelectedDropId(e.target.value)}
          disabled={isPending || drops.length === 0}
          className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:opacity-50"
        >
          {drops.length === 0 ? (
            <option value="">Nenhum Drop cadastrado</option>
          ) : (
            drops.map((drop) => (
              <option key={drop.id} value={drop.id}>
                {drop.name}
              </option>
            ))
          )}
        </select>
        {drops.length === 0 && (
          <p className="text-xs text-red-500">
            É necessário criar pelo menos um Drop no banco antes de cadastrar
            produtos.
          </p>
        )}
      </div>

      {/* Product Name */}
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-zinc-900">
          Nome do Produto
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={name}
          onChange={handleNameChange}
          disabled={isPending}
          className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:opacity-50"
        />

        {!isEditMode ? (
          <p className="text-xs text-zinc-500 mt-1">
            Link permanente:{" "}
            <span className="font-mono bg-zinc-50 text-zinc-700 px-1 py-0.5 rounded">
              {currentSlug || "..."}
            </span>
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            <p className="text-xs text-zinc-500">
              Link anterior:{" "}
              <span className="font-mono bg-zinc-100 text-zinc-700 px-1 py-0.5 rounded">
                {originalSlug}
              </span>
            </p>
            {currentSlug !== originalSlug && currentSlug !== "" && (
              <p className="text-xs text-orange-400">
                O link será alterado para:{" "}
                <span className="font-mono bg-blue-50 px-1 py-0.5 rounded">
                  {currentSlug}
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label
          htmlFor="description"
          className="text-sm font-medium text-zinc-900"
        >
          Descrição
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={initialData?.description ?? ""}
          disabled={isPending}
          className="w-full flex rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:opacity-50"
        />
      </div>

      {/* Price */}
      <div className="space-y-2">
        <label htmlFor="price" className="text-sm font-medium text-zinc-900">
          Preço (R$)
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <span className="text-zinc-500 text-sm">R$</span>
          </div>
          <input
            type="number"
            id="price"
            name="price"
            step="0.01"
            placeholder="0.00"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            disabled={isPending}
            style={{ paddingLeft: "2.5rem" }}
            className="w-full block h-10 rounded-md border border-zinc-200 bg-white pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:opacity-50"
          />
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={isPending || drops.length === 0}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 h-10 px-4 py-2 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isPending
            ? "Salvando..."
            : isEditMode
              ? "Salvar Alterações"
              : "Salvar Produto"}
        </button>
      </div>
    </form>
  );
}
