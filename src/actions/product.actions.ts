"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validations/product.schema";
import { deleteBlobImages } from "@/actions/blob.actions";

export async function createProduct(formData: FormData) {
  const rawPrice = (formData.get("priceCents") ??
    formData.get("price")) as string;

  const rawVariants = formData.get("variants") as string;
  let variantsInput: unknown = [];
  if (rawVariants) {
    try {
      variantsInput = JSON.parse(rawVariants);
    } catch {
      variantsInput = [];
    }
  }

  const validationResult = productSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    dropId: formData.get("dropId"),
    priceCents: rawPrice ? parseInt(rawPrice, 10) : NaN,
    variants: variantsInput,
  });

  if (!validationResult.success) {
    const firstErrorMessage =
      validationResult.error.issues[0]?.message ??
      "Dados do produto inválidos.";
    throw new Error(firstErrorMessage);
  }

  const { name, slug, description, dropId, priceCents, variants } =
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
        variants: {
          create: variants.map((v) => ({
            size: v.size,
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

  revalidatePath("/admin/products");
  revalidatePath("/products");
  redirect("/admin/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const rawPrice = (formData.get("priceCents") ??
    formData.get("price")) as string;

  const rawVariants = formData.get("variants") as string;
  let variantsInput: unknown = [];
  if (rawVariants) {
    try {
      variantsInput = JSON.parse(rawVariants);
    } catch {
      variantsInput = [];
    }
  }

  const validationResult = productSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    dropId: formData.get("dropId"),
    priceCents: rawPrice ? parseInt(rawPrice, 10) : NaN,
    variants: variantsInput,
  });

  if (!validationResult.success) {
    const firstErrorMessage =
      validationResult.error.issues[0]?.message ??
      "Dados do produto inválidos.";
    throw new Error(firstErrorMessage);
  }

  const { name, slug, description, dropId, priceCents, variants } =
    validationResult.data;
  const newImages = formData.getAll("images") as string[];

  // Fetch existing product with variants to compare images and diff variants
  const currentProduct = await prisma.product.findUnique({
    where: { id },
    include: { variants: true },
  });

  if (!currentProduct) {
    throw new Error("Produto não encontrado.");
  }

  // Identify removed blob images
  const removedImages = currentProduct.images.filter(
    (img) => !newImages.includes(img),
  );

  // Identify variant changes (diffing)
  const toCreate = variants.filter((v) => !v.id);
  const toUpdate = variants.filter((v) => !!v.id);
  const incomingIds = toUpdate.map((v) => v.id!);
  const toDelete = currentProduct.variants.filter(
    (v) => !incomingIds.includes(v.id),
  );

  try {
    await prisma.$transaction([
      // 1. Delete removed variants
      ...(toDelete.length > 0
        ? [
            prisma.productVariant.deleteMany({
              where: { id: { in: toDelete.map((v) => v.id) } },
            }),
          ]
        : []),
      // 2. Update modified existing variants
      ...toUpdate.map((v) =>
        prisma.productVariant.update({
          where: { id: v.id! },
          data: { size: v.size, sortOrder: v.sortOrder },
        }),
      ),
      // 3. Create new variants
      ...(toCreate.length > 0
        ? [
            prisma.productVariant.createMany({
              data: toCreate.map((v) => ({
                productId: id,
                size: v.size,
                sortOrder: v.sortOrder,
              })),
            }),
          ]
        : []),
      // 4. Update Product base attributes
      prisma.product.update({
        where: { id },
        data: {
          name,
          slug,
          description,
          priceCents,
          dropId,
          images: newImages,
        },
      }),
    ]);

    // Clean up orphaned blobs from storage
    if (removedImages.length > 0) {
      await deleteBlobImages(removedImages);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Erro ao atualizar produto: ${error.message}`);
    }
    throw new Error("Erro desconhecido ao atualizar produto.");
  }

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}`);
  revalidatePath("/products");
  redirect("/admin/products");
}

export async function deleteProduct(id: string) {
  const currentProduct = await prisma.product.findUnique({
    where: { id },
    select: { images: true },
  });

  if (!currentProduct) {
    throw new Error("Produto não encontrado.");
  }

  try {
    await prisma.product.delete({
      where: { id },
    });

    if (currentProduct.images.length > 0) {
      await deleteBlobImages(currentProduct.images);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Erro ao deletar produto: ${error.message}`);
    }
    throw new Error("Erro desconhecido ao deletar produto.");
  }

  revalidatePath("/admin/products");
  revalidatePath("/products");
}
