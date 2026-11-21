"use server";

import { deleteBlobImages } from "@/actions/blob.actions";
import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  applyBundleRules,
  productSchema,
} from "@/lib/validations/product.schema";
import {
  assertBundleIntegrity,
  BundleIntegrityError,
} from "@/services/bundle.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type ActionFailure = { success: false; error: string };
type ActionResult = { success: true } | ActionFailure;

type BundleIntegrityInput = Parameters<typeof assertBundleIntegrity>[0];

const SLUG_CONFLICT_ERROR =
  "Já existe um produto com este link. Altere o nome do produto.";
const DUPLICATE_ENTRY_ERROR =
  "Há um item duplicado neste produto (tamanho, variante ou produto do kit repetido). Revise os campos e tente novamente.";

/**
 * Maps a Prisma unique-constraint violation (P2002) to an admin-facing
 * message, or returns null for any other error. The shape of `meta` depends
 * on the driver adapter, but both the field list and the constraint name of
 * the slug index contain "slug", while the size, variant and bundle-component
 * indexes do not.
 */
function getUniqueConflictMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, meta } = error as { code?: unknown; meta?: unknown };
  if (code !== "P2002") return null;

  let serializedMeta = "";
  try {
    serializedMeta = JSON.stringify(meta ?? {}).toLowerCase();
  } catch {
    // Unserializable metadata falls through to the duplicate-entry message.
  }
  return serializedMeta.includes("slug")
    ? SLUG_CONFLICT_ERROR
    : DUPLICATE_ENTRY_ERROR;
}

/**
 * Runs the bundle rules and returns the violation message instead of
 * throwing, so it reaches the client intact in production builds. Only
 * BundleIntegrityError carries a displayable message; anything else is logged
 * and replaced by a generic one.
 */
async function getBundleIntegrityError(
  input: BundleIntegrityInput,
): Promise<string | null> {
  try {
    await assertBundleIntegrity(input);
    return null;
  } catch (error) {
    if (error instanceof BundleIntegrityError) return error.message;
    console.error("Erro ao validar o kit:", error);
    return "Não foi possível validar o kit. Tente novamente.";
  }
}

/**
 * Reads the availability flag posted by the admin form.
 * Returns `undefined` when the field is absent so each caller can apply its own
 * default (create: available; update: leave the stored value unchanged).
 */
function parseIsAvailable(raw: FormDataEntryValue | null): boolean | undefined {
  if (raw === "true" || raw === "on") return true;
  if (raw === "false") return false;
  return undefined;
}

export async function createProduct(
  formData: FormData,
): Promise<ActionFailure> {
  await requireSession();

  const rawPrice = formData.get("priceCents") as string | null;

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

  const isAvailable = parseIsAvailable(formData.get("isAvailable")) ?? true;

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

  const isBundle =
    formData.get("isBundle") === "true" || formData.get("isBundle") === "on";
  const rawComponents = formData.get("components") as string;
  let componentsInput: unknown = [];
  try {
    if (rawComponents) componentsInput = JSON.parse(rawComponents);
  } catch {}

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
    isBundle,
    components: componentsInput,
  });

  if (!validationResult.success) {
    return {
      success: false,
      error:
        validationResult.error.issues[0]?.message ??
        "Dados do produto inválidos.",
    };
  }

  const input = applyBundleRules(validationResult.data);

  const { name, slug, description, dropId, priceCents, sizes, variants } =
    input;

  const images = formData.getAll("images") as string[];

  const integrityError = await getBundleIntegrityError({
    dropId,
    isBundle: input.isBundle,
    components: input.components,
  });
  if (integrityError) {
    return { success: false, error: integrityError };
  }

  try {
    await prisma.product.create({
      data: {
        name,
        slug,
        description,
        priceCents,
        dropId,
        images,
        isAvailable: input.isAvailable,
        isBundle: input.isBundle,
        controlStock: input.controlStock,
        hasSizes: input.hasSizes,
        hasVariants: input.hasVariants,
        showVariantsInStore: input.showVariantsInStore,
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
        components: {
          create: input.components.map((c) => ({
            componentProductId: c.componentProductId,
            quantity: c.quantity,
          })),
        },
      },
    });
  } catch (error: unknown) {
    const conflictMessage = getUniqueConflictMessage(error);
    if (conflictMessage) {
      return { success: false, error: conflictMessage };
    }
    console.error("Erro ao criar produto:", error);
    return {
      success: false,
      error: "Não foi possível criar o produto. Tente novamente.",
    };
  }

  revalidatePath("/");
  revalidatePath("/admin/produtos");
  redirect("/admin/produtos");
}

