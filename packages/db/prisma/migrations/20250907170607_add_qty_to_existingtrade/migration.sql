/*
  Warnings:

  - Added the required column `qty` to the `ExistingTrade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `side` to the `ExistingTrade` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."ExistingTrade" ADD COLUMN     "qty" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "side" "public"."Side" NOT NULL;
