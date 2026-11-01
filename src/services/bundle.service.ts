import { prisma } from "@/lib/prisma";

export interface BundleComponentInput {
  componentProductId: string;
  quantity: number;
}

/**
 * Server-side bundle integrity (BND-001). Throws a readable Error on the
 * first violated rule.
 *
 * - `productId` is undefined on create.
 * - Run it BEFORE writing. It reads current DB state.
 */
export async function assertBundleIntegrity(input: {
  productId?: string;
  dropId: string;
  isBundle: boolean;
  components: BundleComponentInput[];
}): Promise<void> {
  const { productId, dropId, isBundle, components } = input;

  // Rules about this product already being a component of other bundles.
  if (productId) {
    const memberships = await prisma.bundleComponent.findMany({
      where: { componentProductId: productId },
      select: { bundle: { select: { name: true, dropId: true } } },
    });
    if (memberships.length > 0) {
      if (isBundle) {
        throw new Error(
          "Este produto já faz parte de um kit e não pode se tornar um kit.",
        );
      }
      if (memberships.some((m) => m.bundle.dropId !== dropId)) {
        throw new Error(
          "Este produto faz parte de kits e não pode ser movido para outro drop.",
        );
      }
    }
  }

  if (!isBundle) return;

  if (productId && components.some((c) => c.componentProductId === productId)) {
    throw new Error("Um kit não pode conter a si mesmo.");
  }

  const ids = Array.from(new Set(components.map((c) => c.componentProductId)));
  const found = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, isBundle: true, dropId: true },
  });

  if (found.length !== ids.length) {
    throw new Error("Um dos produtos do kit não existe.");
  }
  if (found.some((p) => p.isBundle)) {
    throw new Error("Um kit não pode conter outro kit.");
  }
  if (found.some((p) => p.dropId !== dropId)) {
    throw new Error("Os produtos do kit devem pertencer ao mesmo drop do kit.");
  }
}
