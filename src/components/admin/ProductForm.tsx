"use client";

import { useState, ChangeEvent } from "react";
import { slugify } from "@/lib/utils";
import { ProductWithVariants } from "@/types";
import {
  productSchema,
  ALLOWED_SIZES,
  AllowedSize,
} from "@/lib/validations/product.schema";
import { uploadProductImage, deleteBlobImages } from "@/actions/blob.actions";
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

type DropOption = {
  id: string;
  name: string;
};

interface ProductFormProps {
  action: (formData: FormData) => Promise<void>;
  initialData?: ProductWithVariants;
  drops: DropOption[];
}

export function ProductForm({ action, initialData, drops }: ProductFormProps) {
  const isEditMode = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [selectedDropId, setSelectedDropId] = useState(
    initialData?.dropId ?? (drops[0]?.id || ""),
  );
  const [isAvailable, setIsAvailable] = useState<boolean>(
    initialData?.isAvailable ?? true,
  );

  const originalSlug = initialData?.slug ?? "";
  const currentSlug = slugify(name);

  const initialPriceDisplay = initialData
    ? (initialData.priceCents / 100).toFixed(2)
    : "";
  const [priceInput, setPriceInput] = useState(initialPriceDisplay);

  // Variants Management State
  const [variants, setVariants] = useState<
    { id?: string; size: AllowedSize; sortOrder: number }[]
  >(
    initialData?.variants?.map((v, idx) => ({
      id: v.id,
      size: v.size as AllowedSize,
      sortOrder: v.sortOrder ?? idx,
    })) ?? [],
  );

  const handleAddStandardShirtSizes = () => {
    const defaultSizes: AllowedSize[] = ["P", "M", "G"];
    setVariants(
      defaultSizes.map((size, index) => ({
        size,
        sortOrder: index,
      })),
    );
  };

  const handleAddSize = (sizeToAdd: AllowedSize) => {
    if (variants.some((v) => v.size === sizeToAdd)) return;
    setVariants((prev) => [
      ...prev,
      { size: sizeToAdd, sortOrder: prev.length },
    ]);
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, sortOrder: idx })),
    );
  };

  const handleMoveVariant = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= variants.length) return;

    const updated = [...variants];
    const [movedItem] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, movedItem);

    setVariants(updated.map((item, idx) => ({ ...item, sortOrder: idx })));
  };

  // Image Management State
  const [images, setImages] = useState<string[]>(initialData?.images ?? []);
  const [isUploading, setIsUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", file);

        const uploadedUrl = await uploadProductImage(uploadFormData);
        setImages((prev) => [...prev, uploadedUrl]);
      }
    } catch (err) {
      console.error("Erro ao enviar imagem:", err);
      setError(
        err instanceof Error ? err.message : "Falha ao enviar a imagem.",
      );
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveImage = async (indexToRemove: number) => {
    const urlToRemove = images[indexToRemove];

    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));

    try {
      await deleteBlobImages([urlToRemove]);
    } catch (err) {
      console.error("Erro ao remover imagem do servidor:", err);
      setError("Não foi possível remover a imagem do servidor.");
      setImages((prev) => [
        ...prev.slice(0, indexToRemove),
        urlToRemove,
        ...prev.slice(indexToRemove),
      ]);
    }
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
      isAvailable,
      variants,
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
    formData.set("isAvailable", validData.isAvailable ? "true" : "false");
    formData.set("variants", JSON.stringify(validData.variants));

    // Append image URLs to formData
    formData.delete("images");
    images.forEach((url) => formData.append("images", url));

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
      className="space-y-6 bg-white p-6 border rounded-md shadow-sm"
    >
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2 animate-in fade-in duration-200">
          {error}
        </p>
      )}

      <input type="hidden" name="slug" value={currentSlug} />

      {/* Product Availability Toggle */}
      <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-md">
        <div className="space-y-0.5">
          <label
            htmlFor="isAvailable"
            className="text-sm font-medium text-zinc-900 cursor-pointer"
          >
            Produto Disponível para Venda
          </label>
          <p className="text-xs text-zinc-500">
            Desmarque para indicar que o produto está esgotado na loja.
          </p>
        </div>
        <input
          type="checkbox"
          id="isAvailable"
          name="isAvailable"
          checked={isAvailable}
          onChange={(e) => setIsAvailable(e.target.checked)}
          disabled={isPending}
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
        />
      </div>

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

      {/* Product Images Management */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">
          Fotos do Produto
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {images.map((url, idx) => (
            <div
              key={url}
              className="relative aspect-square border rounded-md overflow-hidden group bg-zinc-100"
            >
              <img
                src={url}
                alt={`Foto ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                disabled={isPending || isUploading}
                className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 opacity-90 hover:bg-black transition-opacity"
                title="Remover imagem"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Add Image Upload Slot */}
          <label className="border-2 border-dashed border-zinc-300 hover:border-zinc-500 rounded-md aspect-square flex flex-col items-center justify-center cursor-pointer transition-colors bg-zinc-50 hover:bg-zinc-100 p-2 text-center">
            {isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            ) : (
              <>
                <ImagePlus className="w-6 h-6 text-zinc-400 mb-1" />
                <span className="text-xs text-zinc-600 font-medium">
                  Adicionar Foto
                </span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              disabled={isPending || isUploading}
              className="hidden"
            />
          </label>
        </div>
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

      {/* Sizes / Variants Selection */}
      <div className="space-y-3 pt-2 border-t border-zinc-100">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-zinc-900">
              Tamanhos (Camisetas)
            </label>
            <p className="text-xs text-zinc-500">
              Adicione os tamanhos disponíveis para este produto (P, M, G).
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddStandardShirtSizes}
            disabled={isPending}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded transition-colors"
          >
            Grade Padrão (P, M, G)
          </button>
        </div>

        {/* Quick Add Badges */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Adicionar:</span>
          {ALLOWED_SIZES.map((size) => {
            const isSelected = variants.some((v) => v.size === size);
            return (
              <button
                key={size}
                type="button"
                onClick={() => handleAddSize(size)}
                disabled={isPending || isSelected}
                className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded border transition-colors ${
                  isSelected
                    ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
                    : "bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-50 cursor-pointer"
                }`}
              >
                <Plus className="w-3 h-3" /> {size}
              </button>
            );
          })}
        </div>

        {/* Active Variants List */}
        {variants.length > 0 && (
          <div className="space-y-2 mt-2">
            {variants.map((variant, index) => (
              <div
                key={variant.size}
                className="flex items-center justify-between bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-md"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold bg-zinc-900 text-white w-6 h-6 rounded flex items-center justify-center">
                    {variant.size}
                  </span>
                  <span className="text-xs text-zinc-500">
                    Ordem: {variant.sortOrder}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMoveVariant(index, "up")}
                    disabled={isPending || index === 0}
                    className="p-1 text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveVariant(index, "down")}
                    disabled={isPending || index === variants.length - 1}
                    className="p-1 text-zinc-500 hover:text-zinc-900 disabled:opacity-30"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveVariant(index)}
                    disabled={isPending}
                    className="p-1 text-red-600 hover:text-red-800 disabled:opacity-30"
                    title="Remover tamanho"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={isPending || isUploading || drops.length === 0}
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
