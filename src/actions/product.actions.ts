"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { productSchema } from "@/lib/validations/product.schema";

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

  const validationResult = productSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    dropId: formData.get("dropId"),
    priceCents: rawPrice ? parseInt(rawPrice, 10) : NaN,
  });

  if (!validationResult.success) {
    const firstErrorMessage =
      validationResult.error.issues[0]?.message ?? "Dados do produto inválidos.";
    throw new Error(firstErrorMessage);
  }

  const {
    name,
    slug,
    description,
    dropId,
    priceCents,
  } = validationResult.data;

  const existingProduct = await prisma.product.findUnique({
    where: { slug },
  });

  if (existingProduct) {
    throw new Error(
      `Não foi possível cadastrar o produto. O link permanente (slug) "${slug}" já está em uso pelo produto "${existingProduct.name}". Por favor, escolha outro nome.`,
    );
  }

  try {
    await prisma.product.create({
      data: {
        name,
        slug,
        description,
        priceCents,
        dropId,
        images: [],
      },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new Error(
          `Erro de duplicidade: O link permanente (slug) "${slug}" já está em uso por outro produto.`,
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

  const validationResult = productSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    dropId: formData.get("dropId"),
    priceCents: rawPrice ? parseInt(rawPrice, 10) : NaN,
  });

  if (!validationResult.success) {
    const firstErrorMessage =
      validationResult.error.issues[0]?.message ?? "Dados do produto inválidos.";
    throw new Error(firstErrorMessage);
  }

  const { name, slug, description, dropId, priceCents } = validationResult.data;

  await prisma.product.update({
    where: { id },
    data: {
      name,
      slug,
      description,
      priceCents,
      dropId,
    },
  });

  const existingProduct = await prisma.product.findUnique({
    where: { slug },
  });

  if (existingProduct && existingProduct.id !== id) {
    throw new Error(
      `Não foi possível salvar as alterações. O link permanente (slug) "${slug}" já está sendo usado pelo produto "${existingProduct.name}".`,
    );
  }

  try {
    await prisma.product.update({
      where: { id },
      data: {
        name,
        slug,
        description,
        priceCents,
        dropId,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new Error(
          `Erro de duplicidade: O link permanente (slug) "${slug}" já está em uso por outro produto.`,
        );
      }
    }

    throw error;
  }

  revalidatePath("/admin/produtos");
  revalidatePath(`/produto/${slug}`);
  redirect("/admin/produtos");
}

export async function deleteProduct(id: string) {
  await requireSession();

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

  revalidatePath("/admin/produtos");
}
