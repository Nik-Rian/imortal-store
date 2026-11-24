import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildStockKey } from "../src/lib/stock-key";

// Product images hosted on Unsplash.
// All images use the existing allowed image host.
const IMAGES = {
  // T-shirts
  teeFront:
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1000&auto=format&fit=crop&q=85",
  teeBack:
    "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=1000&auto=format&fit=crop&q=85",
  teeFolded:
    "https://images.unsplash.com/photo-1693443687750-611ad77f3aba?w=1000&auto=format&fit=crop&q=85",

  // Hoodies
  hoodieFront:
    "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=1000&auto=format&fit=crop&q=85",
  hoodieBack:
    "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=1000&auto=format&fit=crop&q=85",
  hoodieDetail:
    "https://images.unsplash.com/photo-1499972777470-6a932ea55420?w=1000&auto=format&fit=crop&q=85",

  // Wallets
  walletFront:
    "https://images.unsplash.com/photo-1627123424574-724758594e93?w=1000&auto=format&fit=crop&q=85",
  walletBack:
    "https://images.unsplash.com/photo-1639789972237-7ee9434066ed?w=1000&auto=format&fit=crop&q=85",
  walletLifestyle:
    "https://images.unsplash.com/photo-1697551894947-25fba13585e6?w=1000&auto=format&fit=crop&q=85",

  // Caps
  capBlack:
    "https://images.unsplash.com/photo-1557225451-b03ada84e645?w=1000&auto=format&fit=crop&q=85",
  capPair:
    "https://images.unsplash.com/photo-1606483956061-46a898dce538?w=1000&auto=format&fit=crop&q=85",

  // Thermal bottles
  bottleSteel:
    "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=1000&auto=format&fit=crop&q=85",

  // Stickers
  stickerSheet:
    "https://images.unsplash.com/photo-1669720974831-47816c252ff1?w=1000&auto=format&fit=crop&q=85",
} as const;

const DEFAULT_STOCK = 20;

interface SeedSize {
  size: string;
  isAvailable?: boolean;
}

interface SeedVariant {
  name: string;
  image?: string;
  isAvailable?: boolean;
}

interface SeedProduct {
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  images?: string[];
  isAvailable?: boolean;
  sortOrder: number;
  controlStock?: boolean;
  showVariantsInStore?: boolean;
  sizes?: SeedSize[];
  variants?: SeedVariant[];
  /** Units on hand per size/variant combination; defaults to DEFAULT_STOCK. */
  stockOnHand?: (selection: { variant?: string; size?: string }) => number;
}

interface SeedBundle {
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  images?: string[];
  isAvailable?: boolean;
  sortOrder: number;
  componentSlugs: string[];
}

// Products of the previous (concluded) drop.
// They must never reach the storefront while another drop is active.
const concludedDropProducts: SeedProduct[] = [
  {
    name: "Camiseta Drop Anterior",
    slug: "camiseta-drop-anterior",
    description:
      "Peça do drop encerrado. Serve para confirmar que produtos de drops concluídos não aparecem na loja.",
    priceCents: 3900,
    images: [IMAGES.teeBack, IMAGES.teeFront],
    sortOrder: 0,
  },
];

