-- Normalize rows created while any quantity >= 1 was accepted.
UPDATE "BundleComponent" SET "quantity" = 1 WHERE "quantity" <> 1;

-- A bundle unit holds exactly one unit of each component.
ALTER TABLE "BundleComponent" DROP CONSTRAINT "BundleComponent_quantity_check";
ALTER TABLE "BundleComponent" ADD CONSTRAINT "BundleComponent_quantity_check" CHECK ("quantity" = 1);
