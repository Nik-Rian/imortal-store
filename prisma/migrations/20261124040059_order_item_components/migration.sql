-- CreateTable
CREATE TABLE "OrderItemComponent" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "variantName" TEXT,
    "sizeLabel" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderItemComponent_orderItemId_idx" ON "OrderItemComponent"("orderItemId");

-- AddForeignKey
ALTER TABLE "OrderItemComponent" ADD CONSTRAINT "OrderItemComponent_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemComponent" ADD CONSTRAINT "OrderItemComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
