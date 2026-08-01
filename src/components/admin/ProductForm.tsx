"use client";

import { useState, ChangeEvent } from "react";
import { slugify } from "@/lib/utils";
import { Product } from "@/types";
import { productSchema } from "@/lib/validations/product.schema";
import { uploadProductImage, deleteBlobImages } from "@/actions/blob.actions";
import { ImagePlus, Loader2, X } from "lucide-react";

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
    initialData?.dropId ?? (drops[0]?.id || "")
  );

  const originalSlug = initialData?.slug ?? "";
  const currentSlug = slugify(name);

  const initialPriceDisplay = initialData
    ? (initialData.priceCents / 100).toFixed(2)
    : "";
  const [priceInput, setPriceInput] = useState(initialPriceDisplay);

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
        err instanceof Error ? err.message : "Falha ao enviar a imagem."
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
          : "Não foi possível salvar o produto."
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form
      action={clientAction}
      className="space-y-6 rounded-md border bg-white p-6 shadow-sm"
    >
      {error && (
        <p className="animate-in rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 duration-200 fade-in">
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
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:opacity-50"
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
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:opacity-50"
        />

        {!isEditMode ? (
          <p className="mt-1 text-xs text-zinc-500">
            Link permanente:{" "}
            <span className="rounded bg-zinc-50 px-1 py-0.5 font-mono text-zinc-700">
              {currentSlug || "..."}
            </span>
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            <p className="text-xs text-zinc-500">
              Link anterior:{" "}
              <span className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-zinc-700">
                {originalSlug}
              </span>
            </p>
            {currentSlug !== originalSlug && currentSlug !== "" && (
              <p className="text-xs text-orange-400">
                O link será alterado para:{" "}
                <span className="rounded bg-blue-50 px-1 py-0.5 font-mono">
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

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {images.map((url, idx) => (
            <div
              key={url}
              className="group relative aspect-square overflow-hidden rounded-md border bg-zinc-100"
            >
              <img
                src={url}
                alt={`Foto ${idx + 1}`}
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                disabled={isPending || isUploading}
                className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white opacity-90 transition-opacity hover:bg-black"
                title="Remover imagem"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}

          {/* Add Image Upload Slot */}
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 p-2 text-center transition-colors hover:border-zinc-500 hover:bg-zinc-100">
            {isUploading ? (
              <Loader2 className="size-6 animate-spin text-zinc-500" />
            ) : (
              <>
                <ImagePlus className="mb-1 size-6 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-600">
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
          className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:opacity-50"
        />
      </div>

      {/* Price */}
      <div className="space-y-2">
        <label htmlFor="price" className="text-sm font-medium text-zinc-900">
          Preço (R$)
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
            <span className="text-sm text-zinc-500">R$</span>
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
            className="block h-10 w-full rounded-md border border-zinc-200 bg-white py-2 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none disabled:opacity-50"
          />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          type="submit"
          disabled={isPending || isUploading || drops.length === 0}
          className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-900/90 disabled:opacity-50"
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
