-- Rebrand: Minto Foods -> Craviox.
--
-- Same shape as 20260826130000_rebrand_business_settings_defaults: move the
-- defaults, and rewrite the singleton row only where it still holds the old
-- default nobody chose.
ALTER TABLE "food_business_settings" ALTER COLUMN "companyName" SET DEFAULT 'Craviox';
ALTER TABLE "food_business_settings" ALTER COLUMN "email" SET DEFAULT 'admin@craviox.com';

UPDATE "food_business_settings" SET "companyName" = 'Craviox' WHERE "companyName" = 'Minto Foods';
UPDATE "food_business_settings" SET "email" = 'admin@craviox.com' WHERE "email" = 'admin@mintofood.com';
