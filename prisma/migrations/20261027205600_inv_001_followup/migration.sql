-- Restore hasSizes for products with existing size rows
UPDATE "Product" SET "hasSizes" = true
WHERE EXISTS (
  SELECT 1
  FROM "ProductSize" ps
  WHERE ps."productId" = "Product"."id"
);

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_orderId_stockItemId_key"
  ON "StockReservation"("orderId", "stockItemId");

-- AddForeignKey
ALTER TABLE "StockReservation"
  ADD CONSTRAINT "StockReservation_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
