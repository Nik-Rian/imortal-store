-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isBundle" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BundleComponent" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BundleComponent_componentProductId_idx" ON "BundleComponent"("componentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "BundleComponent_bundleId_componentProductId_key" ON "BundleComponent"("bundleId", "componentProductId");

-- AddForeignKey
ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity checks Prisma cannot express
ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_quantity_check" CHECK ("quantity" >= 1);
ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_not_self_check" CHECK ("bundleId" <> "componentProductId");
