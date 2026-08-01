"use client";

import { useState, ChangeEvent } from "react";
import { slugify } from "@/lib/utils";
import { Product } from "@/types";
import { productSchema } from "@/lib/validations/product.schema";
import { uploadProductImage, deleteBlobImages } from "@/actions/blob.actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import {
  ImageSquareIcon,
  CircleNotchIcon,
  XIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";



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
    <Card className="border-border/80 bg-surface shadow-panel">
      <CardContent className="p-6">
        <form action={clientAction} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/15 p-3 text-xs text-destructive">
              <WarningCircleIcon className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <input type="hidden" name="slug" value={currentSlug} />

          {/* Drop Selection */}
          <div className="space-y-2">
            <Label htmlFor="dropId">Drop / Coleção</Label>
            <select
              id="dropId"
              name="dropId"
              value={selectedDropId}
              onChange={(e) => setSelectedDropId(e.target.value)}
              disabled={isPending || drops.length === 0}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            >
              {drops.length === 0 ? (
                <option value="" className="bg-surface text-foreground">Nenhum Drop cadastrado</option>
              ) : (
                drops.map((drop) => (
                  <option key={drop.id} value={drop.id} className="bg-surface text-foreground">
                    {drop.name}
                  </option>
                ))
              )}
            </select>
            {drops.length === 0 && (
              <p className="text-xs text-destructive">
                É necessário criar pelo menos um Drop no banco antes de cadastrar produtos.
              </p>
            )}
          </div>

          {/* Product Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Produto</Label>
            <Input
              type="text"
              id="name"
              name="name"
              placeholder="ex: Camiseta Oversized Imortal"
              value={name}
              onChange={handleNameChange}
              disabled={isPending}
            />

            {!isEditMode ? (
              <p className="text-xs text-muted-foreground">
                Link permanente:{" "}
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                  {currentSlug || "..."}
                </span>
              </p>
            ) : (
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <p>
                  Link anterior:{" "}
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                    {originalSlug}
                  </span>
                </p>
                {currentSlug !== originalSlug && currentSlug !== "" && (
                  <p className="text-primary">
                    O link será alterado para:{" "}
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                      {currentSlug}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Product Images Management */}
          <div className="space-y-2">
            <Label>Fotos do Produto</Label>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {images.map((url, idx) => (
                <div
                  key={url}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-background"
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
                    className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/80 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive"
                    title="Remover imagem"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}

              {/* Add Image Upload Slot */}
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-background/50 p-2 text-center transition-colors hover:border-primary/60 hover:bg-accent/40">
                {isUploading ? (
                  <CircleNotchIcon className="size-6 animate-spin text-primary" />
                ) : (
                  <>
                    <ImageSquareIcon className="mb-1.5 size-6 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
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
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              placeholder="Descreva os detalhes do produto, tecido, caimento..."
              defaultValue={initialData?.description ?? ""}
              disabled={isPending}
            />
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="price">Preço (R$)</Label>
            <div className="relative">
              <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                <span className="text-sm font-medium text-muted-foreground">R$</span>
              </div>
              <Input
                type="number"
                id="price"
                name="price"
                step="0.01"
                placeholder="0.00"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                disabled={isPending}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isPending || isUploading || drops.length === 0}
            >
              {isPending ? (
                <>
                  <CircleNotchIcon className="mr-2 size-4 animate-spin" />
                  Salvando...
                </>
              ) : isEditMode ? (
                "Salvar Alterações"
              ) : (
                "Salvar Produto"
              )}
            </Button>
          </div>

        </form>
      </CardContent>
    </Card>
  );
}

