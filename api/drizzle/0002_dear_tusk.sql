CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"merchant" text,
	"subscriber" text,
	"sub_id" text,
	"plan_id" bigint,
	"price" bigint,
	"amount" bigint,
	"interval" bigint,
	"expires_at" timestamp with time zone,
	"active" boolean,
	"name" text
);
--> statement-breakpoint
DROP TABLE "plans" CASCADE;--> statement-breakpoint
DROP TABLE "subscriptions" CASCADE;