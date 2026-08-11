CREATE TABLE "merchants" (
	"address" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"sub_id" text NOT NULL,
	"subscriber" text NOT NULL,
	"plan_id" bigint NOT NULL,
	"amount" numeric NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	CONSTRAINT "payments_tx_hash_log_index_unique" UNIQUE("tx_hash","log_index")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"plan_id" bigint PRIMARY KEY NOT NULL,
	"merchant" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric NOT NULL,
	"interval" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"sub_id" text PRIMARY KEY NOT NULL,
	"subscriber" text NOT NULL,
	"plan_id" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL
);
