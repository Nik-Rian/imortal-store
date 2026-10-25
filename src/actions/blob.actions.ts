"use server";

import { put, del } from "@vercel/blob";
import { requireSession } from "@/lib/auth-guard";

const allowedBlobHosts = new Set(
  (process.env.VERCEL_BLOB_HOSTNAMES ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

function isAllowedBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === "" &&
      allowedBlobHosts.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/**
 * Uploads a single image file to Vercel Blob and returns its public URL.
 */
export async function uploadProductImage(formData: FormData): Promise<string> {
  await requireSession();

  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    throw new Error("Nenhum arquivo enviado.");
  }

  // Generate a clean filename under a `products/` path prefix
  const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const blob = await put(`products/${Date.now()}-${cleanFilename}`, file, {
    access: "public",
  });

  return blob.url;
}

/**
 * Deletes one or more images from Vercel Blob storage.
 * Ignores external URLs (e.g., Unsplash placeholder images).
 */
export async function deleteBlobImages(urls: string[]): Promise<void> {
  await requireSession();

  if (!urls || urls.length === 0) return;

  if (allowedBlobHosts.size === 0) {
    throw new Error("VERCEL_BLOB_HOSTNAMES is not configured.");
  }

  const validBlobUrls = urls.filter(isAllowedBlobUrl);

  if (validBlobUrls.length > 0) {
    await del(validBlobUrls);
  }
}
