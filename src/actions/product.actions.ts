"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { productSchema } from "@/lib/validations/product.schema";
import { deleteBlobImages } from "@/actions/blob.actions";

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Não autenticado.");
  }

  return session;
}

export async function createProduct(formData: FormData) {
  await requireSession();

  const rawPrice = (formData.get("priceCents") ??
    formData.get("price")) as string;

  const rawSpecs = (formData.get("specs") as string) ?? "[]";
  const rawHighlights = (formData.get("highlights") as string) ?? "[]";
  const rawCare = (formData.get("care") as string) ?? "[]";
  const rawSizes = (formData.get("sizes") as string) ?? "[]";

  let specs = [];
  let highlights = [];
  let care = [];
  let sizes: string[] = [];

  try {
    specs = JSON.parse(rawSpecs);
    highlights = JSON.parse(rawHighlights);
    care = JSON.parse(rawCare);
    sizes = JSON.parse(rawSizes);
  } catch (e) {
    console.error("Erro ao analisar campos em JSON:", e);
  }

  const validationResult = productSchema.safeParse({
    code: formData.get("code") || null,
    name: formData.get("name"),
    slug: formData.get("slug"),
    line: formData.get("line") || null,
    tag: formData.get("tag") || null,
    description: formData.get("description"),
    story: formData.get("story") || null,
    dropId: formData.get("dropId"),
    priceCents: rawPrice ? parseInt(rawPrice, 10) : NaN,
    specs,
    highlights,
    care,
    sizes,
  });

  if (!validationResult.success) {
    const firstErrorMessage =
      validationResult.error.issues[0]?.message ??
      "Dados do produto inválidos.";
    throw new Error(firstErrorMessage);
  }

  const {
    code,
    name,
    slug,
    line,
    tag,
    description,
    story,
    dropId,
    priceCents,
  } = validationResult.data;

  const images = formData.getAll("images") as string[];

  const existingProduct = await prisma.product.findUnique({
    where: { slug },
  });

  if (existingProduct) {
    throw new Error(
      `Não foi possível cadastrar o produto. O link permanente (slug) "${slug}" já está em uso pelo produto "${existingProduct.name}". Por favor, escolha outro nome.`
    );
  }

  try {
    await prisma.product.create({
      data: {
        code,
        name,
        slug,
        line,
        tag,
        description,
        story,
        priceCents,
        dropId,
        images,
        specs,
        highlights,
        care,
        variants: {
          create: sizes.map((size, index) => ({
            size,
            sortOrder: index,
          })),
        },
      },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new Error(
          `Erro de duplicidade: O link permanente (slug) "${slug}" já está em uso por outro produto.`
        );
      }
    }

    throw error;
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/");
  redirect("/admin/produtos");
}

export async function updateProduct(id: string, formData: FormData) {
  await requireSession();

  const rawPrice = (formData.get("priceCents") ??
    formData.get("price")) as string;

  const rawSpecs = (formData.get("specs") as string) ?? "[]";
  const rawHighlights = (formData.get("highlights") as string) ?? "[]";
  const rawCare = (formData.get("care") as string) ?? "[]";
  const rawSizes = (formData.get("sizes") as string) ?? "[]";

  let specs = [];
  let highlights = [];
  let care = [];
  let sizes: string[] = [];

  try {
    specs = JSON.parse(rawSpecs);
    highlights = JSON.parse(rawHighlights);
    care = JSON.parse(rawCare);
    sizes = JSON.parse(rawSizes);
  } catch (e) {
    console.error("Erro ao analisar campos em JSON:", e);
  }

  const validationResult = productSchema.safeParse({
    code: formData.get("code") || null,
    name: formData.get("name"),
    slug: formData.get("slug"),
    line: formData.get("line") || null,
    tag: formData.get("tag") || null,
    description: formData.get("description"),
    story: formData.get("story") || null,
    dropId: formData.get("dropId"),
    priceCents: rawPrice ? parseInt(rawPrice, 10) : NaN,
    specs,
    highlights,
    care,
    sizes,
  });

  if (!validationResult.success) {
    const firstErrorMessage =
      validationResult.error.issues[0]?.message ??
      "Dados do produto inválidos.";
    throw new Error(firstErrorMessage);
  }

  const {
    code,
    name,
    slug,
    line,
    tag,
    description,
    story,
    dropId,
    priceCents,
  } = validationResult.data;
  const newImages = formData.getAll("images") as string[];

  // Fetch existing product to compare images and check slug collision
  const currentProduct = await prisma.product.findUnique({
    where: { id },
  });

  if (!currentProduct) {
    throw new Error("Produto não encontrado.");
  }

  // Check for slug conflicts with other products
  const existingProductWithSlug = await prisma.product.findUnique({
    where: { slug },
  });

  if (existingProductWithSlug && existingProductWithSlug.id !== id) {
    throw new Error(
      `Não foi possível salvar as alterações. O link permanente (slug) "${slug}" já está sendo usado pelo produto "${existingProductWithSlug.name}".`
    );
  }

  // Identify orphaned images removed by the admin
  const removedImages = currentProduct.images.filter(
    (oldUrl) => !newImages.includes(oldUrl)
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          code,
          name,
          slug,
          line,
          tag,
          description,
          story,
          priceCents,
          dropId,
          images: newImages,
          specs,
          highlights,
          care,
        },
      });

      // Remove variants that are no longer selected
      await tx.productVariant.deleteMany({
        where: {
          productId: id,
          size: { notIn: sizes },
        },
      });

      // Fetch existing sizes for this product
      const existingVariants = await tx.productVariant.findMany({
        where: { productId: id },
        select: { size: true },
      });
      const existingSizes = existingVariants.map((v) => v.size);

      // Create newly added sizes
      const sizesToCreate = sizes.filter((s) => !existingSizes.includes(s));
      if (sizesToCreate.length > 0) {
        await tx.productVariant.createMany({
          data: sizesToCreate.map((size, idx) => ({
            productId: id,
            size,
            sortOrder: existingSizes.length + idx,
          })),
        });
      }
    });

    // Clean up orphaned blobs from storage
    if (removedImages.length > 0) {
      await deleteBlobImages(removedImages);
    }
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new Error(
          `Erro de duplicidade: O link permanente (slug) "${slug}" já está em uso por outro produto.`
        );
      }
    }

    throw error;
  }

  revalidatePath("/admin/produtos");
  revalidatePath(`/produto/${slug}`);
  revalidatePath("/");
  redirect("/admin/produtos");
}

export async function deleteProduct(id: string) {
  await requireSession();

  const product = await prisma.product.findUnique({
    where: { id },
    select: { images: true },
  });

  if (!product) {
    throw new Error("Produto não encontrado.");
  }

  try {
    await prisma.product.delete({ where: { id } });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new Error("Produto não encontrado.");
    }
    throw error;
  }

  // Delete all associated images from storage
  if (product.images.length > 0) {
    await deleteBlobImages(product.images);
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/");
}
