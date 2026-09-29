-- Rider self-service account deletion becomes a soft delete: the partner row,
-- payouts, deposits and history are kept, and the row is marked instead.
ALTER TABLE "food_delivery_partners" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "food_delivery_partners" ADD COLUMN "deletedPhone" VARCHAR(20);
ALTER TABLE "food_delivery_partners" ADD COLUMN "deletedVehicleNumber" TEXT;
