"use client";

import { useState, ChangeEvent } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
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
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

const ALL_SIZES = ["PP", "P", "M", "G", "GG", "XG"];

const specItemSchema = z.object({
  label: z.string().trim(),
  value: z.string().trim(),
});

const productFormSchema = z.object({
  code: z.string().trim().optional(),
  name: z.string().trim().min(1, "O nome do produto é obrigatório."),
  slug: z.string().trim().min(1, "O link permanente é obrigatório."),
  line: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  description: z.string().trim().min(1, "A descrição do produto é obrigatória."),
  story: z.string().trim().optional(),
  dropId: z.string().min(1, "Por favor, selecione um Drop para o produto."),
  price: z
    .string()
    .min(1, "Por favor, insira um preço válido.")
    .refine(
      (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
      "O preço deve ser um valor numérico positivo."
    ),
  images: z.array(z.string()),
  sizes: z.array(z.string()),
  specs: z.array(specItemSchema),
  highlights: z.array(z.string()),
  care: z.array(z.string()),
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

  const initialSizes = initialData?.variants?.map((v) => v.size) ?? ["PP", "P", "M", "G", "GG", "XG"];
  const initialSpecs = Array.isArray(initialData?.specs) ? (initialData.specs as { label: string; value: string }[]) : [];
  const initialHighlights = initialData?.highlights ?? [];
  const initialCare = initialData?.care ?? [];

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      code: initialData?.code ?? "",
      name: initialData?.name ?? "",
      slug: initialData?.slug ?? "",
      line: initialData?.line ?? "",
      tag: initialData?.tag ?? "",
      description: initialData?.description ?? "",
      story: initialData?.story ?? "",
      dropId: initialData?.dropId ?? (drops[0]?.id || ""),
      price: initialData ? (initialData.priceCents / 100).toFixed(2) : "",
      images: initialData?.images ?? [],
      sizes: initialSizes.length > 0 ? initialSizes : ALL_SIZES,
      specs: initialSpecs.length > 0 ? initialSpecs : [
        { label: "Tecido", value: "" },
        { label: "Modelagem", value: "" },
      ],
      highlights: initialHighlights.length > 0 ? initialHighlights : [""],
      care: initialCare.length > 0 ? initialCare : [""],
    },
  });

  const {
    fields: specFields,
    append: appendSpec,
    remove: removeSpec,
  } = useFieldArray({
    control,
    name: "specs",
  });

  const nameValue = useWatch({ control, name: "name" });
  const images = useWatch({ control, name: "images" }) ?? [];
  const selectedSizes = useWatch({ control, name: "sizes" }) ?? [];
  const highlights = useWatch({ control, name: "highlights" }) ?? [];
  const care = useWatch({ control, name: "care" }) ?? [];
  const currentSlug = slugify(nameValue || "");

  const toggleSize = (size: string) => {
    if (selectedSizes.includes(size)) {
      setValue(
        "sizes",
        selectedSizes.filter((s) => s !== size),
        { shouldValidate: true }
      );
    } else {
      setValue("sizes", [...selectedSizes, size], { shouldValidate: true });
    }
  };

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

  const addHighlight = () => {
    setValue("highlights", [...highlights, ""], { shouldValidate: true });
  };

  const removeHighlight = (idx: number) => {
    setValue(
      "highlights",
      highlights.filter((_, i) => i !== idx),
      { shouldValidate: true }
    );
  };

  const updateHighlight = (idx: number, val: string) => {
    const next = [...highlights];
    next[idx] = val;
    setValue("highlights", next, { shouldValidate: true });
  };

  const addCare = () => {
    setValue("care", [...care, ""], { shouldValidate: true });
  };

  const removeCare = (idx: number) => {
    setValue(
      "care",
      care.filter((_, i) => i !== idx),
      { shouldValidate: true }
    );
  };

  const updateCare = (idx: number, val: string) => {
    const next = [...care];
    next[idx] = val;
    setValue("care", next, { shouldValidate: true });
  };

  const onSubmit = async (data: ProductFormValues) => {
    setServerError(null);

    const parsedDisplayPrice = parseFloat(data.price);
    const priceCents = Math.round(parsedDisplayPrice * 100);

    const formData = new FormData();
    formData.set("code", data.code || "");
    formData.set("name", data.name);
    formData.set("slug", currentSlug);
    formData.set("line", data.line || "");
    formData.set("tag", data.tag || "");
    formData.set("description", data.description);
    formData.set("story", data.story || "");
    formData.set("priceCents", priceCents.toString());
    formData.set("dropId", data.dropId);

    const validSpecs = data.specs.filter((s) => s.label.trim() && s.value.trim());
    const validHighlights = data.highlights.filter((h) => h.trim());
    const validCare = data.care.filter((c) => c.trim());

    formData.set("specs", JSON.stringify(validSpecs));
    formData.set("highlights", JSON.stringify(validHighlights));
    formData.set("care", JSON.stringify(validCare));
    formData.set("sizes", JSON.stringify(data.sizes));

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

            {/* Code, Line, Tag Grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={!!errors.code}>
                <FieldLabel htmlFor="code">Código / SKU</FieldLabel>
                <Input
                  id="code"
                  placeholder="ex: IMT-001"
                  disabled={isSubmitting}
                  {...register("code")}
                />
              </Field>

              <Field data-invalid={!!errors.line}>
                <FieldLabel htmlFor="line">Linha do Produto</FieldLabel>
                <Input
                  id="line"
                  placeholder="ex: Linha Guardiã"
                  disabled={isSubmitting}
                  {...register("line")}
                />
              </Field>

              <Field data-invalid={!!errors.tag}>
                <FieldLabel htmlFor="tag">Tag / Selo Promocional</FieldLabel>
                <Input
                  id="tag"
                  placeholder="ex: Mais vendida"
                  disabled={isSubmitting}
                  {...register("tag")}
                />
              </Field>
            </div>

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
              <FieldLabel htmlFor="description">Descrição Resumida</FieldLabel>
              <Textarea
                id="description"
                rows={3}
                placeholder="Descreva o resumo do produto, tecido, gramatura..."
                disabled={isSubmitting}
                {...register("description")}
              />
              {errors.description?.message && (
                <FieldError>{errors.description.message}</FieldError>
              )}
            </Field>

            {/* Story / Narrative */}
            <Field data-invalid={!!errors.story}>
              <FieldLabel htmlFor="story">História / Conceito da Peça</FieldLabel>
              <Textarea
                id="story"
                rows={4}
                placeholder="Conte a história por trás do design, inspiração e detalhes da confecção..."
                disabled={isSubmitting}
                {...register("story")}
              />
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

            {/* Available Sizes (ProductVariants) */}
            <Field>
              <FieldLabel>Tamanhos Disponíveis (Variantes)</FieldLabel>
              <div className="flex flex-wrap gap-2 pt-1">
                {ALL_SIZES.map((sz) => {
                  const isSelected = selectedSizes.includes(sz);
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => toggleSize(sz)}
                      disabled={isSubmitting}
                      className={`h-9 min-w-12 rounded-md border text-xs font-bold uppercase transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
              <FieldDescription>
                Selecione os tamanhos que serão criados como variantes para este produto.
              </FieldDescription>
            </Field>

            {/* Ficha Técnica (Specs) */}
            <Field className="space-y-3">
              <div className="flex items-center justify-between">
                <FieldLabel>Ficha Técnica (Especificações)</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => appendSpec({ label: "", value: "" })}
                  disabled={isSubmitting}
                  className="gap-1 text-xs"
                >
                  <PlusIcon className="size-3.5" />
                  <span>Adicionar Especificação</span>
                </Button>
              </div>

              <div className="space-y-2">
                {specFields.map((field, idx) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <Input
                      placeholder="Propriedade (ex: Tecido)"
                      disabled={isSubmitting}
                      {...register(`specs.${idx}.label`)}
                      className="w-1/3 text-xs"
                    />
                    <Input
                      placeholder="Valor (ex: 100% Algodão 240g)"
                      disabled={isSubmitting}
                      {...register(`specs.${idx}.value`)}
                      className="flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSpec(idx)}
                      disabled={isSubmitting}
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Field>

            {/* Destaques (Highlights) */}
            <Field className="space-y-3">
              <div className="flex items-center justify-between">
                <FieldLabel>Destaques do Produto</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={addHighlight}
                  disabled={isSubmitting}
                  className="gap-1 text-xs"
                >
                  <PlusIcon className="size-3.5" />
                  <span>Adicionar Destaque</span>
                </Button>
              </div>

              <div className="space-y-2">
                {highlights.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="ex: Brasão em bordado alta definição"
                      value={item}
                      onChange={(e) => updateHighlight(idx, e.target.value)}
                      disabled={isSubmitting}
                      className="flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeHighlight(idx)}
                      disabled={isSubmitting}
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Field>

            {/* Cuidados (Care) */}
            <Field className="space-y-3">
              <div className="flex items-center justify-between">
                <FieldLabel>Instruções de Cuidados</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={addCare}
                  disabled={isSubmitting}
                  className="gap-1 text-xs"
                >
                  <PlusIcon className="size-3.5" />
                  <span>Adicionar Instrução</span>
                </Button>
              </div>

              <div className="space-y-2">
                {care.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="ex: Lavar do avesso até 30 °C"
                      value={item}
                      onChange={(e) => updateCare(idx, e.target.value)}
                      disabled={isSubmitting}
                      className="flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCare(idx)}
                      disabled={isSubmitting}
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
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



