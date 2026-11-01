"use client";

import { useState, ChangeEvent } from "react";
import { slugify } from "@/lib/utils";
import { ProductWithVariants, BundleComponentOption } from "@/types";
import {
  productSchema,
  applyBundleRules,
  ALLOWED_SIZES,
  AllowedSize,
} from "@/lib/validations/product.schema";
import { uploadProductImage, deleteBlobImages } from "@/actions/blob.actions";
import {
  MAX_IMAGE_BYTES,
  IMAGE_SIZE_ERROR,
  IMAGE_TYPE_ERROR,
  isAllowedImageType,
} from "@/lib/media";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";

type DropOption = {
  id: string;
  name: string;
};

interface ProductFormProps {
  action: (formData: FormData) => Promise<void>;
  initialData?: ProductWithVariants;
  drops: DropOption[];
  componentOptions: BundleComponentOption[];
}

export function ProductForm({
  action,
  initialData,
  drops,
  componentOptions,
}: ProductFormProps) {
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

  // New Configuration Flags
  const [controlStock, setControlStock] = useState<boolean>(
    initialData?.controlStock ?? false,
  );
  const [hasSizes, setHasSizes] = useState<boolean>(
    initialData?.hasSizes ?? false,
  );
  const [hasVariants, setHasVariants] = useState<boolean>(
    initialData?.hasVariants ?? false,
  );
  const [showVariantsInStore, setShowVariantsInStore] = useState<boolean>(
    initialData?.showVariantsInStore ?? true,
  );

  // Bundle state
  const [isBundle, setIsBundle] = useState<boolean>(
    initialData?.isBundle ?? false,
  );
  const [components, setComponents] = useState<
    { componentProductId: string; quantity: number }[]
  >(
    initialData?.components?.map((c) => ({
      componentProductId: c.componentProductId,
      quantity: c.quantity,
    })) ?? [],
  );
  // A product that already belongs to a bundle can't become
  // one or change drop , so the form blocks both up front.
  const isUsedAsComponent = (initialData?._count?.componentOf ?? 0) > 0;
  const availableComponentOptions = componentOptions.filter(
    (o) =>
      !o.isBundle &&
      o.dropId === selectedDropId &&
      o.id !== initialData?.id &&
      !components.some((c) => c.componentProductId === o.id),
  );

  // Split Size State
  const [sizes, setSizes] = useState<
    {
      id?: string;
      size: AllowedSize;
      sortOrder: number;
      isAvailable: boolean;
    }[]
  >(
    initialData?.sizes?.map((s, idx) => ({
      ...s,
      size: s.size as AllowedSize,
      sortOrder: s.sortOrder ?? idx,
      isAvailable: s.isAvailable ?? true,
    })) ?? [],
  );

  // Split Variant State
  const [variants, setVariants] = useState<
    {
      id?: string;
      name: string;
      image: string | null;
      sortOrder: number;
      isAvailable: boolean;
    }[]
  >(
    initialData?.variants?.map((v, idx) => ({
      ...v,
      image: v.image ?? null,
      sortOrder: v.sortOrder ?? idx,
      isAvailable: v.isAvailable ?? true,
    })) ?? [],
  );

  // Image Management State
  const [images, setImages] = useState<string[]>(initialData?.images ?? []);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  // --- Handlers for Bundles ---
  const handleDropChange = (dropId: string) => {
    setSelectedDropId(dropId);
    // Components must belong to the bundle's drop (BD-04).
    setComponents((prev) =>
      prev.filter((c) =>
        componentOptions.some(
          (o) => o.id === c.componentProductId && o.dropId === dropId,
        ),
      ),
    );
  };

  const handleAddComponent = (productId: string) => {
    if (!productId) return;
    setComponents((prev) =>
      prev.some((c) => c.componentProductId === productId)
        ? prev
        : [...prev, { componentProductId: productId, quantity: 1 }],
    );
  };

  const handleComponentQuantityChange = (
    productId: string,
    rawValue: string,
  ) => {
    const quantity = Math.max(1, parseInt(rawValue, 10) || 1);
    setComponents((prev) =>
      prev.map((c) =>
        c.componentProductId === productId ? { ...c, quantity } : c,
      ),
    );
  };

  const handleRemoveComponent = (productId: string) => {
    setComponents((prev) =>
      prev.filter((c) => c.componentProductId !== productId),
    );
  };

  // --- Handlers for Sizes ---
  const handleAddStandardShirtSizes = () => {
    const defaultSizes: AllowedSize[] = ["P", "M", "G", "GG", "XGG"];
    setSizes(
      defaultSizes.map((size) => ({
        size,
        sortOrder: ALLOWED_SIZES.indexOf(size),
        isAvailable: true,
      })),
    );
    setHasSizes(true);
  };

  const handleToggleSize = (size: AllowedSize, index: number) => {
    setSizes((prev) => {
      const exists = prev.some((s) => s.size === size);
      if (exists) {
        const updated = prev.filter((s) => s.size !== size);
        if (updated.length === 0) setHasSizes(false);
        return updated;
      } else {
        setHasSizes(true);
        return [...prev, { size, sortOrder: index, isAvailable: true }];
      }
    });
  };

  // --- Handlers for Variants ---
  const handleAddVariant = () => {
    setVariants((prev) => [
      ...prev,
      { name: "", image: null, sortOrder: prev.length, isAvailable: true },
    ]);
    setHasVariants(true);
  };

  const handleVariantNameChange = (index: number, newName: string) => {
    setVariants((prev) =>
      prev.map((v, idx) => (idx === index ? { ...v, name: newName } : v)),
    );
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) => {
      const updated = prev
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, sortOrder: idx }));
      if (updated.length === 0) setHasVariants(false);
      return updated;
    });
  };

  // --- Handlers for Inputs & Images ---
  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const uploadImageFile = async (file: File): Promise<string> => {
    // Pre-check so oversized/wrong files never hit the Server Action body limit.
    if (!isAllowedImageType(file.type)) throw new Error(IMAGE_TYPE_ERROR);
    if (file.size > MAX_IMAGE_BYTES) throw new Error(IMAGE_SIZE_ERROR);
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);
    const result = await uploadProductImage(uploadFormData);
    if (!result.success) throw new Error(result.error);
    return result.url;
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const uploadedUrl = await uploadImageFile(file);
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

  const handleVariantImageChange = async (
    index: number,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const url = await uploadImageFile(file);
      setVariants((prev) =>
        prev.map((v, idx) => (idx === index ? { ...v, image: url } : v)),
      );
    } catch (err) {
      console.error("Erro ao enviar imagem da variante:", err);
      setError(
        err instanceof Error ? err.message : "Falha ao enviar a imagem.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  // The old blob is deleted server-side when the product is saved.
  const handleRemoveVariantImage = (index: number) => {
    setVariants((prev) =>
      prev.map((v, idx) => (idx === index ? { ...v, image: null } : v)),
    );
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

    // Ensure sizes are sorted properly by their explicit ALLOWED_SIZES order before saving
    const sortedSizes = [...sizes].sort((a, b) => a.sortOrder - b.sortOrder);

    const validationResult = productSchema.safeParse({
      name,
      slug: currentSlug,
      description,
      dropId: selectedDropId,
      priceCents,
      isAvailable,
      controlStock,
      hasSizes,
      hasVariants,
      showVariantsInStore,
      sizes: isBundle ? [] : sortedSizes,
      variants: isBundle ? [] : variants,
      isBundle,
      components,
    });

    if (!validationResult.success) {
      const firstErrorMessage =
        validationResult.error.issues[0]?.message ??
        "Por favor, verifique os campos do formulário.";
      setError(firstErrorMessage);
      return;
    }

    const validData = applyBundleRules(validationResult.data);

    // Append standard form data flags for the server action
    formData.set("controlStock", validData.controlStock ? "true" : "false");
    formData.set("hasSizes", validData.hasSizes ? "true" : "false");
    formData.set("hasVariants", validData.hasVariants ? "true" : "false");
    formData.set(
      "showVariantsInStore",
      validData.showVariantsInStore ? "true" : "false",
    );
    formData.set("sizes", JSON.stringify(validData.sizes));
    formData.set("variants", JSON.stringify(validData.variants));

    // dropId is set explicitly because a disabled <select> is left out of FormData.
    formData.set("dropId", validData.dropId);
    formData.set("isBundle", validData.isBundle ? "true" : "false");
    formData.set("components", JSON.stringify(validData.components));

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
  };;

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

      {/* Configurations Toggle Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Availability */}
        <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-md">
          <div className="space-y-0.5">
            <label className="text-sm font-medium text-zinc-900 cursor-pointer">
              Disponível na loja
            </label>
            <p className="text-xs text-zinc-500">Exibe o produto p/ venda.</p>
          </div>
          <input
            type="checkbox"
            name="isAvailable"
            checked={isAvailable}
            onChange={(e) => setIsAvailable(e.target.checked)}
            disabled={isPending}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
          />
        </div>

        {/* Bundle */}
        <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-md">
          <div className="space-y-0.5">
            <label
              htmlFor="isBundle"
              className="text-sm font-medium text-zinc-900 cursor-pointer"
            >
              Produto Kit
            </label>
            <p className="text-xs text-zinc-500">
              {isUsedAsComponent
                ? "Este produto faz parte de kits e não pode se tornar um kit."
                : "Vende vários produtos juntos. Não tem estoque, tamanhos nem variantes próprios."}
            </p>
          </div>
          <input
            id="isBundle"
            type="checkbox"
            checked={isBundle}
            onChange={(e) => setIsBundle(e.target.checked)}
            disabled={isPending || isUsedAsComponent}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
          />
        </div>

        {!isBundle && (
          <>
            {/* Control Stock */}
            <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-md">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-zinc-900 cursor-pointer">
                  Controlar Estoque
                </label>
                <p className="text-xs text-zinc-500">
                  Bloqueia vendas sem saldo.
                </p>
              </div>
              <input
                type="checkbox"
                checked={controlStock}
                onChange={(e) => setControlStock(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
              />
            </div>

            {/* Has Sizes */}
            <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-md">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-zinc-900 cursor-pointer">
                  Possui Tamanhos
                </label>
                <p className="text-xs text-zinc-500">
                  Habilita a seleção de tamanhos.
                </p>
              </div>
              <input
                type="checkbox"
                checked={hasSizes}
                onChange={(e) => setHasSizes(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
              />
            </div>

            {/* Has Variants */}
            <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-md">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-zinc-900 cursor-pointer">
                  Possui Variantes
                </label>
                <p className="text-xs text-zinc-500">
                  Exige escolha (ex: Cores).
                </p>
              </div>
              <input
                type="checkbox"
                checked={hasVariants}
                onChange={(e) => setHasVariants(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
              />
            </div>

            {/* Show Variants in Store */}
            <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-md">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-zinc-900 cursor-pointer">
                  Exibir Variantes
                </label>
                <p className="text-xs text-zinc-500">
                  Mostra variantes na vitrine.
                </p>
              </div>
              <input
                type="checkbox"
                checked={showVariantsInStore}
                onChange={(e) => setShowVariantsInStore(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
              />
            </div>
          </>
        )}
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
          onChange={(e) => handleDropChange(e.target.value)}
          disabled={isPending || drops.length === 0 || isUsedAsComponent}
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
        {isUsedAsComponent && (
          <p className="text-xs text-zinc-500">
            Este produto faz parte de kits e não pode ser movido para outro
            drop.
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
          </div>
        )}
      </div>

      {/* Product Images Management */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-900">
          {isBundle ? "Foto Principal do Kit" : "Fotos do Produto"}
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
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <label className="border-2 border-dashed border-zinc-300 hover:border-zinc-500 rounded-md aspect-square flex flex-col items-center justify-center cursor-pointer bg-zinc-50 hover:bg-zinc-100 text-center">
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
              accept="image/jpeg,image/png,image/webp"
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

      {!isBundle && (
        <>
          {/* Sizes Selection */}
          <div
            className={`space-y-3 pt-4 border-t border-zinc-100 ${!hasSizes ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-zinc-900">
                  Tamanhos
                </label>
                <p className="text-xs text-zinc-500">
                  Selecione os tamanhos disponíveis (Ative &quot;Possui
                  Tamanhos&quot; acima para editar).
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddStandardShirtSizes}
                disabled={isPending}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded transition-colors"
              >
                Selecionar Todos (P ao XGG)
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {ALLOWED_SIZES.map((size, index) => {
                const isSelected = sizes.some((s) => s.size === size);

                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handleToggleSize(size, index)}
                    disabled={isPending}
                    className={`flex items-center justify-center w-12 h-12 text-sm font-bold rounded-md border transition-all ${
                      isSelected
                        ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                        : "bg-zinc-50 text-zinc-400 border-zinc-200 hover:bg-zinc-100 hover:text-zinc-600"
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Variants Selection */}
          <div
            className={`space-y-3 pt-4 border-t border-zinc-100 ${!hasVariants ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-zinc-900">
                  Variantes
                </label>
                <p className="text-xs text-zinc-500">
                  Cores, materiais ou modelos. (Ative &quot;Possui
                  Variantes&quot; acima para editar).
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddVariant}
                disabled={isPending}
                className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1.5 rounded transition-colors"
              >
                Adicionar Variante
              </button>
            </div>

            {variants.length > 0 && (
              <div className="space-y-2 mt-2">
                {variants.map((variant, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-md gap-4"
                  >
                    <div className="relative h-12 w-12 shrink-0">
                      {variant.image ? (
                        <>
                          <img
                            src={variant.image}
                            alt={`Foto da variante ${variant.name || index + 1}`}
                            className="h-12 w-12 rounded border object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveVariantImage(index)}
                            disabled={isPending || isUploading}
                            className="absolute -top-1 -right-1 bg-black/70 text-white rounded-full p-0.5 hover:bg-black"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded border-2 border-dashed border-zinc-300 bg-white hover:border-zinc-500">
                          <ImagePlus className="w-4 h-4 text-zinc-400" />
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => handleVariantImageChange(index, e)}
                            disabled={isPending || isUploading}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Nome da variante (ex: Preto)"
                        value={variant.name}
                        onChange={(e) =>
                          handleVariantNameChange(index, e.target.value)
                        }
                        className="w-full flex h-8 rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(index)}
                        disabled={isPending || isUploading}
                        className="p-1 text-red-600 hover:text-red-800 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Bundle Components */}
      {isBundle && (
        <div className="space-y-3 pt-4 border-t border-zinc-100">
          <div>
            <label
              htmlFor="bundleComponentPicker"
              className="text-sm font-medium text-zinc-900"
            >
              Produtos do Kit
            </label>
            <p className="text-xs text-zinc-500">
              Apenas produtos comuns do drop selecionado. O cliente escolhe
              tamanho e variante de cada unidade.
            </p>
          </div>
          <select
            id="bundleComponentPicker"
            value=""
            onChange={(e) => handleAddComponent(e.target.value)}
            disabled={isPending || availableComponentOptions.length === 0}
            className="w-full flex h-10 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:opacity-50"
          >
            <option value="">
              {availableComponentOptions.length === 0
                ? "Nenhum produto disponível"
                : "Adicionar produto ao kit..."}
            </option>
            {availableComponentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          {components.length > 0 && (
            <div className="space-y-2">
              {components.map((component) => {
                const label =
                  componentOptions.find(
                    (o) => o.id === component.componentProductId,
                  )?.name ?? "Produto indisponível";
                return (
                  <div
                    key={component.componentProductId}
                    className="flex items-center justify-between bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-md gap-4"
                  >
                    <span className="flex-1 text-sm text-zinc-900">
                      {label}
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      aria-label={`Quantidade de ${label}`}
                      value={component.quantity}
                      onChange={(e) =>
                        handleComponentQuantityChange(
                          component.componentProductId,
                          e.target.value,
                        )
                      }
                      disabled={isPending}
                      className="w-20 h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900"
                    />
                    <button
                      type="button"
                      aria-label={`Remover ${label}`}
                      onClick={() =>
                        handleRemoveComponent(component.componentProductId)
                      }
                      disabled={isPending}
                      className="p-1 text-red-600 hover:text-red-800 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
