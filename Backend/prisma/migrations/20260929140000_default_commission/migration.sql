-- Platform-wide commission for "Overall commission" restaurants with no rate of their own.
ALTER TABLE "food_business_settings" ADD COLUMN "defaultCommissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 15;
