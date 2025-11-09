-- Add column as nullable first
ALTER TABLE "products" ADD COLUMN "content_id" varchar(100);

-- Update existing rows with a default value (using empty string or generate from id)
UPDATE "products" SET "content_id" = '' WHERE "content_id" IS NULL;

-- Now make it NOT NULL
ALTER TABLE "products" ALTER COLUMN "content_id" SET NOT NULL;