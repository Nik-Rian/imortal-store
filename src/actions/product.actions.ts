"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Não autenticado.");
  }
  return session;
}

export async function createProduct(formData: FormData) {
  await requireSession();

  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const description = formData.get("description") as string;
  const price = parseInt(formData.get("price") as string, 10);

  if (!name || !slug || !price) {
    throw new Error("Missing required fields");
  }

  await prisma.product.create({
    data: { name, slug, description, price, images: [] },
  });

  revalidatePath("/admin/produtos");
  revalidatePath("/");
  redirect("/admin/produtos");
}

export async function updateProduct(id: string, formData: FormData) {
  await requireSession();

  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const description = formData.get("description") as string;
  const price = parseInt(formData.get("price") as string, 10);

  if (!name || !slug || !price) {
    throw new Error("Missing required fields");
  }

  await prisma.product.update({ where: { id }, data: { name, slug, description, price } });

  revalidatePath("/admin/produtos");
  revalidatePath(`/produto/${slug}`);
  redirect("/admin/produtos");
}

export async function deleteProduct(id: string) {
  await requireSession();
  await prisma.product.delete({ where: { id } });
  revalidatePath("/admin/produtos");
}