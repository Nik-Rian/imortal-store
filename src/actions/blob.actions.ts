"use server";

import { put, del } from "@vercel/blob";
import { requireSession } from "@/lib/auth-guard";
import { randomUUID } from "node:crypto";
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_SIGNATURE_BYTES,
  IMAGE_SIZE_ERROR,
  IMAGE_TYPE_ERROR,
  MAX_IMAGE_BYTES,
  detectImageType,
} from "@/lib/media";

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
 * Uploads a single image to Vercel Blob and returns its public URL.
 * Admin-only. Size and real file type are validated before anything is stored.
 */
export async function uploadProductImage(
  formData: FormData,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  await requireSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Nenhum arquivo enviado." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { success: false, error: IMAGE_SIZE_ERROR };
  }

  const header = new Uint8Array(
    await file.slice(0, IMAGE_SIGNATURE_BYTES).arrayBuffer(),
  );
  const contentType = detectImageType(header);
  if (!contentType) {
    return { success: false, error: IMAGE_TYPE_ERROR };
  }

  // Keep the `products/` prefix: next.config.ts allows images only under it.
  const blob = await put(
    `products/${randomUUID()}.${ALLOWED_IMAGE_TYPES[contentType]}`,
    file,
    { access: "public", contentType },
  );
  return { success: true, url: blob.url };
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