// Products of the active drop.
const activeDropProducts: SeedProduct[] = [
  {
    name: "Camiseta Imortal Clássica",
    slug: "camiseta-imortal-classica",
    description:
      "Algodão orgânico pesado com estampa minimalista no peito. Feita para durar o semestre inteiro e os seguintes.",
    priceCents: 4500,
    images: [IMAGES.teeFront, IMAGES.teeBack, IMAGES.teeFolded],
    sortOrder: 1,
    controlStock: true,
    sizes: [{ size: "P" }, { size: "M" }, { size: "G" }, { size: "GG" }],
    variants: [
      { name: "Preta", image: IMAGES.teeFront },
      { name: "Off-white", image: IMAGES.teeBack },
      { name: "Vermelha", isAvailable: false },
    ],
    stockOnHand: ({ variant, size }) =>
      variant === "Off-white" && size === "GG" ? 0 : DEFAULT_STOCK,
  },
  {
    name: "Moletom Tech Cyberpunk",
    slug: "moletom-tech-cyberpunk",
    description:
      "Tecido técnico resistente à água com visual urbano. Bolsos modulares, capuz oversized ajustável e identidade geométrica discreta.",
    priceCents: 11000,
    images: [IMAGES.hoodieFront, IMAGES.hoodieBack, IMAGES.hoodieDetail],
    sortOrder: 2,
    controlStock: true,
    showVariantsInStore: false,
    sizes: [{ size: "M" }, { size: "G" }, { size: "GG", isAvailable: false }],
    variants: [
      { name: "Cinza", image: IMAGES.hoodieFront },
      { name: "Preto", image: IMAGES.hoodieBack },
    ],
  },
  {
    name: "Carteira de Couro Minimalista",
    slug: "carteira-de-couro-minimalista",
    description:
      "Couro vegetal de grão integral que ganha pátina com o tempo. Comporta até 8 cartões e notas dobradas sem volume.",
    priceCents: 6500,
    images: [IMAGES.walletFront, IMAGES.walletBack, IMAGES.walletLifestyle],
    sortOrder: 3,
  },
  {
    name: "Boné Imortal",
    slug: "bone-imortal",
    description:
      "Boné de aba curva com bordado frontal. Fecho ajustável, tamanho único.",
    priceCents: 5000,
    images: [IMAGES.capBlack, IMAGES.capPair],
    sortOrder: 4,
    variants: [
      { name: "Preto", image: IMAGES.capBlack },
      { name: "Azul-marinho", image: IMAGES.capPair },
    ],
  },
  {
    name: "Garrafa Térmica Imortal",
    slug: "garrafa-termica-imortal",
    description:
      "Garrafa térmica em aço inox, 500 ml. Mantém a bebida gelada por 12 horas.",
    priceCents: 8900,
    images: [IMAGES.bottleSteel],
    isAvailable: false,
    sortOrder: 5,
  },
  {
    name: "Kit de Adesivos Imortal",
    slug: "kit-de-adesivos-imortal",
    description: "Cartela com 6 adesivos resistentes à água.",
    priceCents: 1500,
    images: [IMAGES.stickerSheet],
    sortOrder: 6,
  },
];

// Bundles use a high sortOrder on purpose:
// the storefront must still list them before regular products.
const activeDropBundles: SeedBundle[] = [
  {
    name: "Kit Calouro",
    slug: "kit-calouro",
    description:
      "Carteira de couro minimalista e kit de adesivos em um único pedido, com preço especial.",
    priceCents: 7000,
    images: [IMAGES.walletFront, IMAGES.walletLifestyle, IMAGES.stickerSheet],
    sortOrder: 100,
    componentSlugs: [
      "carteira-de-couro-minimalista",
      "kit-de-adesivos-imortal",
    ],
  },
];

