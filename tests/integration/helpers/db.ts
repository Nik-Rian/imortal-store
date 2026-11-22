import { randomUUID } from "node:crypto";
import { PrismaClient, type DropStatus } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function getTestDatabaseUrl(): string {
  const connectionString = process.env.TEST_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'TEST_DATABASE_URL is not defined. Point it at a disposable database whose name contains "test".',
    );
  }

  return connectionString;
}

// The truncate helper destroys all application data, so the guard runs before any
// connection is opened and again before every truncation.
export function assertSafeTestDatabaseUrl(connectionString: string): void {
  let databaseName: string;

  try {
    databaseName = decodeURIComponent(
      new URL(connectionString).pathname.replace(/^\//, ""),
    );
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid connection string.");
  }

  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to run integration tests: database name "${databaseName}" does not contain "test".`,
    );
  }
}

let client: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  if (!client) {
    const connectionString = getTestDatabaseUrl();
    assertSafeTestDatabaseUrl(connectionString);

    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
  }

  return client;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

// Table names are read from the catalog so tables added by later migrations are
// cleaned without changing this helper. Prisma's migration history is preserved.
export async function truncateAllTables(): Promise<void> {
  assertSafeTestDatabaseUrl(getTestDatabaseUrl());
  const prisma = getTestPrisma();

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const tableList = tables
    .map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} CASCADE`);
}

type DropOverrides = Partial<{
  name: string;
  slug: string;
  status: DropStatus;
}>;

// Defaults to CONCLUDED because the database allows a single ACTIVE drop and
// createProduct() creates a drop implicitly. Tests that need an active drop
// must pass status: "ACTIVE" and create at most one at a time.
export async function createDrop(overrides: DropOverrides = {}) {
  const suffix = randomUUID();

  return getTestPrisma().drop.create({
    data: {
      name: `Test Drop ${suffix}`,
      slug: `test-drop-${suffix}`,
      status: "CONCLUDED",
      ...overrides,
    },
  });
}

type ProductOverrides = Partial<{
  dropId: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  controlStock: boolean;
  isBundle: boolean;
}>;

// A drop is created automatically when no dropId is supplied.
export async function createProduct(overrides: ProductOverrides = {}) {
  const suffix = randomUUID();
  const dropId = overrides.dropId ?? (await createDrop()).id;

  return getTestPrisma().product.create({
    data: {
      name: `Test Product ${suffix}`,
      slug: `test-product-${suffix}`,
      description: "Test product",
      priceCents: 1000,
      ...overrides,
      dropId,
    },
  });
}

type StockItemOverrides = Partial<{
  productId: string;
  variantId: string;
  sizeId: string;
  stockKey: string;
  onHand: number;
  reserved: number;
}>;

// A product is created automatically when no productId is supplied. The default
// stockKey is only unique, it does not follow the application's key format; tests
// that depend on that format must pass stockKey explicitly.
export async function createStockItem(overrides: StockItemOverrides = {}) {
  const productId = overrides.productId ?? (await createProduct()).id;

  return getTestPrisma().stockItem.create({
    data: {
      stockKey: `test-stock-key-${randomUUID()}`,
      ...overrides,
      productId,
    },
  });
}

type OrderOverrides = Partial<{
  accessToken: string;
  customerName: string;
  totalPriceCents: number;
  cancelableUntil: Date;
  idempotencyKey: string;
}>;

export async function createOrder(overrides: OrderOverrides = {}) {
  return getTestPrisma().order.create({
    data: {
      accessToken: randomUUID(),
      customerName: "Test Customer",
      totalPriceCents: 1000,
      cancelableUntil: new Date(Date.now() + 60 * 60 * 1000),
      ...overrides,
    },
  });
}
