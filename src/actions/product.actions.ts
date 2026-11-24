"use server";

import { deleteBlobImages } from "@/actions/blob.actions";
import type { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { buildStockKey } from "@/lib/stock-key";
import {
  buildSellableCombinations,
  describeCombination,
  stockRowKey,
  type StockMatrixRow,
} from "@/lib/stock-matrix";
import {
  applyBundleRules,
  BUNDLE_COMPONENT_QUANTITY,
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
const VARIANT_IN_USE_ERROR =
  "Não é possível remover variantes que já aparecem em reservas ou pedidos. Marque-as como indisponíveis.";
const SIZE_IN_USE_ERROR =
  "Não é possível remover tamanhos que já aparecem em reservas ou pedidos. Marque-os como indisponíveis.";
const PRODUCT_HAS_RESERVATIONS_ERROR =
  "Este produto já possui reservas de estoque e não pode ser excluído. Marque-o como indisponível.";

/** Rule violation whose message is safe to show to the administrator. */
class StockValidationError extends Error {}

type TransactionClient = Prisma.TransactionClient;
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

/**
 * Refuses the removal of variants or sizes that appear in stock reservations
 * or in order history. Such options must be marked unavailable instead.
 */
async function assertOptionsCanBeRemoved(
  tx: TransactionClient,
  productId: string,
  variants: { id: string; name: string }[],
  sizes: { id: string; size: string }[],
): Promise<void> {
  if (variants.length > 0) {
    const reservations = await tx.stockReservation.count({
      where: { stockItem: { variantId: { in: variants.map((v) => v.id) } } },
    });
    const orderItems = await tx.orderItem.count({
      where: { productId, variantName: { in: variants.map((v) => v.name) } },
    });
    if (reservations + orderItems > 0) {
      throw new StockValidationError(VARIANT_IN_USE_ERROR);
    }
  }

  if (sizes.length > 0) {
    const reservations = await tx.stockReservation.count({
      where: { stockItem: { sizeId: { in: sizes.map((s) => s.id) } } },
    });
    const orderItems = await tx.orderItem.count({
      where: { productId, sizeLabel: { in: sizes.map((s) => s.size) } },
    });
    if (reservations + orderItems > 0) {
      throw new StockValidationError(SIZE_IN_USE_ERROR);
    }
  }
}

/**
 * Persists the stock matrix of a tracked product. Must run inside the
 * transaction that writes the options, so new options already have ids.
 * Rows are resolved on the server from variant names and size labels, never
 * from client identifiers, and existing rows are never deleted.
 */
async function syncStockItems(
  tx: TransactionClient,
  productId: string,
  flags: { hasVariants: boolean; hasSizes: boolean },
  rows: StockMatrixRow[],
): Promise<void> {
  const variants = await tx.productVariant.findMany({
    where: { productId },
    select: { id: true, name: true },
  });
  const sizes = await tx.productSize.findMany({
    where: { productId },
    select: { id: true, size: true },
  });
  const existingItems = await tx.stockItem.findMany({ where: { productId } });

  const variantIdByName = new Map(variants.map((v) => [v.name, v.id]));
  const sizeIdByLabel = new Map(sizes.map((s) => [s.size, s.id]));
  const existingByKey = new Map(existingItems.map((i) => [i.stockKey, i]));
  const rowsByKey = new Map(rows.map((row) => [stockRowKey(row), row]));

  const combinations = buildSellableCombinations({
    hasVariants: flags.hasVariants,
    variantNames: variants.map((v) => v.name),
    hasSizes: flags.hasSizes,
    sizeLabels: sizes.map((s) => s.size),
  });

  const itemsToCreate: {
    productId: string;
    variantId: string | null;
    sizeId: string | null;
    stockKey: string;
    onHand: number;
    isAvailable: boolean;
  }[] = [];

  for (const combination of combinations) {
    const row = rowsByKey.get(stockRowKey(combination));
    if (!row) continue;

    const variantId =
      combination.variantName === null
        ? null
        : variantIdByName.get(combination.variantName)!;
    const sizeId =
      combination.sizeLabel === null
        ? null
        : sizeIdByLabel.get(combination.sizeLabel)!;
    const stockKey = buildStockKey(productId, variantId, sizeId);
    const existing = existingByKey.get(stockKey);

    if (!existing) {
      itemsToCreate.push({
        productId,
        variantId,
        sizeId,
        stockKey,
        onHand: row.onHand,
        isAvailable: row.isAvailable,
      });
      continue;
    }

    if (
      existing.onHand === row.onHand &&
      existing.isAvailable === row.isAvailable
    ) {
      continue;
    }

    // The reserved comparison lives in the WHERE clause so it is atomic with
    // the write and cannot race with concurrent reservations.
    const { count } = await tx.stockItem.updateMany({
      where: { id: existing.id, reserved: { lte: row.onHand } },
      data: { onHand: row.onHand, isAvailable: row.isAvailable },
    });
    if (count === 0) {
      throw new StockValidationError(
        `A quantidade de "${describeCombination(combination)}" não pode ser menor que a quantidade reservada (${existing.reserved}).`,
      );
    }
  }

  if (itemsToCreate.length > 0) {
    await tx.stockItem.createMany({ data: itemsToCreate });
  }
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

  const rawStock = formData.get("stock") as string;

  let stockInput: unknown = [];

  try {
    if (rawStock) stockInput = JSON.parse(rawStock);
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
    stock: stockInput,
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
    await prisma.$transaction(async (tx) => {
      const createdProduct = await tx.product.create({
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
              quantity: BUNDLE_COMPONENT_QUANTITY,
            })),
          },
        },
      });

      if (input.controlStock) {
        await syncStockItems(
          tx,
          createdProduct.id,
          { hasVariants: input.hasVariants, hasSizes: input.hasSizes },
          input.stock,
        );
      }
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
  const currentProduct = await prisma.product.findUnique({
    where: { id },
    include: { variants: true, sizes: true },
  });
  if (!currentProduct) {
    return { success: false, error: "Produto não encontrado." };
  }
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
  const rawStock = formData.get("stock") as string;
  let stockInput: unknown = [];
  try {
    if (rawStock) stockInput = JSON.parse(rawStock);
  } catch {}
  // A missing or blank slug keeps the stored one, so links that were already
  // shared keep working when a product is saved without a deliberate change.
  const postedSlug = formData.get("slug");
  const slugInput =
    typeof postedSlug === "string" && postedSlug.trim() !== ""
      ? postedSlug
      : currentProduct.slug;
  const validationResult = productSchema.safeParse({
    name: formData.get("name"),
    slug: slugInput,
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
    stock: stockInput,
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
    // Interactive transaction: the history checks and the stock write depend
    // on intermediate results. The timeout covers the sequential statements.
    await prisma.$transaction(
      async (tx) => {
        await assertOptionsCanBeRemoved(
          tx,
          id,
          variantsToDelete,
          sizesToDelete,
        );

        if (sizesToDelete.length > 0) {
          await tx.productSize.deleteMany({
            where: { id: { in: sizesToDelete.map((s) => s.id) } },
          });
        }
        for (const s of sizesToUpdate) {
          await tx.productSize.update({
            where: { id: s.id! },
            data: {
              size: s.size,
              isAvailable: s.isAvailable,
              sortOrder: s.sortOrder,
            },
          });
        }
        if (sizesToCreate.length > 0) {
          await tx.productSize.createMany({
            data: sizesToCreate.map((s) => ({
              productId: id,
              size: s.size,
              isAvailable: s.isAvailable,
              sortOrder: s.sortOrder,
            })),
          });
        }

        if (variantsToDelete.length > 0) {
          await tx.productVariant.deleteMany({
            where: { id: { in: variantsToDelete.map((v) => v.id) } },
          });
        }
        for (const v of variantsToUpdate) {
          await tx.productVariant.update({
            where: { id: v.id! },
            data: {
              name: v.name,
              image: v.image,
              isAvailable: v.isAvailable,
              sortOrder: v.sortOrder,
            },
          });
        }
        if (variantsToCreate.length > 0) {
          await tx.productVariant.createMany({
            data: variantsToCreate.map((v) => ({
              productId: id,
              name: v.name,
              image: v.image,
              isAvailable: v.isAvailable,
              sortOrder: v.sortOrder,
            })),
          });
        }

        await tx.bundleComponent.deleteMany({ where: { bundleId: id } });
        if (input.components.length > 0) {
          await tx.bundleComponent.createMany({
            data: input.components.map((c) => ({
              bundleId: id,
              componentProductId: c.componentProductId,
              quantity: BUNDLE_COMPONENT_QUANTITY,
            })),
          });
        }

        await tx.product.update({
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
        });

        // Stock rows are written only while tracking is on. Switching tracking
        // off leaves them untouched, so turning it on again restores the data.
        if (input.controlStock) {
          await syncStockItems(
            tx,
            id,
            { hasVariants: input.hasVariants, hasSizes: input.hasSizes },
            input.stock,
          );
        }
      },
      { timeout: 15_000 },
    );
    if (removedImages.length > 0) {
      await deleteBlobImages(removedImages);
    }
  } catch (error: unknown) {
    if (error instanceof StockValidationError) {
      return { success: false, error: error.message };
    }
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

  const reservationCount = await prisma.stockReservation.count({
    where: { stockItem: { productId: id } },
  });
  if (reservationCount > 0) {
    return { success: false, error: PRODUCT_HAS_RESERVATIONS_ERROR };
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
/**
 * Opens or closes sales of a single listing. Writes only `isAvailable`, so
 * the rest of the product (and any order that references it) stays untouched.
 */
export async function setProductAvailability(
  productId: string,
  isAvailable: boolean,
): Promise<ActionResult> {
  await requireSession();
  if (!productId || typeof isAvailable !== "boolean") {
    return { success: false, error: "Dados do produto inválidos." };
  }
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  if (!product) {
    return { success: false, error: "Produto não encontrado." };
  }
  try {
    await prisma.product.update({
      where: { id: productId },
      data: { isAvailable },
    });
  } catch (error: unknown) {
    console.error("Erro ao alterar a disponibilidade do produto:", error);
    return {
      success: false,
      error: "Não foi possível alterar a disponibilidade. Tente novamente.",
    };
  }
  revalidatePath("/");
  revalidatePath(`/produto/${product.slug}`);
  revalidatePath("/admin/produtos");
  return { success: true };
}
