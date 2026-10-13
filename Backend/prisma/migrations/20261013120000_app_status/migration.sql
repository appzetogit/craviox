-- Admin-controlled launch state per app: coming soon, maintenance, force update, banner.
CREATE TABLE "food_app_status" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "app" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_app_status_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "food_app_status_app_key" ON "food_app_status"("app");
