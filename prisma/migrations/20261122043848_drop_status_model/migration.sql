-- CreateEnum
CREATE TYPE "DropStatus" AS ENUM ('ACTIVE', 'CONCLUDED');

-- AlterTable
ALTER TABLE "Drop"
  ADD COLUMN "status" "DropStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "concludedAt" TIMESTAMP(3);

-- Backfill: the most recently created drop whose window is still in the future
-- stays ACTIVE; every other drop becomes CONCLUDED. When no drop qualifies, the
-- subquery yields NULL and every drop is concluded.
UPDATE "Drop"
SET "status" = 'CONCLUDED',
    "concludedAt" = LEAST("endsAt", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
WHERE "id" IS DISTINCT FROM (
  SELECT "id"
  FROM "Drop"
  WHERE "endsAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  ORDER BY "createdAt" DESC, "id" DESC
  LIMIT 1
);

-- At most one ACTIVE drop may exist. Prisma cannot model partial indexes, so
-- the invariant is enforced here, at database level.
CREATE UNIQUE INDEX "Drop_single_active_key" ON "Drop" ("status") WHERE "status" = 'ACTIVE';

-- Dropping the columns also removes their indexes and any table constraint
-- that references them.
ALTER TABLE "Drop" DROP COLUMN "startsAt", DROP COLUMN "endsAt";
