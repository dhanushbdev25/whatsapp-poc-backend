ALTER TABLE "customer_group_members" ALTER COLUMN "customer_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "customer_master" ALTER COLUMN "customer_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ALTER COLUMN "customer_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ALTER COLUMN "customer_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "customer_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "customer_id" SET DATA TYPE bigint;