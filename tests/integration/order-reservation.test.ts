import { randomUUID } from "node:crypto";
import { createOrder } from "@/actions/order.actions";
import { prisma as applicationPrisma } from "@/lib/prisma";
import { buildStockKey } from "@/lib/stock-key";
import { loadCheckoutCatalogue } from "@/services/checkout.service";
import { createPixOrder } from "@/services/mercadopago.service";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createDrop,
  createProduct,
  createStockItem,
  disconnectTestPrisma,
  getTestPrisma,
  truncateAllTables,
} from "./helpers/db";

// The action module builds its own Prisma client from DATABASE_URL when it is
// first imported, so the variable must point at the disposable test database
// before any import is evaluated.
vi.hoisted(() => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not defined. Point it at a disposable database whose name contains "test".',
    );
  }
  process.env.DATABASE_URL = testDatabaseUrl;
});

const integrationClient = vi.hoisted(() => ({
  counter: 0,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () =>
      new Headers({
        "x-forwarded-for": `integration-test-${++integrationClient.counter}`,
      }),
  ),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/services/mercadopago.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/mercadopago.service")>()),
  createPixOrder: vi.fn(),
  createCardOrder: vi.fn(),
}));

// The real loader is wrapped so a test can hold every caller between catalogue
// validation and reservation, or change stock in that window.
vi.mock("@/services/checkout.service", () => ({
  loadCheckoutCatalogue: vi.fn(),
}));

const { loadCheckoutCatalogue: loadActualCatalogue } = await vi.importActual<
  typeof import("@/services/checkout.service")
>("@/services/checkout.service");

const prisma = getTestPrisma();

type OrderItems = Parameters<typeof createOrder>[0]["items"];

function checkoutPayload(items: OrderItems, attemptKey: string = randomUUID()) {
  return {
    customerName: "Maria Silva",
    customerPhone: "11999999999",
    customerEmail: "maria@example.com",
    customerCpf: "52998224725",
    attemptKey,
    items,
  };
}

// Lets `parties` concurrent callers finish validating against the same unreserved
// stock before any of them starts reserving, so the reservation step itself is
// what has to resolve the race.
function holdCataloguesUntilAllLoaded(parties: number) {
  let loaded = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  vi.mocked(loadCheckoutCatalogue).mockImplementation(async (lines) => {
    const catalogue = await loadActualCatalogue(lines);
    loaded += 1;
    if (loaded === parties) release();
    await gate;
    return catalogue;
  });
}

async function seedTrackedProduct(
  dropId: string,
  name: string,
  onHand: number,
) {
  const product = await createProduct({
    dropId,
    name,
    controlStock: true,
    priceCents: 5000,
  });
  const stockItem = await createStockItem({
    productId: product.id,
    stockKey: buildStockKey(product.id),
    onHand,
  });
  return { product, stockItem };
}

async function seedBundle(dropId: string, componentProductId: string) {
  const bundle = await createProduct({
    dropId,
    name: "Kit Calouro",
    isBundle: true,
    priceCents: 12000,
  });
  await prisma.bundleComponent.create({
    data: { bundleId: bundle.id, componentProductId, quantity: 1 },
  });
  return bundle;
}

async function readStock(stockItemId: string) {
  return prisma.stockItem.findUniqueOrThrow({ where: { id: stockItemId } });
}

