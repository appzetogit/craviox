-- Customer delivery fee = band fee + userPerKm × trip distance.
ALTER TABLE "delivery_fee_bands" ADD COLUMN "userPerKm" DECIMAL(14,2) NOT NULL DEFAULT 0;
