export const PLACEHOLDER_IMAGE = "/placeholder.svg";

/** First product image, or the placeholder when the product has none. */
export function getProductImage(
  images: readonly string[] | null | undefined,
): string {
  return images?.[0] || PLACEHOLDER_IMAGE;
}

/**
 * Images for a bundle's detail carousel (BND-003): the components' images in
 * component order, without duplicate URLs. When no component has an image,
 * the bundle's own images are used so the carousel is never emptier than today.
 */
export function getBundleGalleryImages(
  bundleImages: readonly string[] | null | undefined,
  components: readonly { componentProduct: { images: readonly string[] } }[],
): string[] {
  const gallery = Array.from(
    new Set(
      components.flatMap((c) => c.componentProduct.images).filter(Boolean),
    ),
  );
  if (gallery.length > 0) return gallery;
  return (bundleImages ?? []).filter(Boolean);
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Allowed upload types and the extension used for the stored file. */
export const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

/** Leading bytes needed by detectImageType to recognise every allowed format. */
export const IMAGE_SIGNATURE_BYTES = 12;

export const IMAGE_TYPE_ERROR =
  "Formato inválido. Envie uma imagem JPEG, PNG ou WebP.";
export const IMAGE_SIZE_ERROR = "A imagem excede o limite de 5 MB.";

export function isAllowedImageType(type: string): type is AllowedImageType {
  return Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_TYPES, type);
}

/**
 * Identifies an allowed image by its magic bytes. File.type is client-supplied
 * and cannot be trusted, so the server relies on this instead.
 */
export function detectImageType(bytes: Uint8Array): AllowedImageType | null {
  const matches = (signature: number[], offset = 0) =>
    signature.every((byte, i) => bytes[offset + i] === byte);

  if (matches([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  // WebP: "RIFF" + 4-byte size + "WEBP"
  if (
    matches([0x52, 0x49, 0x46, 0x46]) &&
    matches([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}
