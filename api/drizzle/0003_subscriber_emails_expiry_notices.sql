CREATE TABLE IF NOT EXISTS "expiry_notices" (
	"sub_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expiry_notices_sub_id_expires_at_pk" PRIMARY KEY("sub_id","expires_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriber_emails" (
	"address" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"confirm_token" text,
	"confirmed_at" timestamp with time zone
);