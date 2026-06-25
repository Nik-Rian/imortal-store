"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createProduct(formData: FormData) {
  // Extract data from the native FormData object
  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const description = formData.get("description") as string;

  // Prices are stored in cents, so we parse the input as an integer
  const price = parseInt(formData.get("price") as string, 10); 

  // Basic validation
  if (!name || !slug || !price) {
    throw new Error("Missing required fields");
  }

  // Mutate the database
  await prisma.product.create({
    data: {
      name,
      slug,
      description,
      price,
      images: [], // Defaulting to an empty array for now
    },
  });

  // Invalidate caches so the new product shows up immediately
  revalidatePath("/admin/produtos");
  revalidatePath("/"); // Also invalidate the public storefront if needed

  // Redirect the user back to the product list
  redirect("/admin/produtos");
}

export async function updateProduct(id: string, formData: FormData) {
  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const description = formData.get("description") as string;
  const price = parseInt(formData.get("price") as string, 10);

  if (!name || !slug || !price) {
    throw new Error("Missing required fields");
  }

  await prisma.product.update({
    where: { id },
    data: { name, slug, description, price },
  });

  revalidatePath("/admin/produtos");
  revalidatePath(`/produto/${slug}`);
  redirect("/admin/produtos");
}

export async function deleteProduct(id: string) {
  await prisma.product.delete({
    where: { id },
  });

  revalidatePath("/admin/produtos");
}