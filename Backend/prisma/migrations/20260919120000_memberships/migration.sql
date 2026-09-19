-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "MembershipSource" AS ENUM ('razorpay', 'wallet', 'admin_grant');

-- AlterTable
ALTER TABLE "food_orders" ADD COLUMN     "membershipDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "membershipId" VARCHAR(24),
ADD COLUMN     "membershipSavings" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "food_membership_plans" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "name" VARCHAR(64) NOT NULL,
    "tagline" VARCHAR(160) NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "badgeColor" VARCHAR(16) NOT NULL DEFAULT '#D4A017',
    "price" DECIMAL(14,2) NOT NULL,
    "originalPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "freeDelivery" BOOLEAN NOT NULL DEFAULT true,
    "freeDeliveryMinOrder" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freeDeliveryMaxKm" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "extraDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maxDiscountPerOrder" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountMinOrder" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "stackWithCoupons" BOOLEAN NOT NULL DEFAULT true,
    "waivePlatformFee" BOOLEAN NOT NULL DEFAULT false,
    "waiveSurge" BOOLEAN NOT NULL DEFAULT false,
    "cashbackPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maxCashbackPerOrder" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "restaurantScope" "RestaurantScope" NOT NULL DEFAULT 'all',
    "restaurantIds" TEXT[],
    "extraPerks" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_user_memberships" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "userId" VARCHAR(24) NOT NULL,
    "planId" VARCHAR(24) NOT NULL,
    "planName" VARCHAR(64) NOT NULL,
    "perks" JSONB NOT NULL,
    "pricePaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "source" "MembershipSource" NOT NULL DEFAULT 'razorpay',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paymentRef" VARCHAR(128),
    "grantedBy" VARCHAR(24),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_user_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_membership_plans_isActive_sortOrder_idx" ON "food_membership_plans"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "food_user_memberships_paymentRef_key" ON "food_user_memberships"("paymentRef");

-- CreateIndex
CREATE INDEX "food_user_memberships_userId_status_expiresAt_idx" ON "food_user_memberships"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "food_user_memberships_planId_idx" ON "food_user_memberships"("planId");

-- CreateIndex
CREATE INDEX "food_user_memberships_expiresAt_idx" ON "food_user_memberships"("expiresAt");

-- AddForeignKey
ALTER TABLE "food_user_memberships" ADD CONSTRAINT "food_user_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "food_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_user_memberships" ADD CONSTRAINT "food_user_memberships_planId_fkey" FOREIGN KEY ("planId") REFERENCES "food_membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

