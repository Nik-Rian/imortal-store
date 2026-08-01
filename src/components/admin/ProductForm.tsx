"use client";

import { useState, ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { slugify } from "@/lib/utils";
import { Product } from "@/types";
import { uploadProductImage, deleteBlobImages } from "@/actions/blob.actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";

import {
  ImageSquareIcon,
  CircleNotchIcon,
  XIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

const productFormSchema = z.object({
  name: z.string().trim().min(1, "O nome do produto é obrigatório."),
  slug: z.string().trim().min(1, "O link permanente é obrigatório."),
  description: z.string().trim().min(1, "A descrição do produto é obrigatória."),
  dropId: z.string().min(1, "Por favor, selecione um Drop para o produto."),
  price: z
    .string()
    .min(1, "Por favor, insira um preço válido.")
    .refine(
      (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
      "O preço deve ser um valor numérico positivo."
    ),
  images: z.array(z.string()),
});

type ProductFormValues = z.infer<typeof productFormSchema>;


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
  const [isUploading, setIsUploading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      slug: initialData?.slug ?? "",
      description: initialData?.description ?? "",
      dropId: initialData?.dropId ?? (drops[0]?.id || ""),
      price: initialData ? (initialData.priceCents / 100).toFixed(2) : "",
      images: initialData?.images ?? [],
    },
  });

  const nameValue = watch("name");
  const images = watch("images");
  const currentSlug = slugify(nameValue || "");

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setServerError(null);

    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", file);

        const uploadedUrl = await uploadProductImage(uploadFormData);
        newUrls.push(uploadedUrl);
      }
      setValue("images", [...images, ...newUrls], { shouldValidate: true });
    } catch (err) {
      console.error("Erro ao enviar imagem:", err);
      setServerError(
        err instanceof Error ? err.message : "Falha ao enviar a imagem."
      );
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveImage = async (indexToRemove: number) => {
    const urlToRemove = images[indexToRemove];
    const updatedImages = images.filter((_, idx) => idx !== indexToRemove);

    setValue("images", updatedImages, { shouldValidate: true });

    try {
      await deleteBlobImages([urlToRemove]);
    } catch (err) {
      console.error("Erro ao remover imagem do servidor:", err);
      setServerError("Não foi possível remover a imagem do servidor.");
      setValue("images", images, { shouldValidate: true });
    }
  };

  const onSubmit = async (data: ProductFormValues) => {
    setServerError(null);

    const parsedDisplayPrice = parseFloat(data.price);
    const priceCents = Math.round(parsedDisplayPrice * 100);

    const formData = new FormData();
    formData.set("name", data.name);
    formData.set("slug", currentSlug);
    formData.set("description", data.description);
    formData.set("priceCents", priceCents.toString());
    formData.set("dropId", data.dropId);

    data.images.forEach((url) => formData.append("images", url));

    try {
      await action(formData);
    } catch (err) {
      console.error("Erro ao salvar produto:", err);
      setServerError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar o produto."
      );
    }
  };

  return (
    <Card className="border-border/80 bg-surface shadow-panel">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {serverError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/15 p-3 text-xs text-destructive">
              <WarningCircleIcon className="size-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <FieldGroup className="gap-6">
            {/* Drop Selection */}
            <Field data-invalid={!!errors.dropId}>
              <FieldLabel htmlFor="dropId">Drop / Coleção</FieldLabel>
              <select
                id="dropId"
                disabled={isSubmitting || drops.length === 0}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                {...register("dropId")}
              >
                {drops.length === 0 ? (
                  <option value="" className="bg-surface text-foreground">
                    Nenhum Drop cadastrado
                  </option>
                ) : (
                  drops.map((drop) => (
                    <option
                      key={drop.id}
                      value={drop.id}
                      className="bg-surface text-foreground"
                    >
                      {drop.name}
                    </option>
                  ))
                )}
              </select>
              {drops.length === 0 && (
                <FieldDescription className="text-destructive">
                  É necessário criar pelo menos um Drop no banco antes de cadastrar produtos.
                </FieldDescription>
              )}
              {errors.dropId?.message && (
                <FieldError>{errors.dropId.message}</FieldError>
              )}
            </Field>

            {/* Product Name */}
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Nome do Produto</FieldLabel>
              <Input
                id="name"
                placeholder="ex: Camiseta Oversized Imortal"
                disabled={isSubmitting}
                {...register("name", {
                  onChange: (e) => {
                    setValue("slug", slugify(e.target.value), { shouldValidate: true });
                  },
                })}
              />
              <FieldDescription>
                Link permanente:{" "}
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                  {currentSlug || "..."}
                </span>
              </FieldDescription>
              {errors.name?.message && (
                <FieldError>{errors.name.message}</FieldError>
              )}
            </Field>

            {/* Product Images Management */}
            <Field data-invalid={!!errors.images}>
              <FieldLabel>Fotos do Produto</FieldLabel>
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
                      disabled={isSubmitting || isUploading}
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
                    disabled={isSubmitting || isUploading}
                    className="hidden"
                  />
                </label>
              </div>
              {errors.images?.message && (
                <FieldError>{errors.images.message}</FieldError>
              )}
            </Field>

            {/* Description */}
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="description">Descrição</FieldLabel>
              <Textarea
                id="description"
                rows={4}
                placeholder="Descreva os detalhes do produto, tecido, caimento..."
                disabled={isSubmitting}
                {...register("description")}
              />
              {errors.description?.message && (
                <FieldError>{errors.description.message}</FieldError>
              )}
            </Field>

            {/* Price */}
            <Field data-invalid={!!errors.price}>
              <FieldLabel htmlFor="price">Preço (R$)</FieldLabel>
              <div className="relative">
                <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                  <span className="text-sm font-medium text-muted-foreground">R$</span>
                </div>
                <Input
                  type="number"
                  id="price"
                  step="0.01"
                  placeholder="0.00"
                  disabled={isSubmitting}
                  className="pl-9"
                  {...register("price")}
                />
              </div>
              {errors.price?.message && (
                <FieldError>{errors.price.message}</FieldError>
              )}
            </Field>
          </FieldGroup>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isSubmitting || isUploading || drops.length === 0}
            >
              {isSubmitting ? (
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


