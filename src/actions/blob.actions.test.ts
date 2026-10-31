import { beforeEach, describe, expect, it, vi } from "vitest";
import { put } from "@vercel/blob";
import { requireSession } from "@/lib/auth-guard";
import {
  IMAGE_SIZE_ERROR,
  IMAGE_TYPE_ERROR,
  MAX_IMAGE_BYTES,
} from "@/lib/media";
import { uploadProductImage } from "./blob.actions";

vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({ requireSession: vi.fn() }));

const JPEG_HEADER = [
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1,
];

function jpegOfSize(size: number): File {
  const data = new Uint8Array(size);
  data.set(JPEG_HEADER);
  return new File([data], "foto.jpg", { type: "image/jpeg" });
}

function formWith(file?: File): FormData {
  const form = new FormData();
  if (file) form.append("file", file);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(put).mockResolvedValue({
    url: "https://blob.test/products/x.jpg",
  } as never);
});

describe("uploadProductImage", () => {
  it("does not store anything when the caller is not an admin", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Não autorizado."));
    await expect(uploadProductImage(formWith(jpegOfSize(100)))).rejects.toThrow(
      "Não autorizado.",
    );
    expect(put).not.toHaveBeenCalled();
  });

  it("accepts a JPEG of exactly the maximum size", async () => {
    const result = await uploadProductImage(
      formWith(jpegOfSize(MAX_IMAGE_BYTES)),
    );
    expect(result).toEqual({
      success: true,
      url: "https://blob.test/products/x.jpg",
    });
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^products\/.+\.jpg$/),
      expect.any(Blob),
      { access: "public", contentType: "image/jpeg" },
    );
  });

  it("rejects an oversized file before storage", async () => {
    const result = await uploadProductImage(
      formWith(jpegOfSize(MAX_IMAGE_BYTES + 1)),
    );
    expect(result).toEqual({ success: false, error: IMAGE_SIZE_ERROR });
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a non-image that claims to be a JPEG", async () => {
    const fake = new File(["%PDF-1.7 not an image"], "foto.jpg", {
      type: "image/jpeg",
    });
    const result = await uploadProductImage(formWith(fake));
    expect(result).toEqual({ success: false, error: IMAGE_TYPE_ERROR });
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a missing file", async () => {
    const result = await uploadProductImage(formWith());
    expect(result).toEqual({
      success: false,
      error: "Nenhum arquivo enviado.",
    });
    expect(put).not.toHaveBeenCalled();
  });
});
