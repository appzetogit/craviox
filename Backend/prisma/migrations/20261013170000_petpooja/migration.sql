-- Petpooja POS integration: partner config, restaurant links, id maps, order pushes, activity log.
CREATE TABLE "petpooja_config" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "appKey" TEXT NOT NULL DEFAULT '',
    "appSecret" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "saveOrderUrl" TEXT NOT NULL DEFAULT '',
    "updateOrderStatusUrl" TEXT NOT NULL DEFAULT '',
    "fetchMenuUrl" TEXT NOT NULL DEFAULT '',
    "webhookToken" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "petpooja_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_restaurant_links" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "restaurantId" VARCHAR(24) NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'petpooja',
    "externalRestId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "syncMenu" BOOLEAN NOT NULL DEFAULT true,
    "pushOrders" BOOLEAN NOT NULL DEFAULT true,
    "lastMenuSyncAt" TIMESTAMP(3),
    "lastMenuSyncStatus" TEXT NOT NULL DEFAULT '',
    "lastMenuSyncNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pos_restaurant_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_entity_maps" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "restaurantId" VARCHAR(24) NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "localId" VARCHAR(24) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pos_entity_maps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_order_links" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "orderId" VARCHAR(24) NOT NULL,
    "restaurantId" VARCHAR(24) NOT NULL,
    "externalOrderId" TEXT NOT NULL DEFAULT '',
    "pushStatus" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "posStatus" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pos_order_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_event_logs" (
    "id" VARCHAR(24) NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
    "restaurantId" VARCHAR(24),
    "orderId" VARCHAR(24),
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_event_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_restaurant_links_restaurantId_key" ON "pos_restaurant_links"("restaurantId");
CREATE UNIQUE INDEX "pos_restaurant_links_externalRestId_key" ON "pos_restaurant_links"("externalRestId");
CREATE UNIQUE INDEX "pos_entity_maps_restaurantId_kind_externalId_key" ON "pos_entity_maps"("restaurantId", "kind", "externalId");
CREATE INDEX "pos_entity_maps_restaurantId_kind_localId_idx" ON "pos_entity_maps"("restaurantId", "kind", "localId");
CREATE UNIQUE INDEX "pos_order_links_orderId_key" ON "pos_order_links"("orderId");
CREATE INDEX "pos_order_links_restaurantId_createdAt_idx" ON "pos_order_links"("restaurantId", "createdAt" DESC);
CREATE INDEX "pos_order_links_pushStatus_createdAt_idx" ON "pos_order_links"("pushStatus", "createdAt" DESC);
CREATE INDEX "pos_event_logs_createdAt_idx" ON "pos_event_logs"("createdAt" DESC);
CREATE INDEX "pos_event_logs_restaurantId_createdAt_idx" ON "pos_event_logs"("restaurantId", "createdAt" DESC);
CREATE INDEX "pos_event_logs_ok_createdAt_idx" ON "pos_event_logs"("ok", "createdAt" DESC);

ALTER TABLE "pos_restaurant_links" ADD CONSTRAINT "pos_restaurant_links_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "food_restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
