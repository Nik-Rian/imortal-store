-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);
