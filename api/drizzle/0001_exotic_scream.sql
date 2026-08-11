ALTER TABLE "payments" DROP CONSTRAINT "payments_tx_hash_log_index_unique";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "id" SET DATA TYPE text;