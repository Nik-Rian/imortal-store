"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validations/product.schema";
import { deleteBlobImages } from "@/actions/blob.actions";
import { requireSession } from "@/lib/auth-guard";

export async function createProduct(formData: FormData) {
 await requireSession();

 const rawPrice = (formData.get("priceCents") ??
   formData.get("price")) as string;

 const rawSizes = formData.get("sizes") as string;
 let sizesInput: unknown = [];
 try {
   if (rawSizes) sizesInput = JSON.parse(rawSizes);
 } catch {}

 const rawVariants = formData.get("variants") as string;
 let variantsInput: unknown = [];
 try {
   if (rawVariants) variantsInput = JSON.parse(rawVariants);
 } catch {}

 const rawIsAvailable = formData.get("isAvailable");
 const isAvailable =
   rawIsAvailable === "true" ||
   rawIsAvailable === "on" ||
   rawIsAvailable === null;

 const controlStock =
   formData.get("controlStock") === "true" ||
   formData.get("controlStock") === "on";
 const hasSizes =
   formData.get("hasSizes") === "true" || formData.get("hasSizes") === "on";
 const hasVariants =
   formData.get("hasVariants") === "true" ||
   formData.get("hasVariants") === "on";
 const showVariantsInStore =
   formData.get("showVariantsInStore") === "true" ||
   formData.get("showVariantsInStore") === "on" ||
   formData.get("showVariantsInStore") === null;

 const validationResult = productSchema.safeParse({
   name: formData.get("name"),
   slug: formData.get("slug"),
   description: formData.get("description"),
   dropId: formData.get("dropId"),
   priceCents: rawPrice ? parseInt(rawPrice, 10) : NaN,
   isAvailable,
   controlStock,
   hasSizes,
   hasVariants,
   showVariantsInStore,
   sizes: sizesInput,
   variants: variantsInput,
 });

  if (!validationResult.success) {
    const firstErrorMessage =
      validationResult.error.issues[0]?.message ??
      "Dados do produto inválidos.";
    throw new Error(firstErrorMessage);
  }

  const { name, slug, description, dropId, priceCents, sizes, variants } =
    validationResult.data;

  const images = formData.getAll("images") as string[];

  try {
    await prisma.product.create({
      data: {
        name,
        slug,
        description,
        priceCents,
        dropId,
        images,
        isAvailable: validationResult.data.isAvailable,
        controlStock: validationResult.data.controlStock,
        hasSizes: validationResult.data.hasSizes,
        hasVariants: validationResult.data.hasVariants,
        showVariantsInStore: validationResult.data.showVariantsInStore,
        sizes: {
          create: sizes.map((s) => ({
            size: s.size,
            isAvailable: s.isAvailable,
            sortOrder: s.sortOrder,
          })),
        },
        variants: {
          create: variants.map((v) => ({
            name: v.name,
            image: v.image,
            isAvailable: v.isAvailable,
            sortOrder: v.sortOrder,
          })),
        },
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Erro ao criar produto: ${error.message}`);
    }
    throw new Error("Erro desconhecido ao criar produto.");
  }

  revalidatePath("/");
  revalidatePath("/admin/produtos");
  redirect("/admin/produtos");
}

export async function updateProduct(id: string, formData: FormData) {
  await requireSession();

  const rawPrice = (formData.get("priceCents") ??
    formData.get("price")) as string;

  const rawSizes = formData.get("sizes") as string;
  let sizesInput: unknown = [];
  if (rawSizes) {
    try {
      sizesInput = JSON.parse(rawSizes);
    } catch {
      sizesInput = [];
    }
  }

  const rawVariants = formData.get("variants") as string;
  let variantsInput: unknown = [];
  if (rawVariants) {
    try {
      variantsInput = JSON.parse(rawVariants);
    } catch {
      variantsInput = [];
    }
  }

  const rawIsAvailable = formData.get("isAvailable");
  const isAvailable = rawIsAvailable === "true" || rawIsAvailable === "on";

  const controlStock =
    formData.get("controlStock") === "true" ||
    formData.get("controlStock") === "on";
  const hasSizes =
    formData.get("hasSizes") === "true" || formData.get("hasSizes") === "on";
  const hasVariants =
    formData.get("hasVariants") === "true" ||
    formData.get("hasVariants") === "on";
  const showVariantsInStore =
    formData.get("showVariantsInStore") === "true" ||
    formData.get("showVariantsInStore") === "on" ||
    formData.get("showVariantsInStore") === null;

  const validationResult = productSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    dropId: formData.get("dropId"),
    priceCents: rawPrice ? parseInt(rawPrice, 10) : NaN,
    isAvailable,
    controlStock,
    hasSizes,
    hasVariants,
    showVariantsInStore,
    sizes: sizesInput,
    variants: variantsInput,
  });

  if (!validationResult.success) {
    const firstErrorMessage =
      validationResult.error.issues[0]?.message ??
      "Dados do produto inválidos.";
    throw new Error(firstErrorMessage);
  }

  const { name, slug, description, dropId, priceCents, sizes, variants } =
    validationResult.data;
  const newImages = formData.getAll("images") as string[];

  const currentProduct = await prisma.product.findUnique({
    where: { id },
    include: { variants: true, sizes: true },
  });

  if (!currentProduct) {
    throw new Error("Produto não encontrado.");
  }

  // URLs that must survive this save (product photos + variant images).
  const keptImageUrls = new Set<string>([
    ...newImages,
    ...variants.flatMap((v) => (v.image ? [v.image] : [])),
  ]);

  // Candidates for deletion: product photos plus the images of variants that
  // were deleted, cleared or replaced. `incoming.image === undefined` means the
  // field wasn't sent, which Prisma treats as "leave unchanged".
  const staleImageUrls = [
    ...currentProduct.images,
    ...currentProduct.variants.flatMap((current) => {
      if (!current.image) return [];
      const incoming = variants.find((v) => v.id === current.id);
      if (incoming && incoming.image === undefined) return [];
      return [current.image];
    }),
  ];

  const removedImages = Array.from(new Set(staleImageUrls)).filter(
    (url) => !keptImageUrls.has(url),
  );

  const sizesToCreate = sizes.filter((s) => !s.id);
  const sizesToUpdate = sizes.filter((s) => !!s.id);
  const incomingSizeIds = sizesToUpdate.map((s) => s.id!);
  const sizesToDelete = currentProduct.sizes.filter(
    (s) => !incomingSizeIds.includes(s.id),
  );

  const variantsToCreate = variants.filter((v) => !v.id);
  const variantsToUpdate = variants.filter((v) => !!v.id);
  const incomingVariantIds = variantsToUpdate.map((v) => v.id!);
  const variantsToDelete = currentProduct.variants.filter(
    (v) => !incomingVariantIds.includes(v.id),
  );

  try {
    await prisma.$transaction([
      ...(sizesToDelete.length > 0
        ? [
            prisma.productSize.deleteMany({
              where: { id: { in: sizesToDelete.map((s) => s.id) } },
            }),
          ]
        : []),
      ...sizesToUpdate.map((s) =>
        prisma.productSize.update({
          where: { id: s.id! },
          data: {
            size: s.size,
            isAvailable: s.isAvailable,
            sortOrder: s.sortOrder,
          },
        }),
      ),
      ...(sizesToCreate.length > 0
        ? [
            prisma.productSize.createMany({
              data: sizesToCreate.map((s) => ({
                productId: id,
                size: s.size,
                isAvailable: s.isAvailable,
                sortOrder: s.sortOrder,
              })),
            }),
          ]
        : []),
      ...(variantsToDelete.length > 0
        ? [
            prisma.productVariant.deleteMany({
              where: { id: { in: variantsToDelete.map((v) => v.id) } },
            }),
          ]
        : []),
      ...variantsToUpdate.map((v) =>
        prisma.productVariant.update({
          where: { id: v.id! },
          data: {
            name: v.name,
            image: v.image,
            isAvailable: v.isAvailable,
            sortOrder: v.sortOrder,
          },
        }),
      ),
      ...(variantsToCreate.length > 0
        ? [
            prisma.productVariant.createMany({
              data: variantsToCreate.map((v) => ({
                productId: id,
                name: v.name,
                image: v.image,
                isAvailable: v.isAvailable,
                sortOrder: v.sortOrder,
              })),
            }),
          ]
        : []),
      prisma.product.update({
        where: { id },
        data: {
          name,
          slug,
          description,
          priceCents,
          dropId,
          isAvailable: validationResult.data.isAvailable,
          controlStock: validationResult.data.controlStock,
          hasSizes: validationResult.data.hasSizes,
          hasVariants: validationResult.data.hasVariants,
          showVariantsInStore: validationResult.data.showVariantsInStore,
          images: newImages,
        },
      }),
    ]);

    if (removedImages.length > 0) {
      await deleteBlobImages(removedImages);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Erro ao atualizar produto: ${error.message}`);
    }
    throw new Error("Erro desconhecido ao atualizar produto.");
  }

  revalidatePath("/");
  revalidatePath("/admin/produtos");
  revalidatePath(`/admin/produtos/${id}/editar`);
  redirect("/admin/produtos");
}

export async function deleteProduct(id: string) {
  await requireSession();
  const currentProduct = await prisma.product.findUnique({
    where: { id },
    select: { images: true, variants: { select: { image: true } } },
  });
  if (!currentProduct) {
    throw new Error("Produto não encontrado.");
  }
  const imageUrls = [
    ...currentProduct.images,
    ...currentProduct.variants.flatMap((v) => (v.image ? [v.image] : [])),
  ];
  try {
    await prisma.product.delete({
      where: { id },
    });
    if (imageUrls.length > 0) {
      await deleteBlobImages(imageUrls);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Erro ao deletar produto: ${error.message}`);
    }
    throw new Error("Erro desconhecido ao deletar produto.");
  }
  revalidatePath("/admin/produtos");
  revalidatePath("/");
}
