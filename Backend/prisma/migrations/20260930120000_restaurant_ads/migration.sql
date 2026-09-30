-- Restaurant advertisements: paid "Promoted" placement, admin-approved.
CREATE TYPE "AdStatus" AS ENUM ('awaiting_payment', 'pending_approval', 'approved', 'rejected', 'cancelled', 'stopped');
CREATE TYPE "AdPaymentMode" AS ENUM ('prepaid', 'postpaid');
CREATE TYPE "AdPaymentStatus" AS ENUM ('unpaid', 'paid', 'postpaid', 'refunded', 'partially_refunded');

CREATE TABLE "food_restaurant_ads" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "restaurantId" VARCHAR(24) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "dailyBudget" DECIMAL(14,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "chargedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentMode" "AdPaymentMode" NOT NULL,
    "paymentStatus" "AdPaymentStatus" NOT NULL DEFAULT 'unpaid',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundId" TEXT,
    "status" "AdStatus" NOT NULL DEFAULT 'awaiting_payment',
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "estimatedVisits" INTEGER NOT NULL DEFAULT 0,
    "estimatedReach" INTEGER NOT NULL DEFAULT 0,
    "estimatedOrders" INTEGER NOT NULL DEFAULT 0,
    "menuVisits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "food_restaurant_ads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "food_restaurant_ads_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "food_restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "food_restaurant_ads_dates_valid" CHECK ("endDate" > "startDate" AND "days" > 0),
    CONSTRAINT "food_restaurant_ads_amounts_valid" CHECK ("dailyBudget" > 0 AND "totalAmount" > 0 AND "chargedAmount" >= 0 AND "chargedAmount" <= "totalAmount" AND "refundedAmount" >= 0)
);

CREATE UNIQUE INDEX "food_restaurant_ads_razorpayPaymentId_key" ON "food_restaurant_ads"("razorpayPaymentId");
CREATE INDEX "food_restaurant_ads_status_startDate_endDate_idx" ON "food_restaurant_ads"("status", "startDate", "endDate");
CREATE INDEX "food_restaurant_ads_restaurantId_createdAt_idx" ON "food_restaurant_ads"("restaurantId", "createdAt");
