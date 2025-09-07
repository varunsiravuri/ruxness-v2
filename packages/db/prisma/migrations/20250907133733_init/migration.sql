-- CreateEnum
CREATE TYPE "public"."Side" AS ENUM ('long', 'short');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lastLoggedIn" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Asset" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExistingTrade" (
    "id" TEXT NOT NULL,
    "openPrice" DOUBLE PRECISION NOT NULL,
    "closePrice" DOUBLE PRECISION,
    "leverage" DOUBLE PRECISION NOT NULL,
    "pnl" DOUBLE PRECISION,
    "liquidated" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExistingTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_symbol_key" ON "public"."Asset"("symbol");

-- AddForeignKey
ALTER TABLE "public"."ExistingTrade" ADD CONSTRAINT "ExistingTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExistingTrade" ADD CONSTRAINT "ExistingTrade_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
