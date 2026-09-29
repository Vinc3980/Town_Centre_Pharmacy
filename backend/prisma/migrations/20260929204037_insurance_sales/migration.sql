-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('retail', 'insurance');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('pending', 'submitted', 'approved', 'rejected');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'insurance';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "claimStatus" "ClaimStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "insuranceProvider" TEXT,
ADD COLUMN     "policyOrNhisNumber" TEXT,
ADD COLUMN     "saleType" "SaleType" NOT NULL DEFAULT 'retail';