async function createProduct(
  prisma: PrismaClient,
  dropId: string,
  seed: SeedProduct,
): Promise<string> {
  const sizes = seed.sizes ?? [];
  const variants = seed.variants ?? [];

  const product = await prisma.product.create({
    data: {
      name: seed.name,
      slug: seed.slug,
      description: seed.description,
      priceCents: seed.priceCents,
      images: seed.images ?? [],
      isAvailable: seed.isAvailable ?? true,
      sortOrder: seed.sortOrder,
      controlStock: seed.controlStock ?? false,
      hasSizes: sizes.length > 0,
      hasVariants: variants.length > 0,
      showVariantsInStore: seed.showVariantsInStore ?? true,
      isBundle: false,
      dropId,
      sizes: {
        create: sizes.map((size, index) => ({
          size: size.size,
          isAvailable: size.isAvailable ?? true,
          sortOrder: index,
        })),
      },
      variants: {
        create: variants.map((variant, index) => ({
          name: variant.name,
          image: variant.image ?? null,
          isAvailable: variant.isAvailable ?? true,
          sortOrder: index,
        })),
      },
    },
    include: {
      sizes: {
        orderBy: { sortOrder: "asc" },
      },
      variants: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (seed.controlStock) {
    // One stock row per size/variant combination.
    // A product without options has a single row keyed by the product alone.
    const variantOptions =
      product.variants.length > 0 ? product.variants : [null];

    const sizeOptions = product.sizes.length > 0 ? product.sizes : [null];

    const onHand = seed.stockOnHand ?? (() => DEFAULT_STOCK);

    await prisma.stockItem.createMany({
      data: variantOptions.flatMap((variant) =>
        sizeOptions.map((size) => ({
          productId: product.id,
          variantId: variant?.id ?? null,
          sizeId: size?.id ?? null,
          stockKey: buildStockKey(product.id, variant?.id, size?.id),
          onHand: onHand({
            variant: variant?.name,
            size: size?.size,
          }),
          reserved: 0,
          isAvailable: true,
        })),
      ),
    });
  }

  return product.id;
}

async function createBundle(
  prisma: PrismaClient,
  dropId: string,
  seed: SeedBundle,
  productIdsBySlug: ReadonlyMap<string, string>,
): Promise<void> {
  const components = seed.componentSlugs.map((slug) => {
    const componentProductId = productIdsBySlug.get(slug);

    if (!componentProductId) {
      throw new Error(
        `Bundle "${seed.slug}" references unknown product "${slug}".`,
      );
    }

    return {
      componentProductId,
      quantity: 1,
    };
  });

  await prisma.product.create({
    data: {
      name: seed.name,
      slug: seed.slug,
      description: seed.description,
      priceCents: seed.priceCents,
      images: seed.images ?? [],
      isAvailable: seed.isAvailable ?? true,
      sortOrder: seed.sortOrder,
      isBundle: true,
      dropId,
      components: {
        create: components,
      },
    },
  });
}

async function clearDatabase(prisma: PrismaClient): Promise<void> {
  // Dependent tables first to satisfy the foreign keys.
  // Authentication tables (users, sessions, accounts) are intentionally
  // left untouched.
  await prisma.stockReservation.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.bundleComponent.deleteMany();
  await prisma.stockItem.deleteMany();
  await prisma.productSize.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.drop.deleteMany();
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed: this script wipes catalogue and order data.",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  console.log("Initializing pooled database adapter...");

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    console.log("Cleaning up database...");
    await clearDatabase(prisma);

    console.log("Creating drops...");

    // The concluded drop is created first so the active one is the newest.
    const concludedDrop = await prisma.drop.create({
      data: {
        name: "Drop 2026.1",
        slug: "drop-2026-1",
        status: "CONCLUDED",
        concludedAt: new Date("2026-06-30T23:59:59.000Z"),
      },
    });

    const activeDrop = await prisma.drop.create({
      data: {
        name: "Drop 2026.2",
        slug: "drop-2026-2",
        status: "ACTIVE",
      },
    });

    console.log("Seeding products of the concluded drop...");

    for (const product of concludedDropProducts) {
      await createProduct(prisma, concludedDrop.id, product);
    }

    console.log("Seeding products of the active drop...");

    const productIdsBySlug = new Map<string, string>();

    for (const product of activeDropProducts) {
      productIdsBySlug.set(
        product.slug,
        await createProduct(prisma, activeDrop.id, product),
      );
    }

    console.log("Seeding bundles of the active drop...");

    for (const bundle of activeDropBundles) {
      await createBundle(prisma, activeDrop.id, bundle, productIdsBySlug);
    }

    const [productCount, variantCount, stockCount] = await Promise.all([
      prisma.product.count(),
      prisma.productVariant.count(),
      prisma.stockItem.count(),
    ]);

    console.log(
      `Seeding completed: 2 drops, ${productCount} products, ${variantCount} variants, ${stockCount} stock rows.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