beforeEach(async () => {
  await truncateAllTables();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(loadCheckoutCatalogue).mockImplementation(loadActualCatalogue);
  vi.mocked(createPixOrder).mockImplementation(async ({ orderId }) => ({
    paymentId: `payment-${orderId}`,
    orderId: `provider-${orderId}`,
    qrCode: "qr",
    qrCodeBase64: "b64",
    status: "action_required",
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await applicationPrisma.$disconnect();
  await disconnectTestPrisma();
});

describe("order creation reserves stock atomically", () => {
  it("lets exactly one of two parallel orders take the last unit", async () => {
    const drop = await createDrop({ status: "ACTIVE" });
    const { product, stockItem } = await seedTrackedProduct(
      drop.id,
      "Camisa Unica",
      1,
    );
    holdCataloguesUntilAllLoaded(2);

    const results = await Promise.all([
      createOrder(checkoutPayload([{ productId: product.id, quantity: 1 }])),
      createOrder(checkoutPayload([{ productId: product.id, quantity: 1 }])),
    ]);

    const succeeded = results.filter((result) => result.success);
    const failed = results.filter((result) => !result.success);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toContain("Camisa Unica");

    expect((await readStock(stockItem.id)).reserved).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    const reservations = await prisma.stockReservation.findMany();
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      orderId: succeeded[0].orderId,
      stockItemId: stockItem.id,
      quantity: 1,
      status: "RESERVED",
    });
  });

  it("reserves the combined quantity of a bundle and its component in one cart", async () => {
    const drop = await createDrop({ status: "ACTIVE" });
    const cap = await seedTrackedProduct(drop.id, "Bone", 2);
    const bundle = await seedBundle(drop.id, cap.product.id);

    const result = await createOrder(
      checkoutPayload([
        { productId: cap.product.id, quantity: 1 },
        {
          productId: bundle.id,
          quantity: 1,
          components: [{ componentProductId: cap.product.id }],
        },
      ]),
    );

    expect(result.success).toBe(true);
    expect((await readStock(cap.stockItem.id)).reserved).toBe(2);
    const reservations = await prisma.stockReservation.findMany();
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      stockItemId: cap.stockItem.id,
      quantity: 2,
      status: "RESERVED",
    });
  });

  it("fails the whole cart when the bundle and its component do not fit together", async () => {
    const drop = await createDrop({ status: "ACTIVE" });
    const cap = await seedTrackedProduct(drop.id, "Bone", 1);
    const bundle = await seedBundle(drop.id, cap.product.id);

    const result = await createOrder(
      checkoutPayload([
        { productId: cap.product.id, quantity: 1 },
        {
          productId: bundle.id,
          quantity: 1,
          components: [{ componentProductId: cap.product.id }],
        },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Bone");
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.stockReservation.count()).toBe(0);
    expect((await readStock(cap.stockItem.id)).reserved).toBe(0);
  });

  it("leaves no order, reservation or counter change when a later line cannot be reserved", async () => {
    const drop = await createDrop({ status: "ACTIVE" });
    const first = await seedTrackedProduct(drop.id, "Camisa", 1);
    const second = await seedTrackedProduct(drop.id, "Moletom", 1);
    // Reservation runs in ascending stock item id, so the item sorted last is
    // the one that fails after the other counter was already incremented.
    const [early, late] = [first, second].sort((a, b) =>
      a.stockItem.id < b.stockItem.id ? -1 : 1,
    );

    // Another buyer takes the last unit of `late` after this cart was validated.
    vi.mocked(loadCheckoutCatalogue).mockImplementationOnce(async (lines) => {
      const catalogue = await loadActualCatalogue(lines);
      await prisma.stockItem.update({
        where: { id: late.stockItem.id },
        data: { reserved: 1 },
      });
      return catalogue;
    });

    const result = await createOrder(
      checkoutPayload([
        { productId: early.product.id, quantity: 1 },
        { productId: late.product.id, quantity: 1 },
      ]),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain(late.product.name);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
    expect(await prisma.stockReservation.count()).toBe(0);
    expect((await readStock(early.stockItem.id)).reserved).toBe(0);
    expect((await readStock(late.stockItem.id)).reserved).toBe(1);
  });

  it("creates one order and one reservation set for parallel submissions with the same attempt key", async () => {
    const drop = await createDrop({ status: "ACTIVE" });
    const { product, stockItem } = await seedTrackedProduct(
      drop.id,
      "Camisa",
      5,
    );
    const attemptKey = randomUUID();
    holdCataloguesUntilAllLoaded(2);

    const results = await Promise.all([
      createOrder(
        checkoutPayload([{ productId: product.id, quantity: 1 }], attemptKey),
      ),
      createOrder(
        checkoutPayload([{ productId: product.id, quantity: 1 }], attemptKey),
      ),
    ]);

    expect(results.every((result) => result.success)).toBe(true);
    expect(results[0].orderId).toBe(results[1].orderId);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.stockReservation.count()).toBe(1);
    expect((await readStock(stockItem.id)).reserved).toBe(1);
  });

  it("never reserves twice when the same attempt key is submitted again", async () => {
    const drop = await createDrop({ status: "ACTIVE" });
    const { product, stockItem } = await seedTrackedProduct(
      drop.id,
      "Camisa",
      5,
    );
    const attemptKey = randomUUID();
    const items = [{ productId: product.id, quantity: 1 }];

    const first = await createOrder(checkoutPayload(items, attemptKey));
    const second = await createOrder(checkoutPayload(items, attemptKey));

    expect(first.success).toBe(true);
    expect(second.orderId).toBe(first.orderId);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.stockReservation.count()).toBe(1);
    expect((await readStock(stockItem.id)).reserved).toBe(1);
  });

  it("keeps the counters within their limits when more orders arrive than units exist", async () => {
    const drop = await createDrop({ status: "ACTIVE" });
    const { product, stockItem } = await seedTrackedProduct(
      drop.id,
      "Camisa Limitada",
      3,
    );
    const parties = 6;
    holdCataloguesUntilAllLoaded(parties);

    const results = await Promise.all(
      Array.from({ length: parties }, () =>
        createOrder(checkoutPayload([{ productId: product.id, quantity: 1 }])),
      ),
    );

    const succeeded = results.filter((result) => result.success);
    expect(succeeded).toHaveLength(3);
    for (const result of results.filter((entry) => !entry.success)) {
      expect(result.error).toContain("Camisa Limitada");
    }

    const stock = await readStock(stockItem.id);
    expect(stock.reserved).toBe(3);
    expect(stock.reserved).toBeGreaterThanOrEqual(0);
    expect(stock.reserved).toBeLessThanOrEqual(stock.onHand);
    expect(await prisma.order.count()).toBe(3);
    expect(await prisma.stockReservation.count()).toBe(3);
  });

  it("does not deadlock when overlapping carts list the same products in opposite orders", async () => {
    const drop = await createDrop({ status: "ACTIVE" });
    const a = await seedTrackedProduct(drop.id, "Camisa", 10);
    const b = await seedTrackedProduct(drop.id, "Moletom", 10);
    const pairs = 4;
    holdCataloguesUntilAllLoaded(pairs * 2);

    const forward = [
      { productId: a.product.id, quantity: 1 },
      { productId: b.product.id, quantity: 1 },
    ];
    const backward = [...forward].reverse();

    const results = await Promise.all(
      Array.from({ length: pairs }, () => [
        createOrder(checkoutPayload(forward)),
        createOrder(checkoutPayload(backward)),
      ]).flat(),
    );

    expect(results.every((result) => result.success)).toBe(true);
    expect((await readStock(a.stockItem.id)).reserved).toBe(pairs * 2);
    expect((await readStock(b.stockItem.id)).reserved).toBe(pairs * 2);
    expect(await prisma.order.count()).toBe(pairs * 2);
    expect(await prisma.stockReservation.count()).toBe(pairs * 4);
  });
});
