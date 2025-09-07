/*
  Warnings:

  - Added the required column `marginCents` to the `ExistingTrade` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."ExistingTrade" ADD COLUMN     "marginCents" INTEGER NOT NULL;
