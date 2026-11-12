CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"type" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"source" varchar(20) DEFAULT 'manual' NOT NULL,
	"source_ref" varchar(128),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1.00',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_memories_user_status" ON "memories" USING btree ("user_id","status","updated_at");