export async function updateProduct(
  id: string,
  formData: FormData,
): Promise<ActionFailure> {
  await requireSession();

  const rawPrice = formData.get("priceCents") as string | null;

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

  const isAvailable = parseIsAvailable(formData.get("isAvailable"));

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

  const isBundle =
    formData.get("isBundle") === "true" || formData.get("isBundle") === "on";
  const rawComponents = formData.get("components") as string;
  let componentsInput: unknown = [];
  try {
    if (rawComponents) componentsInput = JSON.parse(rawComponents);
  } catch {}

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
    isBundle,
    components: componentsInput,
  });

  if (!validationResult.success) {
    return {
      success: false,
      error:
        validationResult.error.issues[0]?.message ??
        "Dados do produto inválidos.",
    };
  }

  const input = applyBundleRules(validationResult.data);
  const { name, slug, description, dropId, priceCents, sizes, variants } =
    input;
  const newImages = formData.getAll("images") as string[];

  const currentProduct = await prisma.product.findUnique({
    where: { id },
    include: { variants: true, sizes: true },
  });

  if (!currentProduct) {
    return { success: false, error: "Produto não encontrado." };
  }

  const integrityError = await getBundleIntegrityError({
    productId: id,
    dropId,
    isBundle: input.isBundle,
    components: input.components,
  });
  if (integrityError) {
    return { success: false, error: integrityError };
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
      prisma.bundleComponent.deleteMany({ where: { bundleId: id } }),
      ...(input.components.length > 0
        ? [
            prisma.bundleComponent.createMany({
              data: input.components.map((c) => ({
                bundleId: id,
                componentProductId: c.componentProductId,
                quantity: c.quantity,
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
          isAvailable,
          isBundle: input.isBundle,
          controlStock: input.controlStock,
          hasSizes: input.hasSizes,
          hasVariants: input.hasVariants,
          showVariantsInStore: input.showVariantsInStore,
          images: newImages,
        },
      }),
    ]);

    if (removedImages.length > 0) {
      await deleteBlobImages(removedImages);
    }
  } catch (error: unknown) {
    const conflictMessage = getUniqueConflictMessage(error);
    if (conflictMessage) {
      return { success: false, error: conflictMessage };
    }
    console.error("Erro ao atualizar produto:", error);
    return {
      success: false,
      error: "Não foi possível atualizar o produto. Tente novamente.",
    };
  }

  revalidatePath("/");
  revalidatePath(`/produto/${slug}`);
  if (currentProduct.slug !== slug) {
    revalidatePath(`/produto/${currentProduct.slug}`);
  }
  revalidatePath("/admin/produtos");
  revalidatePath(`/admin/produtos/${id}/editar`);
  redirect("/admin/produtos");
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  await requireSession();

  const currentProduct = await prisma.product.findUnique({
    where: { id },
    select: {
      images: true,
      variants: { select: { image: true } },
      componentOf: { select: { bundle: { select: { name: true } } } },
    },
  });

  if (!currentProduct) {
    return { success: false, error: "Produto não encontrado." };
  }

  if (currentProduct.componentOf.length > 0) {
    const bundleNames = currentProduct.componentOf
      .map((c) => c.bundle.name)
      .join(", ");
    return {
      success: false,
      error: `Este produto faz parte dos kits: ${bundleNames}. Remova-o dos kits antes de excluí-lo.`,
    };
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
    console.error("Erro ao deletar produto:", error);
    return {
      success: false,
      error: "Não foi possível excluir o produto. Tente novamente.",
    };
  }
  revalidatePath("/admin/produtos");
  revalidatePath("/");

  return { success: true };
}
